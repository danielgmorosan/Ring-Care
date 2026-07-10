import { Inject, Injectable } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.tokens';
import type { AccessLogEntry, AccessLogRepository, NewAccessLog } from './access-log.repository';

interface AccessLogRow extends QueryResultRow {
  id: string;
  family_id: string;
  user_id: string | null;
  action: string;
  method: string;
  route: string;
  at: Date;
}

function toEntry(r: AccessLogRow): AccessLogEntry {
  return {
    id: r.id,
    familyId: r.family_id,
    userId: r.user_id,
    action: r.action,
    method: r.method,
    route: r.route,
    at: r.at.toISOString(),
  };
}

@Injectable()
export class PgAccessLogRepository implements AccessLogRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async record(entry: NewAccessLog): Promise<void> {
    await this.pool.query(
      `INSERT INTO access_log (family_id, user_id, action, method, route)
       VALUES ($1, $2, $3, $4, $5)`,
      [entry.familyId, entry.userId, entry.action, entry.method, entry.route],
    );
  }

  async listByFamily(familyId: string, limit: number): Promise<AccessLogEntry[]> {
    const { rows } = await this.pool.query<AccessLogRow>(
      `SELECT id, family_id, user_id, action, method, route, at
         FROM access_log WHERE family_id = $1 ORDER BY at DESC LIMIT $2`,
      [familyId, limit],
    );
    return rows.map(toEntry);
  }
}
