import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import { EventType, type EventEnvelope } from '@obrigada/shared';
import { v4 as uuidv4 } from 'uuid';
import { AppConfig } from '../../config/env.validation';
import { InternalEvent, type GuardianOfflinePayload } from '../../internal-events/internal-events';
import { EventsService } from '../events/events.service';
import { NewlyOffline, PresenceService } from './presence.service';

/**
 * Detects guardians that have gone dark (N missed heartbeats). Reliability is the
 * product: a silent guardian is a visible, logged event. Each offline transition
 * emits guardian.offline on the internal bus (the escalation engine in F1.4 will
 * consume it) and appends a guardian.offline record to the append-only stream.
 */
@Injectable()
export class OfflineSweepService {
  private readonly logger = new Logger(OfflineSweepService.name);

  constructor(
    private readonly presence: PresenceService,
    private readonly events: EventsService,
    private readonly bus: EventEmitter2,
    private readonly config: AppConfig,
  ) {}

  @Interval(30_000)
  async scheduledSweep(): Promise<void> {
    await this.sweep(Date.now());
  }

  /** Runs one detection pass. Exposed (not just the interval) so it is testable. */
  async sweep(nowMs: number): Promise<NewlyOffline[]> {
    const thresholdMs = this.config.deviceOfflineThresholdSeconds * 1000;
    const newlyOffline = await this.presence.claimNewlyOffline(thresholdMs, nowMs);

    for (const device of newlyOffline) {
      this.logger.warn(`Guardian ${device.deviceId} is offline (missed heartbeats)`);

      const payload: GuardianOfflinePayload = {
        deviceId: device.deviceId,
        lastSeenAt: device.lastSeenAt,
        detectedAt: nowMs,
      };
      this.bus.emit(InternalEvent.GuardianOffline, payload);

      const envelope: EventEnvelope = {
        eventId: uuidv4(),
        deviceId: device.deviceId,
        type: EventType.GuardianOffline,
        occurredAt: new Date(nowMs).toISOString(),
        payload: {
          lastSeenAt: device.lastSeenAt ? new Date(device.lastSeenAt).toISOString() : null,
          thresholdSeconds: this.config.deviceOfflineThresholdSeconds,
        },
      };
      await this.events.ingest(envelope);
    }

    return newlyOffline;
  }
}
