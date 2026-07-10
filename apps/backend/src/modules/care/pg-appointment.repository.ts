import { Inject, Injectable } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.tokens';
import type { Appointment } from './appointment.entity';
import { AppointmentRepository, AppointmentUpdate, NewAppointment } from './appointment.repository';

interface AppointmentRow extends QueryResultRow {
  id: string;
  family_id: string;
  title: string;
  at: Date;
  location: string | null;
  notes: string | null;
  created_at: Date;
}

const COLUMNS = 'id, family_id, title, at, location, notes, created_at';

function toAppointment(r: AppointmentRow): Appointment {
  return {
    id: r.id,
    familyId: r.family_id,
    title: r.title,
    at: r.at.toISOString(),
    location: r.location,
    notes: r.notes,
    createdAt: r.created_at.toISOString(),
  };
}

@Injectable()
export class PgAppointmentRepository implements AppointmentRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listByFamily(familyId: string): Promise<Appointment[]> {
    const { rows } = await this.pool.query<AppointmentRow>(
      `SELECT ${COLUMNS} FROM appointments WHERE family_id = $1 ORDER BY at ASC`,
      [familyId],
    );
    return rows.map(toAppointment);
  }

  async findById(familyId: string, id: string): Promise<Appointment | null> {
    const { rows } = await this.pool.query<AppointmentRow>(
      `SELECT ${COLUMNS} FROM appointments WHERE family_id = $1 AND id = $2`,
      [familyId, id],
    );
    return rows[0] ? toAppointment(rows[0]) : null;
  }

  async create(appointment: NewAppointment): Promise<Appointment> {
    const { rows } = await this.pool.query<AppointmentRow>(
      `INSERT INTO appointments (family_id, title, at, location, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${COLUMNS}`,
      [
        appointment.familyId,
        appointment.title,
        appointment.at,
        appointment.location,
        appointment.notes,
      ],
    );
    return toAppointment(rows[0]!);
  }

  async update(
    familyId: string,
    id: string,
    patch: AppointmentUpdate,
  ): Promise<Appointment | null> {
    const sets: string[] = [];
    const values: unknown[] = [familyId, id];
    let i = 3;
    if (patch.title !== undefined) {
      sets.push(`title = $${i++}`);
      values.push(patch.title);
    }
    if (patch.at !== undefined) {
      sets.push(`at = $${i++}`);
      values.push(patch.at);
    }
    if (patch.location !== undefined) {
      sets.push(`location = $${i++}`);
      values.push(patch.location);
    }
    if (patch.notes !== undefined) {
      sets.push(`notes = $${i++}`);
      values.push(patch.notes);
    }
    if (sets.length === 0) return this.findById(familyId, id);
    const { rows } = await this.pool.query<AppointmentRow>(
      `UPDATE appointments SET ${sets.join(', ')} WHERE family_id = $1 AND id = $2 RETURNING ${COLUMNS}`,
      values,
    );
    return rows[0] ? toAppointment(rows[0]) : null;
  }

  async delete(familyId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM appointments WHERE family_id = $1 AND id = $2`,
      [familyId, id],
    );
    return (rowCount ?? 0) > 0;
  }
}
