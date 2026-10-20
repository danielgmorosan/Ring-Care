import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppConfig } from '../../config/env.validation';
import { InternalEvent, type RingActivityPayload } from '../../internal-events/internal-events';
import type { RingEventSource } from './ring.entity';
import { RING_REPOSITORY, type RingRepository } from './ring.repository';
import { verifyRingSignature } from './ring-signature';
import { parseRingWebhook } from './ring-webhook.parser';

export interface RingIngestResult {
  /** False when Ring redelivered an event we already recorded. */
  recorded: boolean;
  ringEventId: string | null;
  /** What to put on the internal bus once the response is on its way, if anything. */
  pending: { event: InternalEvent; payload: RingActivityPayload } | null;
}

/**
 * Signed Ring webhook intake (decision 0011). Order matters:
 *  1. verify the HMAC over the raw bytes (no signature, no processing);
 *  2. durably record the event to the append-only trail, idempotent on Ring's event id;
 *  3. the controller answers 200, then `dispatch()` puts motion / doorbell activity on
 *     the internal bus for the care logic to evaluate.
 * A redelivery records nothing and emits nothing, so it can never raise a second alert.
 */
@Injectable()
export class RingWebhookService {
  private readonly logger = new Logger(RingWebhookService.name);

  constructor(
    private readonly config: AppConfig,
    @Inject(RING_REPOSITORY) private readonly repo: RingRepository,
    private readonly bus: EventEmitter2,
  ) {}

  async ingest(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    simulator: boolean,
  ): Promise<RingIngestResult> {
    const secret = this.config.ringHmacSecret;
    const familyId = this.config.ringFamilyId;
    if (!this.config.hasRingWebhooks || !secret || !familyId) {
      throw new ServiceUnavailableException('Ring webhooks are not configured');
    }
    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('Expected a JSON body');
    }
    if (!verifyRingSignature(rawBody, signature, secret)) {
      throw new UnauthorizedException('Invalid signature');
    }

    let parsed;
    try {
      parsed = parseRingWebhook(rawBody);
    } catch {
      throw new BadRequestException('Body is not a JSON object');
    }

    const source: RingEventSource = simulator ? 'simulator' : 'ring';
    const occurredAt = parsed.occurredAt ?? new Date().toISOString();

    // Unknown event types are recorded but attach to no camera and drive nothing.
    const camera =
      parsed.kind !== 'other' && parsed.ringDeviceId
        ? await this.repo.ensureCamera(familyId, parsed.ringDeviceId)
        : null;

    const { inserted, event } = await this.repo.recordEvent({
      familyId,
      ringCameraId: camera?.id ?? null,
      ringEventKey: parsed.eventKey,
      kind: parsed.kind,
      subType: parsed.subType,
      source,
      occurredAt,
      rawType: parsed.rawType,
    });
    if (!inserted || !event) {
      this.logger.log(`Ring event ${parsed.eventKey} redelivered; already recorded`);
      return { recorded: false, ringEventId: null, pending: null };
    }

    if (camera) {
      // Online state follows the newest event only, so a late offline cannot flip it.
      const isNewest = !camera.lastEventAt || camera.lastEventAt <= occurredAt;
      const online =
        parsed.kind === 'offline' ? false : parsed.kind === 'online' ? true : undefined;
      await this.repo.touchCamera(familyId, camera.id, occurredAt, isNewest ? online : undefined);
    }

    let pending: RingIngestResult['pending'] = null;
    if (camera && (parsed.kind === 'motion' || parsed.kind === 'ding')) {
      pending = {
        event:
          parsed.kind === 'motion'
            ? InternalEvent.RingMotionDetected
            : InternalEvent.RingButtonPressed,
        payload: {
          familyId,
          ringCameraId: camera.id,
          ringEventId: event.id,
          placement: camera.placement,
          subType: parsed.subType,
          occurredAt,
          receivedAt: event.receivedAt,
          source,
        },
      };
    } else if (!camera && (parsed.kind === 'motion' || parsed.kind === 'ding')) {
      this.logger.warn(`Ring ${parsed.rawType} without a device id; recorded, not evaluated`);
    }
    return { recorded: true, ringEventId: event.id, pending };
  }

  /** Emit the recorded activity on the internal bus. Never throws into the caller. */
  dispatch(result: RingIngestResult): void {
    if (!result.pending) return;
    try {
      this.bus.emit(result.pending.event, result.pending.payload);
    } catch (err) {
      this.logger.error(
        `Ring event ${result.ringEventId} recorded but a listener failed: ${(err as Error).message}`,
      );
    }
  }
}
