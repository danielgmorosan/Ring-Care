import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.tokens';
import { EventRecord } from './event-record';
import {
  AppendResult,
  EventStreamRepository,
  PRESENCE_EVENT_TYPES,
} from './event-stream.repository';

/**
 * Postgres/TimescaleDB adapter. The insert is idempotent via ON CONFLICT on the
 * (event_id, occurred_at) unique index — a replayed event is a no-op, not a
 * duplicate row. Append-only is enforced by the DB trigger regardless.
 */
@Injectable()
export class PgEventStreamRepository implements EventStreamRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async append(record: EventRecord): Promise<AppendResult> {
    const result = await this.pool.query(
      `INSERT INTO event_stream
         (occurred_at, event_id, device_id, type, confidence, keypoints, payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
       ON CONFLICT (event_id, occurred_at) DO NOTHING`,
      [
        record.occurredAt,
        record.eventId,
        record.deviceId,
        record.type,
        record.confidence,
        record.keypoints ? JSON.stringify(record.keypoints) : null,
        JSON.stringify(record.payload),
      ],
    );
    return { inserted: (result.rowCount ?? 0) > 0 };
  }

  async countByDevice(deviceId: string): Promise<number> {
    const { rows } = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM event_stream WHERE device_id = $1`,
      [deviceId],
    );
    return rows[0]?.n ?? 0;
  }

  async hasPresenceSince(deviceId: string, since: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ present: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM event_stream
         WHERE device_id = $1 AND occurred_at > $2 AND type = ANY($3::text[])
       ) AS present`,
      [deviceId, since, [...PRESENCE_EVENT_TYPES]],
    );
    return rows[0]?.present ?? false;
  }

  async findVlmVerdicts(deviceId: string, aboutEventId: string): Promise<EventRecord[]> {
    const { rows } = await this.pool.query<VlmRow>(
      `SELECT occurred_at, event_id, device_id, type, confidence, keypoints, payload
         FROM event_stream
        WHERE device_id = $1 AND type = 'vlm.verdict' AND payload->>'aboutEventId' = $2
        ORDER BY occurred_at DESC`,
      [deviceId, aboutEventId],
    );
    return rows.map((r) => ({
      occurredAt: r.occurred_at.toISOString(),
      eventId: r.event_id,
      deviceId: r.device_id,
      type: r.type,
      confidence: r.confidence,
      keypoints: r.keypoints,
      payload: r.payload,
    }));
  }
}

interface VlmRow {
  occurred_at: Date;
  event_id: string;
  device_id: string;
  type: string;
  confidence: number | null;
  keypoints: EventRecord['keypoints'];
  payload: Record<string, unknown>;
}
