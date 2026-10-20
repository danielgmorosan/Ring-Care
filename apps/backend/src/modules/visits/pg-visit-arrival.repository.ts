import { Inject, Injectable } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.tokens';
import type { VisitArrival } from './visit-arrival.entity';
import type { NewVisitArrival, VisitArrivalRepository } from './visit-arrival.repository';

interface ArrivalRow extends QueryResultRow {
  id: string;
  visit_id: string;
  family_id: string;
  ring_event_id: string;
  visitor_label: string;
  arrived_at: Date;
}

const COLUMNS = 'id, visit_id, family_id, ring_event_id, visitor_label, arrived_at';

function toArrival(r: ArrivalRow): VisitArrival {
  return {
    id: r.id,
    visitId: r.visit_id,
    familyId: r.family_id,
    ringEventId: r.ring_event_id,
    visitorLabel: r.visitor_label,
    arrivedAt: r.arrived_at.toISOString(),
  };
}

@Injectable()
export class PgVisitArrivalRepository implements VisitArrivalRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async record(arrival: NewVisitArrival): Promise<boolean> {
    // Append-only (trigger + revoke): this only ever inserts. One arrival per visit.
    const { rowCount } = await this.pool.query(
      `INSERT INTO visit_arrivals (visit_id, family_id, ring_event_id, visitor_label, arrived_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (visit_id) DO NOTHING`,
      [
        arrival.visitId,
        arrival.familyId,
        arrival.ringEventId,
        arrival.visitorLabel,
        arrival.arrivedAt,
      ],
    );
    return (rowCount ?? 0) > 0;
  }

  async findByVisit(visitId: string): Promise<VisitArrival | null> {
    const { rows } = await this.pool.query<ArrivalRow>(
      `SELECT ${COLUMNS} FROM visit_arrivals WHERE visit_id = $1`,
      [visitId],
    );
    return rows[0] ? toArrival(rows[0]) : null;
  }

  async listByFamily(familyId: string): Promise<VisitArrival[]> {
    const { rows } = await this.pool.query<ArrivalRow>(
      `SELECT ${COLUMNS} FROM visit_arrivals WHERE family_id = $1 ORDER BY arrived_at DESC`,
      [familyId],
    );
    return rows.map(toArrival);
  }
}
