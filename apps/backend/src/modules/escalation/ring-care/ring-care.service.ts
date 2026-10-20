import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AppConfig } from '../../../config/env.validation';
import { InternalEvent, type RingActivityPayload } from '../../../internal-events/internal-events';
import { FamiliesService } from '../../families/families.service';
import { minutesSinceMidnightInZone } from '../../families/timezone';
import { VisitArrivalsService } from '../../visits/visit-arrivals.service';
import { AlertsService } from '../alerts.service';
import { CONTACT_REPOSITORY, type ContactRepository } from '../contact.repository';
import { EscalationService } from '../escalation.service';
import {
  INCIDENT_REPOSITORY,
  TERMINAL_STEP_KINDS,
  type IncidentRepository,
} from '../incident.repository';
import {
  NIGHT_DOOR_REASON,
  shouldSkipForQuietHours,
  withinWindow,
  type EscalationContact,
} from '../temporal/types';
import {
  buildNightDoorAlertMessage,
  buildNightDoorCallMessage,
  buildNightDoorMessage,
  buildNightDoorUnansweredMessage,
  type RingActivityKind,
} from './night-door-message';
import {
  RING_CARE_DECISION_REPOSITORY,
  type RingCareDecision,
  type RingCareDecisionRepository,
  type RingInterpretation,
} from './ring-care-decision.repository';

/**
 * Repeated front-door activity within this many minutes of a night door response joins
 * it instead of opening another (Ring often sends motion and a ding together, and a
 * person lingering at the door keeps triggering motion).
 */
export const NIGHT_DOOR_DEDUPE_MINUTES = 10;

/** Ring Smart Alert label for a person. Anything else (vehicle, package) is not a person. */
const HUMAN_SUBTYPE = 'human';

/**
 * What a Ring event MEANS for the family (decision 0011). A deterministic rule over the
 * event's labels, the household's night window and its expected visits; no LLM output
 * takes part (rule #3). Only `front_door` cameras are considered.
 *
 *  1. Not a person (vehicle, package delivery, plain motion): timeline only.
 *  2. A person inside an expected visit's window: the visitor arrived (one per visit).
 *     Activity during a visit never opens an incident, even at night.
 *  3. A person in the night window (RING_NIGHT_START..RING_NIGHT_END, household clock,
 *     wrapping past midnight): open a `door.night_activity` incident on the family-only
 *     ladder (no voice check-in, never emergency services), or join the open one.
 *  4. Otherwise (daytime): timeline only.
 *
 * Every judgement is recorded, append-only, in ring_care_decisions: the audit of why an
 * incident was or was not opened (rule #7), the idempotency key for a redelivered event,
 * and the source of interpretRingEvent() for the Ring activity feed.
 *
 * Best-effort on the event path: the Ring event is already durably recorded by the ring
 * module before this runs, so a failure here logs and returns rather than throwing.
 */
