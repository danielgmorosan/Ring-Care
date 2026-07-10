import { Inject, Injectable } from '@nestjs/common';
import { DatabaseError, Pool } from 'pg';
import { PG_POOL } from '../../database/database.tokens';
import {
  AuthUser,
  CreateUserInput,
  EmailTakenError,
  UserRepository,
  UserWithHash,
} from './user.repository';

interface UserRow {
  id: string;
  email: string;
  family_id: string;
  created_at: Date;
  password_hash?: string;
}

function toUser(r: UserRow): AuthUser {
  return { id: r.id, email: r.email, familyId: r.family_id, createdAt: r.created_at.toISOString() };
}

@Injectable()
export class PgUserRepository implements UserRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(input: CreateUserInput): Promise<AuthUser> {
    try {
      const { rows } = await this.pool.query<UserRow>(
        `INSERT INTO users (email, password_hash, family_id)
         VALUES ($1, $2, $3)
         RETURNING id, email, family_id, created_at`,
        [input.email, input.passwordHash, input.familyId],
      );
      return toUser(rows[0]!);
    } catch (error) {
      // 23505 = unique_violation (email already registered).
      if (error instanceof DatabaseError && error.code === '23505') {
        throw new EmailTakenError();
      }
      throw error;
    }
  }

  async findByEmailWithHash(email: string): Promise<UserWithHash | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT id, email, family_id, created_at, password_hash FROM users WHERE email = $1`,
      [email],
    );
    if (!rows[0]) return null;
    return { user: toUser(rows[0]), passwordHash: rows[0].password_hash! };
  }

  async findById(id: string): Promise<AuthUser | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT id, email, family_id, created_at FROM users WHERE id = $1`,
      [id],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async redactByFamily(familyId: string): Promise<void> {
    // Email → a unique, unrecoverable tombstone (keeps the UNIQUE constraint happy);
    // password hash → a value no login can ever match. The row stays for referential
    // integrity with the append-only trail, but carries no identity.
    await this.pool.query(
      `UPDATE users
         SET email = 'erased-' || id || '@obrigada.invalid', password_hash = 'erased'
       WHERE family_id = $1`,
      [familyId],
    );
  }
}
