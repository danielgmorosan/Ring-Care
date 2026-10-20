import { Inject, Injectable } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../../database/database.tokens';
import {
  NIGHT_DOOR_OPENER_OUTCOMES,
  type RingCareDecision,
  type RingCareDecisionRepository,
  type RingCareOutcome,
  type RingInterpretation,
} from './ring-care-decision.repository';

interface DecisionRow extends QueryResultRow {
  ring_event_id: string;
  family_id: string;
  at: Date;
  interpretation: string | null;
  outcome: string;
  incident_id: string | null;
  visit_id: string | null;
}

const COLUMNS = 'ring_event_id, family_id, at, interpretation, outcome, incident_id, visit_id';

function toDecision(r: DecisionRow): RingCareDecision {
  return {
    ringEventId: r.ring_event_id,
    familyId: r.family_id,
    at: r.at.toISOString(),
    interpretation: r.interpretation as RingInterpretation | null,
    outcome: r.outcome as RingCareOutcome,
    incidentId: r.incident_id,
    visitId: r.visit_id,
  };
}

@Injectable()
export class PgRingCareDecisionRepository implements RingCareDecisionRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async record(d: RingCareDecision): Promise<boolean> {
    // Append-only (trigger + revoke): this only ever inserts. One decision per Ring event.
    const { rowCount } = await this.pool.query(
      `INSERT INTO ring_care_decisions
         (ring_event_id, family_id, at, interpretation, outcome, incident_id, visit_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (ring_event_id) DO NOTHING`,
      [d.ringEventId, d.familyId, d.at, d.interpretation, d.outcome, d.incidentId, d.visitId],
    );
    return (rowCount ?? 0) > 0;
  }

  async findByRingEvent(ringEventId: string): Promise<RingCareDecision | null> {
    const { rows } = await this.pool.query<DecisionRow>(
      `SELECT ${COLUMNS} FROM ring_care_decisions WHERE ring_event_id = $1`,
      [ringEventId],
    );
    return rows[0] ? toDecision(rows[0]) : null;
  }

  async latestNightDoorOpener(familyId: string): Promise<RingCareDecision | null> {
    const { rows } = await this.pool.query<DecisionRow>(
      `SELECT ${COLUMNS} FROM ring_care_decisions
        WHERE family_id = $1 AND outcome = ANY($2::text[])
        ORDER BY at DESC
        LIMIT 1`,
      [familyId, [...NIGHT_DOOR_OPENER_OUTCOMES]],
    );
    return rows[0] ? toDecision(rows[0]) : null;
  }
}