@Injectable()
export class RingCareService {
  private readonly logger = new Logger(RingCareService.name);
  /** Per-family serialization, so a motion and a ding arriving together open one incident. */
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly config: AppConfig,
    private readonly families: FamiliesService,
    private readonly visitArrivals: VisitArrivalsService,
    private readonly escalation: EscalationService,
    private readonly alerts: AlertsService,
    @Inject(INCIDENT_REPOSITORY) private readonly incidents: IncidentRepository,
    @Inject(CONTACT_REPOSITORY) private readonly contacts: ContactRepository,
    @Inject(RING_CARE_DECISION_REPOSITORY) private readonly decisions: RingCareDecisionRepository,
  ) {}

  @OnEvent(InternalEvent.RingMotionDetected)
  onMotion(payload: RingActivityPayload): Promise<void> {
    return this.handle(payload, 'motion');
  }

  @OnEvent(InternalEvent.RingButtonPressed)
  onButtonPressed(payload: RingActivityPayload): Promise<void> {
    return this.handle(payload, 'ding');
  }

  /**
   * What the Ring event meant for the family, for the Ring activity feed
   * (GET /me/ring/activity `interpretation`): 'night_door' when it opened or joined a
   * night door response, 'visit_arrival' when it recorded an expected visitor's arrival,
   * else null (daytime, not a person, not the front door, or not yet judged).
   */
  async interpretRingEvent(ringEventId: string): Promise<RingInterpretation | null> {
    const decision = await this.decisions.findByRingEvent(ringEventId);
    return decision?.interpretation ?? null;
  }

  /** Judge one event. Serialized per family; never throws. */
  handle(payload: RingActivityPayload, kind: RingActivityKind): Promise<void> {
    const previous = this.queues.get(payload.familyId) ?? Promise.resolve();
    const next = previous.then(() => this.judge(payload, kind));
    const tail = next.finally(() => {
      if (this.queues.get(payload.familyId) === tail) this.queues.delete(payload.familyId);
    });
    this.queues.set(payload.familyId, tail);
    return next;
  }

  private async judge(payload: RingActivityPayload, kind: RingActivityKind): Promise<void> {
    try {
      if (payload.placement !== 'front_door') return;
      if (await this.decisions.findByRingEvent(payload.ringEventId)) return; // redelivered

      const at = new Date(payload.occurredAt).toISOString();
      const base = {
        ringEventId: payload.ringEventId,
        familyId: payload.familyId,
        at,
        incidentId: null,
        visitId: null,
      };

      const isPerson = kind === 'ding' || payload.subType === HUMAN_SUBTYPE;
      if (!isPerson) {
        await this.record({ ...base, interpretation: null, outcome: 'not_a_person' });
        return;
      }

      // An expected visitor at the door. Never an incident, whatever the hour.
      const visits = await this.visitArrivals.inArrivalWindow(payload.familyId, at);
      if (visits.length > 0) {
        for (const visit of visits) {
          if (await this.visitArrivals.record(visit, payload.ringEventId, at)) {
            this.logger.log(`Visit ${visit.id} arrival recorded from Ring ${payload.ringEventId}`);
            await this.record({
              ...base,
              interpretation: 'visit_arrival',
              outcome: 'arrival_recorded',
              visitId: visit.id,
            });
            return;
          }
        }
        await this.record({
          ...base,
          interpretation: null,
          outcome: 'during_visit',
          visitId: visits[0]!.id,
        });
        return;
      }

      const { timezone } = await this.families.findByIdOrFail(payload.familyId);
      const localMinutes = minutesSinceMidnightInZone(at, timezone);
      if (!withinWindow(this.config.ringNightStart, this.config.ringNightEnd, localMinutes)) {
        await this.record({ ...base, interpretation: null, outcome: 'daytime' });
        return;
      }

      const open = await this.openNightDoorResponse(payload.familyId, at);
      if (open) {
        this.logger.log(
          `Night door activity ${payload.ringEventId} joins ${open.incidentId ?? 'the alert'} ` +
            `from ${open.ringEventId}`,
        );
        await this.record({
          ...base,
          interpretation: 'night_door',
          outcome: 'joined_incident',
          incidentId: open.incidentId,
        });
        return;
      }

      await this.startNightDoorResponse(payload, kind, at, timezone, base);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to judge Ring event ${payload.ringEventId}: ${message}`);
    }
  }

  /**
   * The night door response this activity should join: the family's latest one, if it is
   * within the de-duplication window or its incident is still running.
   */
  private async openNightDoorResponse(
    familyId: string,
    at: string,
  ): Promise<RingCareDecision | null> {
    const latest = await this.decisions.latestNightDoorOpener(familyId);
    if (!latest) return null;
    const gapMs = Math.abs(Date.parse(at) - Date.parse(latest.at));
    if (gapMs <= NIGHT_DOOR_DEDUPE_MINUTES * 60_000) return latest;
    if (latest.incidentId && (await this.isActive(latest.incidentId))) return latest;
    return null;
  }

  private async isActive(incidentId: string): Promise<boolean> {
    const terminal = new Set<string>(TERMINAL_STEP_KINDS);
    const kinds = await this.incidents.listStepKinds(incidentId);
    return !kinds.some((k) => terminal.has(k));
  }

  private async startNightDoorResponse(
    payload: RingActivityPayload,
    kind: RingActivityKind,
    at: string,
    timezone: string,
    base: Pick<RingCareDecision, 'ringEventId' | 'familyId' | 'at' | 'incidentId' | 'visitId'>,
  ): Promise<void> {
    if (this.config.hasTemporal) {
      try {
        const contacts = await this.contacts.listByFamily(payload.familyId);
        const { incidentId } = await this.escalation.startEscalation({
          familyId: payload.familyId,
          deviceId: null, // family-level: a Ring camera, not a guardian
          reason: NIGHT_DOOR_REASON,
          triggeringEventId: payload.ringEventId,
          confirmedFall: false,
          messages: {
            device: buildNightDoorMessage(kind, at, timezone, firstCallable(contacts)),
            unanswered: buildNightDoorUnansweredMessage(kind, at, timezone),
            call: buildNightDoorCallMessage(kind, at, timezone),
          },
          timeZone: timezone,
        });
        this.logger.warn(
          `Night door activity ${payload.ringEventId}: opened incident ${incidentId} ` +
            `for family ${payload.familyId}`,
        );
        await this.record({
          ...base,
          interpretation: 'night_door',
          outcome: 'incident_opened',
          incidentId,
        });
        return;
      } catch (error) {
        // Never leave the family uninformed because the engine hiccuped: alert instead.
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Night door ladder failed to start (${message}); alerting family`);
      }
    } else {
      this.logger.error(
        `Night door activity ${payload.ringEventId} for family ${payload.familyId} but the ` +
          `escalation engine is not configured; alerting the family without calls`,
      );
    }

    await this.alerts.raise({
      familyId: payload.familyId,
      deviceId: null,
      kind: NIGHT_DOOR_REASON,
      message: buildNightDoorAlertMessage(kind, at, timezone),
      ref: payload.ringEventId,
      at,
    });
    await this.record({
      ...base,
      interpretation: 'night_door',
      outcome: 'alerted_without_engine',
    });
  }

  private async record(decision: RingCareDecision): Promise<void> {
    await this.decisions.record(decision);
  }
}

/**
 * The name of the first contact the ladder will ring right now, mirroring the workflow's
 * quiet-hours rule. Night door incidents wake contacts through quiet hours
 * (FAMILY_ONLY_ESCALATION_RULES.wakesThroughQuietHours), so the first contact is rung.
 * Used only for the words of the first push; the workflow alone decides who is called.
 */
function firstCallable(contacts: EscalationContact[]): string | null {
  const now = new Date();
  const nowMinutesUtc = now.getUTCHours() * 60 + now.getUTCMinutes();
  const contact = contacts.find((c) => !shouldSkipForQuietHours(c, true, nowMinutesUtc));
  return contact?.name ?? null;
}
