import { Inject, Injectable } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.tokens';
import { normalizeCheckinLanguage } from './checkin-language';
import { Family } from './family.entity';
import { FamilyPatch, FamilyRepository } from './family.repository';

interface FamilyRow extends QueryResultRow {
  id: string;
  name: string;
  timezone: string;
  checkin_language: string;
  created_at: Date;
}

function toFamily(row: FamilyRow): Family {
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    checkinLanguage: normalizeCheckinLanguage(row.checkin_language),
    createdAt: row.created_at.toISOString(),
  };
}

/** Postgres/TimescaleDB-backed adapter. Same port as the in-memory one (F0.1). */
@Injectable()
export class PgFamilyRepository implements FamilyRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(family: Family): Promise<Family> {
    const { rows } = await this.pool.query<FamilyRow>(
      `INSERT INTO families (id, name, timezone, checkin_language, created_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, timezone, checkin_language, created_at`,
      [family.id, family.name, family.timezone, family.checkinLanguage, family.createdAt],
    );
    return toFamily(rows[0]!);
  }

  async findById(id: string): Promise<Family | null> {
    const { rows } = await this.pool.query<FamilyRow>(
      `SELECT id, name, timezone, checkin_language, created_at FROM families WHERE id = $1`,
      [id],
    );
    return rows[0] ? toFamily(rows[0]) : null;
  }

  async findAll(): Promise<Family[]> {
    const { rows } = await this.pool.query<FamilyRow>(
      `SELECT id, name, timezone, checkin_language, created_at
       FROM families ORDER BY created_at ASC`,
    );
    return rows.map(toFamily);
  }

  async update(id: string, patch: FamilyPatch): Promise<Family | null> {
    // COALESCE keeps the current value when a field is not being changed.
    const { rows } = await this.pool.query<FamilyRow>(
      `UPDATE families
       SET name = COALESCE($2, name),
           timezone = COALESCE($3, timezone),
           checkin_language = COALESCE($4, checkin_language)
       WHERE id = $1
       RETURNING id, name, timezone, checkin_language, created_at`,
      [id, patch.name ?? null, patch.timezone ?? null, patch.checkinLanguage ?? null],
    );
    return rows[0] ? toFamily(rows[0]) : null;
  }
}
