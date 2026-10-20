import { Inject, Injectable } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.tokens';
import type { RingCamera, RingEventRecord, RingPlacement } from './ring.entity';
import type { NewRingEvent, RecordResult, RingRepository, SyncedDevice } from './ring.repository';

interface CameraRow extends QueryResultRow {
  id: string;
  family_id: string;
  ring_device_id: string;
  name: string;
  placement: RingPlacement;
  online: boolean;
  last_event_at: Date | null;
  created_at: Date;
}

interface EventRow extends QueryResultRow {
  id: string;
  family_id: string;
  ring_camera_id: string | null;
  ring_event_key: string;
  kind: RingEventRecord['kind'];
  sub_type: string | null;
  source: RingEventRecord['source'];
  occurred_at: Date;
  received_at: Date;
  raw_type: string;
}

const CAMERA_COLUMNS =
  'id, family_id, ring_device_id, name, placement, online, last_event_at, created_at';
const EVENT_COLUMNS =
  'id, family_id, ring_camera_id, ring_event_key, kind, sub_type, source, occurred_at, received_at, raw_type';

function toCamera(r: CameraRow): RingCamera {
  return {
    id: r.id,
    familyId: r.family_id,
    ringDeviceId: r.ring_device_id,
    name: r.name,
    placement: r.placement,
    online: r.online,
    lastEventAt: r.last_event_at ? r.last_event_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
  };
}

function toEvent(r: EventRow): RingEventRecord {
  return {
    id: r.id,
    familyId: r.family_id,
    ringCameraId: r.ring_camera_id,
    ringEventKey: r.ring_event_key,
    kind: r.kind,
    subType: r.sub_type,
    source: r.source,
    occurredAt: r.occurred_at.toISOString(),
    receivedAt: r.received_at.toISOString(),
    rawType: r.raw_type,
  };
}

/**
 * Postgres adapter. Event inserts are idempotent via ON CONFLICT on ring_event_key;
 * append-only is enforced by the DB trigger regardless (rule #2).
 */
@Injectable()
export class PgRingRepository implements RingRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listCameras(familyId: string): Promise<RingCamera[]> {
    const { rows } = await this.pool.query<CameraRow>(
      `SELECT ${CAMERA_COLUMNS} FROM ring_cameras WHERE family_id = $1 ORDER BY created_at ASC`,
      [familyId],
    );
    return rows.map(toCamera);
  }

  async findCamera(familyId: string, id: string): Promise<RingCamera | null> {
    const { rows } = await this.pool.query<CameraRow>(
      `SELECT ${CAMERA_COLUMNS} FROM ring_cameras WHERE family_id = $1 AND id = $2`,
      [familyId, id],
    );
    return rows[0] ? toCamera(rows[0]) : null;
  }

  async ensureCamera(familyId: string, ringDeviceId: string): Promise<RingCamera> {
    // The no-op DO UPDATE makes RETURNING yield the existing row on conflict.
    const { rows } = await this.pool.query<CameraRow>(
      `INSERT INTO ring_cameras (family_id, ring_device_id)
       VALUES ($1, $2)
       ON CONFLICT (family_id, ring_device_id)
         DO UPDATE SET ring_device_id = EXCLUDED.ring_device_id
       RETURNING ${CAMERA_COLUMNS}`,
      [familyId, ringDeviceId],
    );
    return toCamera(rows[0]!);
  }

  async upsertFromSync(familyId: string, device: SyncedDevice): Promise<RingCamera> {
    const { rows } = await this.pool.query<CameraRow>(
      `INSERT INTO ring_cameras (family_id, ring_device_id, name, online, placement)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (family_id, ring_device_id)
         DO UPDATE SET name = EXCLUDED.name, online = EXCLUDED.online
       RETURNING ${CAMERA_COLUMNS}`,
      [familyId, device.ringDeviceId, device.name, device.online, device.placementIfNew],
    );
    return toCamera(rows[0]!);
  }

  async setPlacement(
    familyId: string,
    id: string,
    placement: RingPlacement,
  ): Promise<RingCamera | null> {
    const { rows } = await this.pool.query<CameraRow>(
      `UPDATE ring_cameras SET placement = $3 WHERE family_id = $1 AND id = $2
       RETURNING ${CAMERA_COLUMNS}`,
      [familyId, id, placement],
    );
    return rows[0] ? toCamera(rows[0]) : null;
  }

  async touchCamera(familyId: string, id: string, at: string, online?: boolean): Promise<void> {
    await this.pool.query(
      `UPDATE ring_cameras
          SET last_event_at = GREATEST(COALESCE(last_event_at, $3::timestamptz), $3::timestamptz),
              online = COALESCE($4::boolean, online)
        WHERE family_id = $1 AND id = $2`,
      [familyId, id, at, online ?? null],
    );
  }

  async setOnline(familyId: string, id: string, online: boolean): Promise<void> {
    await this.pool.query(`UPDATE ring_cameras SET online = $3 WHERE family_id = $1 AND id = $2`, [
      familyId,
      id,
      online,
    ]);
  }

  async recordEvent(event: NewRingEvent): Promise<RecordResult> {
    const { rows } = await this.pool.query<EventRow>(
      `INSERT INTO ring_events
         (family_id, ring_camera_id, ring_event_key, kind, sub_type, source, occurred_at, raw_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (ring_event_key) DO NOTHING
       RETURNING ${EVENT_COLUMNS}`,
      [
        event.familyId,
        event.ringCameraId,
        event.ringEventKey,
        event.kind,
        event.subType,
        event.source,
        event.occurredAt,
        event.rawType,
      ],
    );
    return rows[0] ? { inserted: true, event: toEvent(rows[0]) } : { inserted: false, event: null };
  }

  async listEvents(familyId: string, limit: number): Promise<RingEventRecord[]> {
    const { rows } = await this.pool.query<EventRow>(
      `SELECT ${EVENT_COLUMNS} FROM ring_events WHERE family_id = $1
       ORDER BY occurred_at DESC LIMIT $2`,
      [familyId, limit],
    );
    return rows.map(toEvent);
  }
}
