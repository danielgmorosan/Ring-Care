import { Inject, Injectable } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.tokens';
import type { ExpectedVisit } from './visit.entity';
import { NewVisit, VisitsRepository, VisitUpdate } from './visits.repository';

interface VisitRow extends QueryResultRow {
  id: string;
  family_id: string;
  visitor_label: string;
  starts_at: Date;
  ends_at: Date;
  notes: string | null;
  created_at: Date;
}

const COLUMNS = 'id, family_id, visitor_label, starts_at, ends_at, notes, created_at';

function toVisit(r: VisitRow): ExpectedVisit {
  return {
    id: r.id,
    familyId: r.family_id,
    visitorLabel: r.visitor_label,
    startsAt: r.starts_at.toISOString(),
    endsAt: r.ends_at.toISOString(),
    notes: r.notes,
    createdAt: r.created_at.toISOString(),
  };
}

@Injectable()
export class PgVisitsRepository implements VisitsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listByFamily(familyId: string): Promise<ExpectedVisit[]> {
    const { rows } = await this.pool.query<VisitRow>(
      `SELECT ${COLUMNS} FROM expected_visits WHERE family_id = $1 ORDER BY starts_at ASC`,
      [familyId],
    );
    return rows.map(toVisit);
  }

  async findById(familyId: string, id: string): Promise<ExpectedVisit | null> {
    const { rows } = await this.pool.query<VisitRow>(
      `SELECT ${COLUMNS} FROM expected_visits WHERE family_id = $1 AND id = $2`,
      [familyId, id],
    );
    return rows[0] ? toVisit(rows[0]) : null;
  }

  async findCovering(familyId: string, at: string): Promise<ExpectedVisit[]> {
    const { rows } = await this.pool.query<VisitRow>(
      `SELECT ${COLUMNS} FROM expected_visits
       WHERE family_id = $1 AND starts_at <= $2 AND $2 <= ends_at
       ORDER BY starts_at ASC`,
      [familyId, at],
    );
    return rows.map(toVisit);
  }

  async create(visit: NewVisit): Promise<ExpectedVisit> {
    const { rows } = await this.pool.query<VisitRow>(
      `INSERT INTO expected_visits (family_id, visitor_label, starts_at, ends_at, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${COLUMNS}`,
      [visit.familyId, visit.visitorLabel, visit.startsAt, visit.endsAt, visit.notes],
    );
    return toVisit(rows[0]!);
  }

  async update(familyId: string, id: string, patch: VisitUpdate): Promise<ExpectedVisit | null> {
    const sets: string[] = [];
    const values: unknown[] = [familyId, id];
    let i = 3;
    if (patch.visitorLabel !== undefined) {
      sets.push(`visitor_label = $${i++}`);
      values.push(patch.visitorLabel);
    }
    if (patch.startsAt !== undefined) {
      sets.push(`starts_at = $${i++}`);
      values.push(patch.startsAt);
    }
    if (patch.endsAt !== undefined) {
      sets.push(`ends_at = $${i++}`);
      values.push(patch.endsAt);
    }
    if (patch.notes !== undefined) {
      sets.push(`notes = $${i++}`);
      values.push(patch.notes);
    }
    if (sets.length === 0) return this.findById(familyId, id);
    const { rows } = await this.pool.query<VisitRow>(
      `UPDATE expected_visits SET ${sets.join(', ')} WHERE family_id = $1 AND id = $2 RETURNING ${COLUMNS}`,
      values,
    );
    return rows[0] ? toVisit(rows[0]) : null;
  }

  async delete(familyId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM expected_visits WHERE family_id = $1 AND id = $2`,
      [familyId, id],
    );
    return (rowCount ?? 0) > 0;
  }
}
