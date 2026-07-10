import { Injectable } from '@nestjs/common';
import { EventType } from '@obrigada/shared';
import { EventRecord } from './event-record';
import {
  AppendResult,
  EventStreamRepository,
  PRESENCE_EVENT_TYPES,
} from './event-stream.repository';

/** In-memory adapter (skeleton mode). Dedups on (eventId, occurredAt) like the DB. */
@Injectable()
export class InMemoryEventStreamRepository implements EventStreamRepository {
  private readonly records: EventRecord[] = [];
  private readonly seen = new Set<string>();

  private key(record: Pick<EventRecord, 'eventId' | 'occurredAt'>): string {
    return `${record.eventId}|${record.occurredAt}`;
  }

  async append(record: EventRecord): Promise<AppendResult> {
    const key = this.key(record);
    if (this.seen.has(key)) {
      return { inserted: false };
    }
    this.seen.add(key);
    this.records.push(record);
    return { inserted: true };
  }

  async countByDevice(deviceId: string): Promise<number> {
    return this.records.filter((r) => r.deviceId === deviceId).length;
  }

  async hasPresenceSince(deviceId: string, since: string): Promise<boolean> {
    return this.records.some(
      (r) =>
        r.deviceId === deviceId && r.occurredAt > since && PRESENCE_EVENT_TYPES.includes(r.type),
    );
  }

  async findVlmVerdicts(deviceId: string, aboutEventId: string): Promise<EventRecord[]> {
    return this.records
      .filter(
        (r) =>
          r.deviceId === deviceId &&
          r.type === EventType.VlmVerdict &&
          r.payload?.aboutEventId === aboutEventId,
      )
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }
}
