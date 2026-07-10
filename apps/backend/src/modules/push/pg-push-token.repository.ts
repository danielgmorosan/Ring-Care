import { Inject, Injectable } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.tokens';
import { PushToken } from './push-token.entity';
import { PushTokenRepository, UpsertPushToken } from './push-token.repository';

interface PushTokenRow extends QueryResultRow {
  id: string;
  user_id: string;
  family_id: string;
  token: string;
  platform: string;
  created_at: Date;
}

function toPushToken(row: PushTokenRow): PushToken {
  return {
    id: row.id,
    userId: row.user_id,
    familyId: row.family_id,
    token: row.token,
    platform: row.platform as PushToken['platform'],
    createdAt: row.created_at.toISOString(),
  };
}

/** Postgres-backed adapter. Same port as the in-memory one. */
@Injectable()
export class PgPushTokenRepository implements PushTokenRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async upsert(input: UpsertPushToken): Promise<PushToken> {
    // Re-registering the same device token re-points it to the current owner.
    const { rows } = await this.pool.query<PushTokenRow>(
      `INSERT INTO push_tokens (user_id, family_id, token, platform)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (token) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             family_id = EXCLUDED.family_id,
             platform = EXCLUDED.platform
       RETURNING id, user_id, family_id, token, platform, created_at`,
      [input.userId, input.familyId, input.token, input.platform],
    );
    return toPushToken(rows[0]!);
  }

  async listByFamily(familyId: string): Promise<PushToken[]> {
    const { rows } = await this.pool.query<PushTokenRow>(
      `SELECT id, user_id, family_id, token, platform, created_at
       FROM push_tokens WHERE family_id = $1 ORDER BY created_at ASC`,
      [familyId],
    );
    return rows.map(toPushToken);
  }

  async deleteByToken(familyId: string, token: string): Promise<void> {
    await this.pool.query(`DELETE FROM push_tokens WHERE family_id = $1 AND token = $2`, [
      familyId,
      token,
    ]);
  }
}
