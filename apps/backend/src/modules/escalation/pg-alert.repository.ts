import { Inject, Injectable } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.tokens';
import type { Alert, AlertKind } from './alert.entity';
import { AlertRepository, NewAlert } from './alert.repository';

interface AlertRow extends QueryResultRow {
  id: string;
  family_id: string;
  device_id: string | null;
  kind: string;
  message: string;
  ref: string;
  at: Date;
  created_at: Date;
}

const COLUMNS = 'id, family_id, device_id, kind, message, ref, at, created_at';

function toAlert(r: AlertRow): Alert {
  return {
    id: r.id,
    familyId: r.family_id,
    deviceId: r.device_id,
    kind: r.kind as AlertKind,
    message: r.message,
    ref: r.ref,
    at: r.at.toISOString(),
    createdAt: r.created_at.toISOString(),
  };
}

@Injectable()
export class PgAlertRepository implements AlertRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async append(alert: NewAlert): Promise<void> {
    // Idempotent on (ref, kind). The table is append-only (trigger + revoke), so this
    // only ever inserts.
    await this.pool.query(
      `INSERT INTO alerts (family_id, device_id, kind, message, ref, at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (ref, kind) DO NOTHING`,
      [alert.familyId, alert.deviceId, alert.kind, alert.message, alert.ref, alert.at],
    );
  }

  async listByFamily(familyId: string): Promise<Alert[]> {
    const { rows } = await this.pool.query<AlertRow>(
      `SELECT ${COLUMNS} FROM alerts WHERE family_id = $1 ORDER BY at DESC`,
      [familyId],
    );
    return rows.map(toAlert);
  }

  async existsByRefKind(ref: string, kind: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM alerts WHERE ref = $1 AND kind = $2) AS exists`,
      [ref, kind],
    );
    return rows[0]?.exists ?? false;
  }
}
