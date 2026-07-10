import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InternalEvent, type PersonUnknownPayload } from '../../internal-events/internal-events';
import { DevicesService } from '../devices/devices.service';
import { VisitsService } from '../visits/visits.service';
import { AlertsService } from './alerts.service';
import { INCIDENT_REPOSITORY, type IncidentRepository } from './incident.repository';
import { buildStrangerAlertMessage } from './stranger-alert-message';
import type { SightingKind, SightingReason } from './sighting-decision.entity';
import { SIGHTING_REPOSITORY, type SightingRepository } from './sighting.repository';

/**
 * How long after a system-initiated 112 call an unknown person may still be treated as
 * an expected emergency responder. Responders arrive after the call, not during it, so
 * the window outlives the incident's active phase. Two hours is generous but bounded —
 * trust never lingers indefinitely.
 */
const EMERGENCY_EXPECTATION_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * The stranger/uniform context rule (F2.4), implementing rule #5: uniforms are context,
 * never trust. When a guardian sees an unknown person, this decides — deterministically,
 * never with a model — whether they were expected:
 *
 *   1. an active system-initiated emergency for the device (responders are expected), or
 *   2. a visit the family pre-logged that covers the moment.
 *
 * Anything else is a stranger. A uniform read from the device NEVER grants trust — it is
 * only recorded, and stated as plain context in the alert. Every judgement is written to
 * the append-only trail, so a suppression can never exist without its justifying reason
 * in the log. A stranger sends a critical alert to the family's registered devices.
 *
 * Best-effort, like the fall trigger: the sighting is already in the event stream; if
 * this handler fails it logs and returns rather than throwing back into ingestion.
 */
@Injectable()
export class StrangerEvaluatorService {
  private readonly logger = new Logger(StrangerEvaluatorService.name);

  constructor(
    private readonly devices: DevicesService,
    private readonly visits: VisitsService,
    private readonly alerts: AlertsService,
    @Inject(INCIDENT_REPOSITORY) private readonly incidents: IncidentRepository,
    @Inject(SIGHTING_REPOSITORY) private readonly sightings: SightingRepository,
  ) {}

  @OnEvent(InternalEvent.PersonUnknown)
  async onPersonUnknown(payload: PersonUnknownPayload): Promise<void> {
    try {
      const device = await this.devices.findById(payload.deviceId);
      if (!device) {
        this.logger.error(
          `Unknown person from unregistered device ${payload.deviceId}; cannot resolve a family`,
        );
        return;
      }

      const { decision, reason, visitLabel } = await this.decide(device.familyId, payload);

      await this.sightings.append({
        familyId: device.familyId,
        deviceId: payload.deviceId,
        eventId: payload.eventId,
        at: payload.occurredAt,
        uniformed: payload.uniformed,
        decision,
        reason,
        visitLabel,
      });

      if (decision === 'stranger') {
        this.logger.warn(
          `Stranger at family ${device.familyId} device ${payload.deviceId}` +
            `${payload.uniformed ? ' (appears uniformed)' : ''}; no active emergency, no expected visit`,
        );
        // Uniform is stated as plain context in the copy, never as a verdict. The volume
        // is governed by the device emitting person.unknown as a debounced presence
        // event, not per frame; a backend rate-limit is a noted follow-up.
        await this.alerts.raise({
          familyId: device.familyId,
          deviceId: payload.deviceId,
          kind: 'stranger',
          message: buildStrangerAlertMessage(payload.uniformed),
          ref: payload.eventId,
          at: payload.occurredAt,
        });
      } else {
        this.logger.log(
          `Unknown person at family ${device.familyId} treated as expected (${reason})`,
        );
      }
    } catch (error) {
      // Never throw out of an event handler; the sighting is already durably recorded.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to evaluate unknown person ${payload.eventId}: ${message}`);
    }
  }

  /**
   * The rule. Order matters only for which reason is recorded; both emergency and a
   * covering visit independently make the person expected. A uniform is never consulted.
   */
  private async decide(
    familyId: string,
    payload: PersonUnknownPayload,
  ): Promise<{ decision: SightingKind; reason: SightingReason; visitLabel: string | null }> {
    const since = new Date(
      new Date(payload.occurredAt).getTime() - EMERGENCY_EXPECTATION_WINDOW_MS,
    ).toISOString();
    if (await this.incidents.hasRecentEmergencyForDevice(payload.deviceId, since)) {
      return { decision: 'expected', reason: 'system_emergency', visitLabel: null };
    }
    const covering = await this.visits.covering(familyId, payload.occurredAt);
    if (covering.length > 0) {
      return {
        decision: 'expected',
        reason: 'expected_visit',
        visitLabel: covering[0]!.visitorLabel,
      };
    }
    return { decision: 'stranger', reason: 'none', visitLabel: null };
  }
}
