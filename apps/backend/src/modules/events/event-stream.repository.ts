import { EventType } from '@obrigada/shared';
import { EventRecord } from './event-record';

/** Result of an append: inserted=false means it was a duplicate (idempotent replay). */
export interface AppendResult {
  inserted: boolean;
}

/**
 * Event types that mean "a person is present" — used by the wander watcher to tell a
 * return from a wander. A heartbeat or an offline marker is not presence.
 */
export const PRESENCE_EVENT_TYPES: readonly string[] = [
  EventType.PersonKnown,
  EventType.PersonUnknown,
  EventType.ZoneEntry,
  EventType.ZoneExit,
  EventType.FallSuspected,
  EventType.FallConfirmed,
];

/**
 * Append-only event store. The only write is append(); there is no update or
 * delete, mirroring the database guarantee (rule #2). Appends are idempotent on
 * (eventId, occurredAt) so QoS-1 at-least-once delivery and offline replay never
 * double-count.
 */
export interface EventStreamRepository {
  append(record: EventRecord): Promise<AppendResult>;
  countByDevice(deviceId: string): Promise<number>;
  /** Whether a presence event (see PRESENCE_EVENT_TYPES) occurred strictly after `since`. */
  hasPresenceSince(deviceId: string, since: string): Promise<boolean>;
  /** The device's `vlm.verdict` records about a given flagged event, newest first. */
  findVlmVerdicts(deviceId: string, aboutEventId: string): Promise<EventRecord[]>;
}

export const EVENT_STREAM_REPOSITORY = Symbol('EVENT_STREAM_REPOSITORY');
