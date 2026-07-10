import { Inject, Injectable } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.tokens';
import type { ClaimCodeRepository, NewClaimCode } from './claim-code.repository';
import type { ClaimCodeRecord } from './provisioning';

interface ClaimCodeRow extends QueryResultRow {
  id: string;
  device_id: string;
  code_hash: string;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
}

function toRecord(r: ClaimCodeRow): ClaimCodeRecord {
  return {
    id: r.id,
    deviceId: r.device_id,
    codeHash: r.code_hash,
    expiresAt: r.expires_at.toISOString(),
    consumedAt: r.consumed_at ? r.consumed_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
  };
}

const COLUMNS = 'id, device_id, code_hash, expires_at, consumed_at, created_at';

@Injectable()
export class PgClaimCodeRepository implements ClaimCodeRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(input: NewClaimCode): Promise<ClaimCodeRecord> {
    const { rows } = await this.pool.query<ClaimCodeRow>(
      `INSERT INTO device_claim_codes (device_id, code_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING ${COLUMNS}`,
      [input.deviceId, input.codeHash, input.expiresAt],
    );
    return toRecord(rows[0]!);
  }

  async findByCodeHash(codeHash: string): Promise<ClaimCodeRecord | null> {
    // Newest matching code wins if a device was issued more than one.
    const { rows } = await this.pool.query<ClaimCodeRow>(
      `SELECT ${COLUMNS} FROM device_claim_codes
        WHERE code_hash = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [codeHash],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async consume(id: string, consumedAt: string): Promise<void> {
    await this.pool.query(
      `UPDATE device_claim_codes SET consumed_at = $2 WHERE id = $1 AND consumed_at IS NULL`,
      [id, consumedAt],
    );
  }
}
