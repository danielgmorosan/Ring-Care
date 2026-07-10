import { Inject, Injectable } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.tokens';
import type { DoseConfirmation } from './dose-confirmation.entity';
import { DoseConfirmationRepository, NewDoseConfirmation } from './dose-confirmation.repository';

interface DoseRow extends QueryResultRow {
  id: string;
  dose_id: string;
  medication_id: string;
  family_id: string;
  slot: string | null;
  confirmed_at: Date;
  created_at: Date;
}

const COLUMNS = 'id, dose_id, medication_id, family_id, slot, confirmed_at, created_at';

function toConfirmation(r: DoseRow): DoseConfirmation {
  return {
    id: r.id,
    doseId: r.dose_id,
    medicationId: r.medication_id,
    familyId: r.family_id,
    slot: r.slot,
    confirmedAt: r.confirmed_at.toISOString(),
    createdAt: r.created_at.toISOString(),
  };
}

@Injectable()
export class PgDoseConfirmationRepository implements DoseConfirmationRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async append(confirmation: NewDoseConfirmation): Promise<void> {
    // Idempotent on dose_id. Append-only (trigger + revoke), so this only inserts.
    await this.pool.query(
      `INSERT INTO dose_confirmations (dose_id, medication_id, family_id, slot, confirmed_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (dose_id) DO NOTHING`,
      [
        confirmation.doseId,
        confirmation.medicationId,
        confirmation.familyId,
        confirmation.slot,
        confirmation.confirmedAt,
      ],
    );
  }

  async listByMedication(familyId: string, medicationId: string): Promise<DoseConfirmation[]> {
    const { rows } = await this.pool.query<DoseRow>(
      `SELECT ${COLUMNS} FROM dose_confirmations
       WHERE family_id = $1 AND medication_id = $2 ORDER BY confirmed_at DESC`,
      [familyId, medicationId],
    );
    return rows.map(toConfirmation);
  }
}
