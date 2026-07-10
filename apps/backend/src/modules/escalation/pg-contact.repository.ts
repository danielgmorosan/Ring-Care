import { Inject, Injectable } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.tokens';
import type { EscalationContact, QuietHours } from './temporal/types';
import { ContactRepository, ContactUpdate, NewContact } from './contact.repository';

interface ContactRow extends QueryResultRow {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  push_token: string | null;
  priority: number;
  quiet_hours: QuietHours | null;
}

const COLUMNS = 'id, name, role, phone, push_token, priority, quiet_hours';

function toContact(r: ContactRow): EscalationContact {
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    phone: r.phone,
    pushToken: r.push_token,
    priority: r.priority,
    quietHours: r.quiet_hours,
  };
}

@Injectable()
export class PgContactRepository implements ContactRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listByFamily(familyId: string): Promise<EscalationContact[]> {
    const { rows } = await this.pool.query<ContactRow>(
      `SELECT ${COLUMNS} FROM family_contacts WHERE family_id = $1 ORDER BY priority ASC`,
      [familyId],
    );
    return rows.map(toContact);
  }

  async findById(familyId: string, contactId: string): Promise<EscalationContact | null> {
    const { rows } = await this.pool.query<ContactRow>(
      `SELECT ${COLUMNS} FROM family_contacts WHERE family_id = $1 AND id = $2`,
      [familyId, contactId],
    );
    return rows[0] ? toContact(rows[0]) : null;
  }

  async create(contact: NewContact): Promise<EscalationContact> {
    const { rows } = await this.pool.query<ContactRow>(
      `INSERT INTO family_contacts (family_id, name, role, phone, push_token, priority, quiet_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING ${COLUMNS}`,
      [
        contact.familyId,
        contact.name,
        contact.role,
        contact.phone,
        contact.pushToken,
        contact.priority,
        contact.quietHours ? JSON.stringify(contact.quietHours) : null,
      ],
    );
    return toContact(rows[0]!);
  }

  async update(
    familyId: string,
    contactId: string,
    update: ContactUpdate,
  ): Promise<EscalationContact | null> {
    // Build a partial SET clause from only the provided fields.
    const sets: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown): void => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (update.name !== undefined) add('name', update.name);
    if (update.role !== undefined) add('role', update.role);
    if (update.phone !== undefined) add('phone', update.phone);
    if (update.pushToken !== undefined) add('push_token', update.pushToken);
    if (update.priority !== undefined) add('priority', update.priority);
    if (update.quietHours !== undefined) {
      values.push(update.quietHours ? JSON.stringify(update.quietHours) : null);
      sets.push(`quiet_hours = $${values.length}::jsonb`);
    }
    if (sets.length === 0) return this.findById(familyId, contactId);

    values.push(familyId, contactId);
    const { rows } = await this.pool.query<ContactRow>(
      `UPDATE family_contacts SET ${sets.join(', ')}
       WHERE family_id = $${values.length - 1} AND id = $${values.length}
       RETURNING ${COLUMNS}`,
      values,
    );
    return rows[0] ? toContact(rows[0]) : null;
  }

  async delete(familyId: string, contactId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM family_contacts WHERE family_id = $1 AND id = $2`,
      [familyId, contactId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async redactByFamily(familyId: string): Promise<void> {
    // In-place redaction: incident_steps.contact_id references these rows, so we
    // strip the identity but keep the row (deleting would trip the append-only
    // trigger on incident_steps via SET NULL). See docs/decisions/0005.
    await this.pool.query(
      `UPDATE family_contacts SET name = 'Erased contact', phone = NULL, push_token = NULL
       WHERE family_id = $1`,
      [familyId],
    );
  }
}
