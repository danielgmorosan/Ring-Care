import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventType } from '@obrigada/shared';
import { AppConfig } from '../../config/env.validation';
import {
  InternalEvent,
  type FallDetectedPayload,
  type VoiceCheckinReportedPayload,
} from '../../internal-events/internal-events';
import { DevicesService } from '../devices/devices.service';
import { EventsService } from '../events/events.service';
import { EscalationService } from './escalation.service';
import { INCIDENT_REPOSITORY, type IncidentRepository } from './incident.repository';

/**
 * The wire from detection to response: when the events module reports a confirmed
 * fall on the internal bus, this starts the durable escalation ladder for the
 * device's family. This is what makes the pipeline autonomous — a fall summons help
 * without anyone pressing a button (rule #3: the deterministic workflow, not an LLM,
 * decides who is contacted).
 *
 * Best-effort by design: the fall is already durably recorded in the append-only
 * stream before this runs. If escalation cannot start (engine not configured, unknown
 * device, transient error), this logs and returns rather than throwing back into the
 * ingestion path — ingestion must never fail because response wiring hiccuped.
 */
@Injectable()
export class EscalationTriggerService {
  private readonly logger = new Logger(EscalationTriggerService.name);

  constructor(
    private readonly config: AppConfig,
    private readonly devices: DevicesService,
    private readonly escalation: EscalationService,
    private readonly events: EventsService,
    @Inject(INCIDENT_REPOSITORY) private readonly incidents: IncidentRepository,
  ) {}

  @OnEvent(InternalEvent.FallDetected)
  async onFallDetected(payload: FallDetectedPayload): Promise<void> {
    try {
      if (!this.config.hasTemporal) {
        // The fall is recorded; without the engine the ladder cannot run. Loud, so a
        // misconfigured deployment is caught by the canary and ops, not silently.
        this.logger.error(
          `Fall on device ${payload.deviceId} recorded but escalation engine is not ` +
            `configured; no ladder started`,
        );
        return;
      }

      const device = await this.devices.findById(payload.deviceId);
      if (!device) {
        this.logger.error(
          `Fall from unknown device ${payload.deviceId}; cannot resolve a family to escalate`,
        );
        return;
      }

      // De-duplicate: a suspected fall that is then confirmed (or repeated detections)
      // must not open a second incident. Keyed on an incident still being ACTIVE, not
      // a time window — so a genuine new fall after the first resolved always escalates
      // (rule: missed falls stay zero).
      if (await this.incidents.hasActiveForDevice(payload.deviceId)) {
        this.logger.log(
          `Device ${payload.deviceId} already has an active incident; ` +
            `skipping duplicate escalation for ${payload.type}`,
        );
        return;
      }

      // F3.1 (decision 0007): the VLM second opinion may only ESCALATE, never suppress.
      // If a confirming verdict is already on record for this event, treat a suspected
      // fall with the urgency of a confirmed one. A confirmed fall is never downgraded;
      // a refuted/uncertain verdict changes nothing. So a verdict can only ever make
      // help arrive sooner — never turn a real fall into a missed one.
      const vlmConfirms = await this.vlmConfirms(payload.deviceId, payload.eventId);
      const confirmedFall = payload.type === EventType.FallConfirmed || vlmConfirms;

      const { incidentId } = await this.escalation.startEscalation({
        familyId: device.familyId,
        deviceId: payload.deviceId,
        reason: payload.type,
        triggeringEventId: payload.eventId,
        // A confirmed fall (or a suspected one the VLM confirmed) overrides quiet hours.
        confirmedFall,
      });
      this.logger.log(
        `Started escalation ${incidentId} for family ${device.familyId} from ${payload.type} ` +
          `${payload.eventId}${vlmConfirms ? ' (VLM confirmed; urgency upgraded)' : ''}`,
      );
    } catch (error) {
      // Never throw out of an event handler; the fall is already durably recorded.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to start escalation for fall ${payload.eventId}: ${message}`);
    }
  }

  /**
   * The guardian's on-device voice check-in came back (F1.3). Signal the device's open
   * incident with the elder's answer so the ladder can stand down (i_am_fine) or press on
   * (distress/silence). Best-effort: the result is already in the append-only stream, and
   * a missing engine or no-open-incident is handled downstream, never thrown.
   */
  @OnEvent(InternalEvent.VoiceCheckinReported)
  async onVoiceCheckinReported(payload: VoiceCheckinReportedPayload): Promise<void> {
    try {
      if (!this.config.hasTemporal) return;
      await this.escalation.recordDeviceCheckin(payload.deviceId, payload.result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to deliver on-device check-in for ${payload.deviceId}: ${message}`);
    }
  }

  /** Whether the on-device VLM has confirmed this flagged event (F3.1, decision 0007). */
  private async vlmConfirms(deviceId: string, eventId: string): Promise<boolean> {
    const opinions = await this.events.secondOpinionsFor(deviceId, eventId);
    return opinions.some((o) => o.verdict === 'confirmed');
  }
}
