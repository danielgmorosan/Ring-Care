import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  AuthUser,
  CreateUserInput,
  EmailTakenError,
  UserRepository,
  UserWithHash,
} from './user.repository';

interface StoredUser extends AuthUser {
  passwordHash: string;
}

@Injectable()
export class InMemoryUserRepository implements UserRepository {
  private readonly byId = new Map<string, StoredUser>();

  async create(input: CreateUserInput): Promise<AuthUser> {
    const email = input.email.toLowerCase();
    for (const u of this.byId.values()) {
      if (u.email.toLowerCase() === email) throw new EmailTakenError();
    }
    const stored: StoredUser = {
      id: uuidv4(),
      email: input.email,
      familyId: input.familyId,
      createdAt: new Date().toISOString(),
      passwordHash: input.passwordHash,
    };
    this.byId.set(stored.id, stored);
    return this.strip(stored);
  }

  async findByEmailWithHash(email: string): Promise<UserWithHash | null> {
    const target = email.toLowerCase();
    for (const u of this.byId.values()) {
      if (u.email.toLowerCase() === target) {
        return { user: this.strip(u), passwordHash: u.passwordHash };
      }
    }
    return null;
  }

  async findById(id: string): Promise<AuthUser | null> {
    const u = this.byId.get(id);
    return u ? this.strip(u) : null;
  }

  async redactByFamily(familyId: string): Promise<void> {
    for (const u of this.byId.values()) {
      if (u.familyId === familyId) {
        u.email = `erased-${u.id}@obrigada.invalid`;
        u.passwordHash = 'erased';
      }
    }
  }

  private strip(u: StoredUser): AuthUser {
    return { id: u.id, email: u.email, familyId: u.familyId, createdAt: u.createdAt };
  }
}
