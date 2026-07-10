import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InternalEvent, type ZoneEnteredPayload } from '../../internal-events/internal-events';
import { DevicesService } from '../devices/devices.service';
import { FamiliesService } from '../families/families.service';
import { hourInZone } from '../families/timezone';
import { ZonesService } from '../zones/zones.service';
import { AlertsService } from './alerts.service';
import { buildDoorCrossingMessage, buildZoneAlertMessage } from './zone-alert-message';

/**
 * A crossing is at an "unusual hour" when it falls in the night window in the family's
 * own timezone: from 22:00 up to (not including) 07:00. Coming and going through the
 * front door in the daytime is ordinary; at 3am it is worth a look.
 */
const NIGHT_START_HOUR = 22;
const NIGHT_END_HOUR = 7;

/** True when the local hour-of-day falls in the night window. Pure, for testing. */
export function isUnusualHour(hour: number): boolean {
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
}

/**
 * The red-zone alerting rule (F2.3). Pure geometry ran on-device; this maps a crossing
 * to the family's own zone label and sends a calm critical alert to their devices.
 *
 *   - `hazard` zone (stove, stairs): alert on any entry.
 *   - `door` zone: alert on entry at an unusual hour (the night window, in the family's
 *     timezone) — the wandering signal that someone is at the door at 3am. A daytime
 *     door crossing is ordinary and feeds the exit-without-return timer, a later slice.
 *
 * Best-effort, like the other evaluators: the crossing is already durably recorded; if
 * this handler fails it logs and returns rather than throwing back into ingestion.
 */
@Injectable()
export class ZoneAlertEvaluatorService {
  private readonly logger = new Logger(ZoneAlertEvaluatorService.name);

  constructor(
    private readonly devices: DevicesService,
    private readonly zones: ZonesService,
    private readonly families: FamiliesService,
    private readonly alerts: AlertsService,
  ) {}

  @OnEvent(InternalEvent.ZoneEntered)
  async onZoneEntered(payload: ZoneEnteredPayload): Promise<void> {
    try {
      const device = await this.devices.findById(payload.deviceId);
      if (!device) {
        this.logger.error(
          `Zone entry from unregistered device ${payload.deviceId}; cannot resolve a family`,
        );
        return;
      }

      // Look the zone up among the device's own active zones — this also rejects a
      // crossing that names a zone from another device or one since removed.
      const zones = await this.zones.activeOnDevice(payload.deviceId);
      const zone = zones.find((z) => z.id === payload.zoneId);
      if (!zone) {
        this.logger.log(
          `Zone ${payload.zoneId} not active on device ${payload.deviceId}; ignoring`,
        );
        return;
      }

      if (zone.kind === 'hazard') {
        this.logger.warn(`Hazard zone "${zone.name}" entered at family ${device.familyId}`);
        await this.alerts.raise({
          familyId: device.familyId,
          deviceId: payload.deviceId,
          kind: 'hazard_zone',
          message: buildZoneAlertMessage(zone.name),
          ref: payload.eventId,
          at: payload.occurredAt,
        });
        return;
      }

      // A door zone: only an unusual-hour crossing alerts now. A daytime crossing is
      // ordinary and belongs to the exit-without-return timer (the wander watcher).
      const { timezone } = await this.families.findByIdOrFail(device.familyId);
      if (isUnusualHour(hourInZone(payload.occurredAt, timezone))) {
        this.logger.warn(`Door zone "${zone.name}" crossed at an unusual hour (${timezone})`);
        await this.alerts.raise({
          familyId: device.familyId,
          deviceId: payload.deviceId,
          kind: 'door_unusual_hour',
          message: buildDoorCrossingMessage(zone.name),
          ref: payload.eventId,
          at: payload.occurredAt,
        });
      }
    } catch (error) {
      // Never throw out of an event handler; the crossing is already durably recorded.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to evaluate zone entry ${payload.eventId}: ${message}`);
    }
  }
}
