import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { type EventEnvelope, EventType, parseVlmVerdict, type VlmVerdict } from '@obrigada/shared';
import {
  InternalEvent,
  type FallDetectedPayload,
  type PersonUnknownPayload,
  type VoiceCheckinReportedPayload,
  type ZoneEnteredPayload,
  type ZoneExitedPayload,
} from '../../internal-events/internal-events';
import { toEventRecord } from './event-record';
import {
  AppendResult,
  EVENT_STREAM_REPOSITORY,
  type EventStreamRepository,
} from './event-stream.repository';

/**
 * Ingests validated device events into the append-only stream. Idempotent: a
 * replayed event (QoS-1 redelivery or offline replay) appends once.
 *
 * When a confirmed fall is newly ingested, it emits FallDetected on the internal
 * bus so the escalation module can start the ladder — the sanctioned cross-module
 * seam (no direct calls between modules). Emitting only on a first insert means a
 * QoS-1 redelivery never starts a second incident.
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @Inject(EVENT_STREAM_REPOSITORY) private readonly events: EventStreamRepository,
    private readonly bus: EventEmitter2,
  ) {}

  async ingest(envelope: EventEnvelope): Promise<AppendResult> {
    const result = await this.events.append(toEventRecord(envelope));
    if (result.inserted) {
      this.logger.debug(`Ingested ${envelope.type} from device ${envelope.deviceId}`);
      // Both tiers start the escalation: a suspected fall runs the voice check-in gate
      // (the false-alarm killer) and only escalates on silence/distress; a confirmed
      // fall additionally overrides quiet hours. De-duplication happens downstream.
      if (envelope.type === EventType.FallConfirmed || envelope.type === EventType.FallSuspected) {
        const payload: FallDetectedPayload = {
          deviceId: envelope.deviceId,
          eventId: envelope.eventId,
          type: envelope.type,
          occurredAt: envelope.occurredAt,
        };
        this.bus.emit(InternalEvent.FallDetected, payload);
      }
      // The on-device safety voice check-in result (F1.3): the guardian asked the elder
      // "Are you okay?" after a suspected fall and heard back. Route only a recognized
      // answer; a malformed payload cannot silently stand down a real incident.
      if (envelope.type === EventType.VoiceCheckinResult) {
        const result = envelope.payload?.result;
        if (result === 'i_am_fine' || result === 'distress' || result === 'silence') {
          const payload: VoiceCheckinReportedPayload = {
            deviceId: envelope.deviceId,
            eventId: envelope.eventId,
            occurredAt: envelope.occurredAt,
            result,
          };
          this.bus.emit(InternalEvent.VoiceCheckinReported, payload);
        } else {
          this.logger.warn(
            `voice.checkin_result from device ${envelope.deviceId} had no valid result; ignoring`,
          );
        }
      }
      // An unknown person: the stranger evaluator (F2.4) decides expected vs stranger.
      // A uniform is context, never trust — so we forward only the boolean clothing read
      // from the labels-only payload; it can raise an alert's priority, never suppress it.
      if (envelope.type === EventType.PersonUnknown) {
        const payload: PersonUnknownPayload = {
          deviceId: envelope.deviceId,
          eventId: envelope.eventId,
          occurredAt: envelope.occurredAt,
          uniformed: envelope.payload?.uniformed === true,
        };
        this.bus.emit(InternalEvent.PersonUnknown, payload);
      }
      // A zone crossing: the zone evaluator (F2.3) alerts on entry into a hazard zone.
      // The zoneId comes from the labels-only payload; without it we cannot resolve a
      // zone, so there is nothing to evaluate.
      if (envelope.type === EventType.ZoneEntry && typeof envelope.payload?.zoneId === 'string') {
        const payload: ZoneEnteredPayload = {
          deviceId: envelope.deviceId,
          eventId: envelope.eventId,
          occurredAt: envelope.occurredAt,
          zoneId: envelope.payload.zoneId,
        };
        this.bus.emit(InternalEvent.ZoneEntered, payload);
      }
      // A zone exit: the wander watcher (F2.3) uses an exit from a door zone to start a
      // return watch. Same zoneId contract as entry.
      if (envelope.type === EventType.ZoneExit && typeof envelope.payload?.zoneId === 'string') {
        const payload: ZoneExitedPayload = {
          deviceId: envelope.deviceId,
          eventId: envelope.eventId,
          occurredAt: envelope.occurredAt,
          zoneId: envelope.payload.zoneId,
        };
        this.bus.emit(InternalEvent.ZoneExited, payload);
      }
    }
    return result;
  }

  async countForDevice(deviceId: string): Promise<number> {
    return this.events.countByDevice(deviceId);
  }

  /**
   * Whether the device produced any "someone is here" event strictly after `since`
   * (ISO) — a recognized or unknown person, or a zone crossing. The wander watcher asks
   * this at the end of a window: presence means they came back, so no alert. Heartbeats
   * and offline markers are not presence.
   */
  hasPresenceSince(deviceId: string, since: string): Promise<boolean> {
    return this.events.hasPresenceSince(deviceId, since);
  }

  /**
   * The on-device VLM second opinions (F3.1) about a flagged event, newest first.
   * Malformed verdicts are dropped, so a caller only ever sees well-formed labels.
   */
  async secondOpinionsFor(deviceId: string, aboutEventId: string): Promise<SecondOpinion[]> {
    const records = await this.events.findVlmVerdicts(deviceId, aboutEventId);
    const opinions: SecondOpinion[] = [];
    for (const record of records) {
      const verdict = parseVlmVerdict(record.payload);
      if (verdict)
        opinions.push({ ...verdict, confidence: record.confidence, at: record.occurredAt });
    }
    return opinions;
  }
}

/** A VLM verdict as read back for display: the labels plus the envelope's confidence/time. */
export interface SecondOpinion extends VlmVerdict {
  /** The VLM's confidence in [0,1], from the event envelope; null if none. */
  confidence: number | null;
  /** When the VLM looked (device time). */
  at: string;
}
