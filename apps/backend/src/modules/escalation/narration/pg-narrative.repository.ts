import { Inject, Injectable } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../../database/database.tokens';
import type { NarrativeRecord, NarrativeRepository } from './narrative.repository';

interface NarrativeRow extends QueryResultRow {
  incident_id: string;
  text: string;
  generated_by: 'mock' | 'claude' | 'bedrock';
  model: string | null;
  created_at: Date;
}

function toRecord(r: NarrativeRow): NarrativeRecord {
  return {
    incidentId: r.incident_id,
    text: r.text,
    generatedBy: r.generated_by,
    model: r.model,
    createdAt: r.created_at.toISOString(),
  };
}

@Injectable()
export class PgNarrativeRepository implements NarrativeRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async getLatest(incidentId: string): Promise<NarrativeRecord | null> {
    const { rows } = await this.pool.query<NarrativeRow>(
      `SELECT incident_id, text, generated_by, model, created_at
         FROM incident_narratives
        WHERE incident_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [incidentId],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async append(record: Omit<NarrativeRecord, 'createdAt'>): Promise<NarrativeRecord> {
    const { rows } = await this.pool.query<NarrativeRow>(
      `INSERT INTO incident_narratives (incident_id, text, generated_by, model)
       VALUES ($1, $2, $3, $4)
       RETURNING incident_id, text, generated_by, model, created_at`,
      [record.incidentId, record.text, record.generatedBy, record.model],
    );
    return toRecord(rows[0]!);
  }
}
