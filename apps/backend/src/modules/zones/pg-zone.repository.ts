import { Inject, Injectable } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.tokens';
import type { Zone, ZoneKind, ZonePoint } from './zone.entity';
import { NewZone, ZoneRepository, ZoneUpdate } from './zone.repository';

interface ZoneRow extends QueryResultRow {
  id: string;
  device_id: string;
  family_id: string;
  name: string;
  kind: string;
  points: ZonePoint[];
  active: boolean;
  created_at: Date;
}

const COLUMNS = 'id, device_id, family_id, name, kind, points, active, created_at';

function toZone(r: ZoneRow): Zone {
  return {
    id: r.id,
    deviceId: r.device_id,
    familyId: r.family_id,
    name: r.name,
    kind: r.kind as ZoneKind,
    points: r.points,
    active: r.active,
    createdAt: r.created_at.toISOString(),
  };
}

@Injectable()
export class PgZoneRepository implements ZoneRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listByFamily(familyId: string): Promise<Zone[]> {
    const { rows } = await this.pool.query<ZoneRow>(
      `SELECT ${COLUMNS} FROM zones WHERE family_id = $1 AND active = true ORDER BY created_at ASC`,
      [familyId],
    );
    return rows.map(toZone);
  }

  async listActiveByDevice(deviceId: string): Promise<Zone[]> {
    const { rows } = await this.pool.query<ZoneRow>(
      `SELECT ${COLUMNS} FROM zones WHERE device_id = $1 AND active = true ORDER BY created_at ASC`,
      [deviceId],
    );
    return rows.map(toZone);
  }

  async findById(familyId: string, id: string): Promise<Zone | null> {
    const { rows } = await this.pool.query<ZoneRow>(
      `SELECT ${COLUMNS} FROM zones WHERE family_id = $1 AND id = $2`,
      [familyId, id],
    );
    return rows[0] ? toZone(rows[0]) : null;
  }

  async create(zone: NewZone): Promise<Zone> {
    const { rows } = await this.pool.query<ZoneRow>(
      `INSERT INTO zones (device_id, family_id, name, kind, points)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING ${COLUMNS}`,
      [zone.deviceId, zone.familyId, zone.name, zone.kind, JSON.stringify(zone.points)],
    );
    return toZone(rows[0]!);
  }

  async update(familyId: string, id: string, patch: ZoneUpdate): Promise<Zone | null> {
    const sets: string[] = [];
    const values: unknown[] = [familyId, id];
    let i = 3;
    if (patch.name !== undefined) {
      sets.push(`name = $${i++}`);
      values.push(patch.name);
    }
    if (patch.kind !== undefined) {
      sets.push(`kind = $${i++}`);
      values.push(patch.kind);
    }
    if (patch.points !== undefined) {
      sets.push(`points = $${i++}::jsonb`);
      values.push(JSON.stringify(patch.points));
    }
    if (sets.length === 0) return this.findById(familyId, id);
    const { rows } = await this.pool.query<ZoneRow>(
      `UPDATE zones SET ${sets.join(', ')}
       WHERE family_id = $1 AND id = $2 AND active = true RETURNING ${COLUMNS}`,
      values,
    );
    return rows[0] ? toZone(rows[0]) : null;
  }

  async deactivate(familyId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE zones SET active = false WHERE family_id = $1 AND id = $2 AND active = true`,
      [familyId, id],
    );
    return (rowCount ?? 0) > 0;
  }
}
