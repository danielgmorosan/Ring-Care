import { Inject, Injectable } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.tokens';
import type { HouseholdRole, Person } from './person.entity';
import { NewPerson, PeopleRepository, PersonUpdate } from './people.repository';

interface PersonRow extends QueryResultRow {
  id: string;
  family_id: string;
  title: string;
  role: string;
  notes: string | null;
  active: boolean;
  created_at: Date;
}

const COLUMNS = 'id, family_id, title, role, notes, active, created_at';

function toPerson(r: PersonRow): Person {
  return {
    id: r.id,
    familyId: r.family_id,
    title: r.title,
    role: r.role as HouseholdRole,
    notes: r.notes,
    active: r.active,
    createdAt: r.created_at.toISOString(),
  };
}

@Injectable()
export class PgPeopleRepository implements PeopleRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listByFamily(familyId: string): Promise<Person[]> {
    const { rows } = await this.pool.query<PersonRow>(
      `SELECT ${COLUMNS} FROM people WHERE family_id = $1 AND active = true ORDER BY created_at ASC`,
      [familyId],
    );
    return rows.map(toPerson);
  }

  async findById(familyId: string, id: string): Promise<Person | null> {
    const { rows } = await this.pool.query<PersonRow>(
      `SELECT ${COLUMNS} FROM people WHERE family_id = $1 AND id = $2`,
      [familyId, id],
    );
    return rows[0] ? toPerson(rows[0]) : null;
  }

  async create(person: NewPerson): Promise<Person> {
    const { rows } = await this.pool.query<PersonRow>(
      `INSERT INTO people (family_id, title, role, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNS}`,
      [person.familyId, person.title, person.role, person.notes],
    );
    return toPerson(rows[0]!);
  }

  async update(familyId: string, id: string, patch: PersonUpdate): Promise<Person | null> {
    const sets: string[] = [];
    const values: unknown[] = [familyId, id];
    let i = 3;
    if (patch.title !== undefined) {
      sets.push(`title = $${i++}`);
      values.push(patch.title);
    }
    if (patch.role !== undefined) {
      sets.push(`role = $${i++}`);
      values.push(patch.role);
    }
    if (patch.notes !== undefined) {
      sets.push(`notes = $${i++}`);
      values.push(patch.notes);
    }
    if (sets.length === 0) return this.findById(familyId, id);
    const { rows } = await this.pool.query<PersonRow>(
      `UPDATE people SET ${sets.join(', ')}
       WHERE family_id = $1 AND id = $2 AND active = true RETURNING ${COLUMNS}`,
      values,
    );
    return rows[0] ? toPerson(rows[0]) : null;
  }

  async deactivate(familyId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE people SET active = false WHERE family_id = $1 AND id = $2 AND active = true`,
      [familyId, id],
    );
    return (rowCount ?? 0) > 0;
  }
}
