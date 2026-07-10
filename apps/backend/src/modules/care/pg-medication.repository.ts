import { Inject, Injectable } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.tokens';
import type { Medication } from './medication.entity';
import { MedicationRepository, MedicationUpdate, NewMedication } from './medication.repository';

interface MedicationRow extends QueryResultRow {
  id: string;
  family_id: string;
  name: string;
  dosage: string | null;
  times: string[];
  notes: string | null;
  created_at: Date;
}

const COLUMNS = 'id, family_id, name, dosage, times, notes, created_at';

function toMedication(r: MedicationRow): Medication {
  return {
    id: r.id,
    familyId: r.family_id,
    name: r.name,
    dosage: r.dosage,
    times: r.times,
    notes: r.notes,
    createdAt: r.created_at.toISOString(),
  };
}

@Injectable()
export class PgMedicationRepository implements MedicationRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listByFamily(familyId: string): Promise<Medication[]> {
    const { rows } = await this.pool.query<MedicationRow>(
      `SELECT ${COLUMNS} FROM medications WHERE family_id = $1 ORDER BY created_at ASC`,
      [familyId],
    );
    return rows.map(toMedication);
  }

  async findById(familyId: string, id: string): Promise<Medication | null> {
    const { rows } = await this.pool.query<MedicationRow>(
      `SELECT ${COLUMNS} FROM medications WHERE family_id = $1 AND id = $2`,
      [familyId, id],
    );
    return rows[0] ? toMedication(rows[0]) : null;
  }

  async create(medication: NewMedication): Promise<Medication> {
    const { rows } = await this.pool.query<MedicationRow>(
      `INSERT INTO medications (family_id, name, dosage, times, notes)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING ${COLUMNS}`,
      [
        medication.familyId,
        medication.name,
        medication.dosage,
        JSON.stringify(medication.times),
        medication.notes,
      ],
    );
    return toMedication(rows[0]!);
  }

  async update(familyId: string, id: string, patch: MedicationUpdate): Promise<Medication | null> {
    const sets: string[] = [];
    const values: unknown[] = [familyId, id];
    let i = 3;
    if (patch.name !== undefined) {
      sets.push(`name = $${i++}`);
      values.push(patch.name);
    }
    if (patch.dosage !== undefined) {
      sets.push(`dosage = $${i++}`);
      values.push(patch.dosage);
    }
    if (patch.times !== undefined) {
      sets.push(`times = $${i++}::jsonb`);
      values.push(JSON.stringify(patch.times));
    }
    if (patch.notes !== undefined) {
      sets.push(`notes = $${i++}`);
      values.push(patch.notes);
    }
    if (sets.length === 0) return this.findById(familyId, id);
    const { rows } = await this.pool.query<MedicationRow>(
      `UPDATE medications SET ${sets.join(', ')} WHERE family_id = $1 AND id = $2 RETURNING ${COLUMNS}`,
      values,
    );
    return rows[0] ? toMedication(rows[0]) : null;
  }

  async delete(familyId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM medications WHERE family_id = $1 AND id = $2`,
      [familyId, id],
    );
    return (rowCount ?? 0) > 0;
  }
}
