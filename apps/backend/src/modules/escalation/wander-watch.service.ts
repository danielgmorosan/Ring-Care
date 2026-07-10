import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import { AppConfig } from '../../config/env.validation';
import { InternalEvent, type ZoneExitedPayload } from '../../internal-events/internal-events';
import { DevicesService } from '../devices/devices.service';
import { EventsService } from '../events/events.service';
import { ZonesService } from '../zones/zones.service';
import { AlertsService } from './alerts.service';
import { buildWanderMessage } from './wander-message';
import { WANDER_WATCH_REPOSITORY, type WanderWatchRepository } from './wander-watch.repository';

/**
 * The exit-without-return half of wandering (F2.3). When someone leaves through a
 * `door` zone, this opens a watch for the family's window (default 15 min). A sweep
 * closes each watch when its window ends: if the guardian has seen anyone again since
 * they left, they came back — no alert; otherwise the family is told they have not
 * returned.
 *
 * Crash-safe by design, like the offline sweep: the watch is a Postgres row, so a
 * restart mid-wait loses nothing — the sweep re-reads it and still fires an overdue
 * alert. A "return" is any presence event (recognized or unknown person, or a zone
 * crossing) after they left, read from the append-only event stream, so there is no
 * fragile in-memory cancel to drop.
 *
 * Best-effort on the event path: the exit is already durably recorded; a failure here
 * logs and returns rather than throwing back into ingestion.
 */
@Injectable()
export class WanderWatchService {
  private readonly logger = new Logger(WanderWatchService.name);

  constructor(
    private readonly devices: DevicesService,
    private readonly zones: ZonesService,
    private readonly events: EventsService,
    private readonly alerts: AlertsService,
    private readonly config: AppConfig,
    @Inject(WANDER_WATCH_REPOSITORY) private readonly watches: WanderWatchRepository,
  ) {}

  @OnEvent(InternalEvent.ZoneExited)
  async onZoneExited(payload: ZoneExitedPayload): Promise<void> {
    try {
      const device = await this.devices.findById(payload.deviceId);
      if (!device) return;

      const zones = await this.zones.activeOnDevice(payload.deviceId);
      const zone = zones.find((z) => z.id === payload.zoneId);
      // Only a door exit opens a wander watch; hazard exits are not wandering.
      if (!zone || zone.kind !== 'door') return;

      const dueAt = new Date(
        new Date(payload.occurredAt).getTime() + this.config.wanderWindowSeconds * 1000,
      ).toISOString();
      await this.watches.openOrRefresh({
        deviceId: payload.deviceId,
        familyId: device.familyId,
        doorZoneId: zone.id,
        doorName: zone.name,
        startedAt: payload.occurredAt,
        dueAt,
      });
      this.logger.log(`Watching for a return through "${zone.name}" on device ${payload.deviceId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to open a wander watch for ${payload.eventId}: ${message}`);
    }
  }

  @Interval(30_000)
  async scheduledSweep(): Promise<void> {
    await this.sweep(Date.now());
  }

  /** Close every watch whose window has ended. Exposed (not just the interval) for tests. */
  async sweep(nowMs: number): Promise<void> {
    const due = await this.watches.listDue(new Date(nowMs).toISOString());
    for (const watch of due) {
      try {
        // A return is anyone seen again on this guardian since they left.
        if (await this.events.hasPresenceSince(watch.deviceId, watch.startedAt)) {
          await this.watches.resolve(watch.id, 'returned');
          continue;
        }
        this.logger.warn(
          `No return through "${watch.doorName}" on device ${watch.deviceId}; alerting family`,
        );
        await this.alerts.raise({
          familyId: watch.familyId,
          deviceId: watch.deviceId,
          kind: 'wander',
          message: buildWanderMessage(watch.doorName),
          ref: watch.id,
          at: watch.dueAt,
        });
        await this.watches.resolve(watch.id, 'alerted');
      } catch (error) {
        // Leave the watch 'watching' so the next sweep retries rather than dropping it.
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to close wander watch ${watch.id}: ${message}`);
      }
    }
  }
}
