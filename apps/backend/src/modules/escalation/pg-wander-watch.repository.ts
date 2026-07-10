import { Inject, Injectable } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.tokens';
import type { WanderWatch, WanderWatchStatus } from './wander-watch.entity';
import { NewWanderWatch, WanderWatchRepository } from './wander-watch.repository';

interface WatchRow extends QueryResultRow {
  id: string;
  device_id: string;
  family_id: string;
  door_zone_id: string;
  door_name: string;
  started_at: Date;
  due_at: Date;
  status: string;
}

const COLUMNS = 'id, device_id, family_id, door_zone_id, door_name, started_at, due_at, status';

function toWatch(r: WatchRow): WanderWatch {
  return {
    id: r.id,
    deviceId: r.device_id,
    familyId: r.family_id,
    doorZoneId: r.door_zone_id,
    doorName: r.door_name,
    startedAt: r.started_at.toISOString(),
    dueAt: r.due_at.toISOString(),
    status: r.status as WanderWatchStatus,
  };
}

@Injectable()
export class PgWanderWatchRepository implements WanderWatchRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async openOrRefresh(watch: NewWanderWatch): Promise<void> {
    // One active watch per device (partial unique index on device_id WHERE status =
    // 'watching'): a fresh door exit refreshes the window instead of stacking watches.
    await this.pool.query(
      `INSERT INTO wander_watches
         (device_id, family_id, door_zone_id, door_name, started_at, due_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'watching')
       ON CONFLICT (device_id) WHERE status = 'watching'
       DO UPDATE SET door_zone_id = EXCLUDED.door_zone_id,
                     door_name = EXCLUDED.door_name,
                     started_at = EXCLUDED.started_at,
                     due_at = EXCLUDED.due_at`,
      [
        watch.deviceId,
        watch.familyId,
        watch.doorZoneId,
        watch.doorName,
        watch.startedAt,
        watch.dueAt,
      ],
    );
  }

  async listDue(now: string): Promise<WanderWatch[]> {
    const { rows } = await this.pool.query<WatchRow>(
      `SELECT ${COLUMNS} FROM wander_watches
       WHERE status = 'watching' AND due_at <= $1 ORDER BY due_at ASC`,
      [now],
    );
    return rows.map(toWatch);
  }

  async resolve(id: string, status: 'returned' | 'alerted'): Promise<void> {
    await this.pool.query(
      `UPDATE wander_watches SET status = $2 WHERE id = $1 AND status = 'watching'`,
      [id, status],
    );
  }
}
