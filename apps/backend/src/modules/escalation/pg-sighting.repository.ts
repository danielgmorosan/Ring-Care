import { Inject, Injectable } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.tokens';
import type { SightingDecision, SightingKind, SightingReason } from './sighting-decision.entity';
import { NewSightingDecision, SightingRepository } from './sighting.repository';

interface SightingRow extends QueryResultRow {
  id: string;
  family_id: string;
  device_id: string;
  event_id: string;
  at: Date;
  uniformed: boolean;
  decision: string;
  reason: string;
  visit_label: string | null;
  recorded_at: Date;
}

const COLUMNS =
  'id, family_id, device_id, event_id, at, uniformed, decision, reason, visit_label, recorded_at';

function toDecision(r: SightingRow): SightingDecision {
  return {
    id: r.id,
    familyId: r.family_id,
    deviceId: r.device_id,
    eventId: r.event_id,
    at: r.at.toISOString(),
    uniformed: r.uniformed,
    decision: r.decision as SightingKind,
    reason: r.reason as SightingReason,
    visitLabel: r.visit_label,
    recordedAt: r.recorded_at.toISOString(),
  };
}

@Injectable()
export class PgSightingRepository implements SightingRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async append(decision: NewSightingDecision): Promise<void> {
    // Idempotent on event_id: a replayed sighting records once. The table is
    // append-only (trigger + revoke), so this only ever inserts.
    await this.pool.query(
      `INSERT INTO sighting_decisions
         (family_id, device_id, event_id, at, uniformed, decision, reason, visit_label)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (event_id) DO NOTHING`,
      [
        decision.familyId,
        decision.deviceId,
        decision.eventId,
        decision.at,
        decision.uniformed,
        decision.decision,
        decision.reason,
        decision.visitLabel,
      ],
    );
  }

  async listByFamily(familyId: string): Promise<SightingDecision[]> {
    const { rows } = await this.pool.query<SightingRow>(
      `SELECT ${COLUMNS} FROM sighting_decisions WHERE family_id = $1 ORDER BY at DESC`,
      [familyId],
    );
    return rows.map(toDecision);
  }
}
