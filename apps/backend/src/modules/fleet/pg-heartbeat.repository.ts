import { Inject, Injectable } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.tokens';
import { Heartbeat } from './heartbeat';
import { HeartbeatRepository } from './heartbeat.repository';

interface HeartbeatRow extends QueryResultRow {
  time: Date;
  device_id: string;
  battery_pct: number | null;
  thermal_c: number | null;
  app_version: string | null;
  models: Record<string, string> | null;
}

@Injectable()
export class PgHeartbeatRepository implements HeartbeatRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async record(heartbeat: Heartbeat): Promise<void> {
    await this.pool.query(
      `INSERT INTO heartbeats (time, device_id, battery_pct, thermal_c, app_version, models)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        heartbeat.time,
        heartbeat.deviceId,
        heartbeat.batteryPct,
        heartbeat.thermalC,
        heartbeat.appVersion,
        heartbeat.models ? JSON.stringify(heartbeat.models) : null,
      ],
    );
  }

  async countByDevice(deviceId: string): Promise<number> {
    const { rows } = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM heartbeats WHERE device_id = $1`,
      [deviceId],
    );
    return rows[0]?.n ?? 0;
  }

  async latestByDevice(deviceId: string): Promise<Heartbeat | null> {
    const { rows } = await this.pool.query<HeartbeatRow>(
      `SELECT time, device_id, battery_pct, thermal_c, app_version, models
       FROM heartbeats WHERE device_id = $1 ORDER BY time DESC LIMIT 1`,
      [deviceId],
    );
    const r = rows[0];
    if (!r) return null;
    return toHeartbeat(r);
  }

  async recentByDevice(deviceId: string, limit: number): Promise<Heartbeat[]> {
    const { rows } = await this.pool.query<HeartbeatRow>(
      `SELECT time, device_id, battery_pct, thermal_c, app_version, models
       FROM heartbeats WHERE device_id = $1 ORDER BY time DESC LIMIT $2`,
      [deviceId, limit],
    );
    return rows.map(toHeartbeat);
  }
}

function toHeartbeat(r: HeartbeatRow): Heartbeat {
  return {
    deviceId: r.device_id,
    time: r.time.toISOString(),
    batteryPct: r.battery_pct,
    thermalC: r.thermal_c,
    appVersion: r.app_version,
    models: r.models,
  };
}
