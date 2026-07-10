import { Inject, Injectable } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.tokens';
import type { RecordStepInput } from './temporal/types';
import {
  Incident,
  IncidentRepository,
  IncidentStepView,
  TERMINAL_STEP_KINDS,
} from './incident.repository';

interface IncidentRow extends QueryResultRow {
  id: string;
  family_id: string;
  device_id: string;
  triggering_event_id: string | null;
  reason: string;
  opened_at: Date;
}

const INCIDENT_COLUMNS = 'id, family_id, device_id, triggering_event_id, reason, opened_at';

function toIncident(r: IncidentRow): Incident {
  return {
    id: r.id,
    familyId: r.family_id,
    deviceId: r.device_id,
    triggeringEventId: r.triggering_event_id,
    reason: r.reason,
    openedAt: r.opened_at.toISOString(),
  };
}

interface StepRow extends QueryResultRow {
  seq: number;
  kind: string;
  contact_name: string | null;
  contact_role: string | null;
  detail: Record<string, unknown>;
  occurred_at: Date;
}

@Injectable()
export class PgIncidentRepository implements IncidentRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async open(incident: Incident): Promise<void> {
    await this.pool.query(
      `INSERT INTO incidents (id, family_id, device_id, triggering_event_id, reason, opened_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        incident.id,
        incident.familyId,
        incident.deviceId,
        incident.triggeringEventId,
        incident.reason,
        incident.openedAt,
      ],
    );
  }

  async appendStep(step: RecordStepInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO incident_steps (incident_id, seq, kind, contact_id, detail)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (incident_id, seq) DO NOTHING`,
      [step.incidentId, step.seq, step.kind, step.contactId, JSON.stringify(step.detail)],
    );
  }

  async countSteps(incidentId: string): Promise<number> {
    const { rows } = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM incident_steps WHERE incident_id = $1`,
      [incidentId],
    );
    return rows[0]?.n ?? 0;
  }

  async listStepKinds(incidentId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ kind: string }>(
      `SELECT kind FROM incident_steps WHERE incident_id = $1 ORDER BY seq ASC`,
      [incidentId],
    );
    return rows.map((r) => r.kind);
  }

  async listByFamily(familyId: string): Promise<Incident[]> {
    const { rows } = await this.pool.query<IncidentRow>(
      `SELECT ${INCIDENT_COLUMNS} FROM incidents WHERE family_id = $1 ORDER BY opened_at DESC`,
      [familyId],
    );
    return rows.map(toIncident);
  }

  async findById(incidentId: string): Promise<Incident | null> {
    const { rows } = await this.pool.query<IncidentRow>(
      `SELECT ${INCIDENT_COLUMNS} FROM incidents WHERE id = $1`,
      [incidentId],
    );
    return rows[0] ? toIncident(rows[0]) : null;
  }

  async hasActiveForDevice(deviceId: string): Promise<boolean> {
    // An incident is active when it has no terminal step yet.
    const { rows } = await this.pool.query<{ active: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM incidents i
         WHERE i.device_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM incident_steps s
             WHERE s.incident_id = i.id AND s.kind = ANY($2::text[])
           )
       ) AS active`,
      [deviceId, [...TERMINAL_STEP_KINDS]],
    );
    return rows[0]?.active ?? false;
  }

  async findActiveForDevice(deviceId: string): Promise<Incident | null> {
    // The newest incident for the device with no terminal step yet.
    const { rows } = await this.pool.query<IncidentRow>(
      `SELECT ${INCIDENT_COLUMNS} FROM incidents i
       WHERE i.device_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM incident_steps s
           WHERE s.incident_id = i.id AND s.kind = ANY($2::text[])
         )
       ORDER BY i.opened_at DESC
       LIMIT 1`,
      [deviceId, [...TERMINAL_STEP_KINDS]],
    );
    return rows[0] ? toIncident(rows[0]) : null;
  }

  async hasRecentEmergencyForDevice(deviceId: string, since: string): Promise<boolean> {
    // An incident that reached emergency_notified and opened within the window.
    const { rows } = await this.pool.query<{ recent: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM incidents i
         WHERE i.device_id = $1
           AND i.opened_at >= $2
           AND EXISTS (
             SELECT 1 FROM incident_steps s
             WHERE s.incident_id = i.id AND s.kind = 'emergency_notified'
           )
       ) AS recent`,
      [deviceId, since],
    );
    return rows[0]?.recent ?? false;
  }

  async listSteps(incidentId: string): Promise<IncidentStepView[]> {
    const { rows } = await this.pool.query<StepRow>(
      `SELECT s.seq, s.kind, c.name AS contact_name, c.role AS contact_role, s.detail, s.occurred_at
         FROM incident_steps s
         LEFT JOIN family_contacts c ON c.id = s.contact_id
        WHERE s.incident_id = $1
        ORDER BY s.seq ASC`,
      [incidentId],
    );
    return rows.map((r) => ({
      seq: r.seq,
      kind: r.kind,
      contactName: r.contact_name,
      contactRole: r.contact_role,
      detail: r.detail,
      occurredAt: r.occurred_at.toISOString(),
    }));
  }
}
