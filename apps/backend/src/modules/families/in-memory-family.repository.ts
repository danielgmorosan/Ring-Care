import { Injectable } from '@nestjs/common';
import { Family } from './family.entity';
import { FamilyPatch, FamilyRepository } from './family.repository';

/**
 * In-memory adapter for the skeleton phase. Not durable — replaced by the
 * TimescaleDB-backed adapter in F0.2. Kept deliberately simple.
 */
@Injectable()
export class InMemoryFamilyRepository implements FamilyRepository {
  private readonly families = new Map<string, Family>();

  async create(family: Family): Promise<Family> {
    this.families.set(family.id, family);
    return family;
  }

  async findById(id: string): Promise<Family | null> {
    return this.families.get(id) ?? null;
  }

  async findAll(): Promise<Family[]> {
    return [...this.families.values()];
  }

  async update(id: string, patch: FamilyPatch): Promise<Family | null> {
    const existing = this.families.get(id);
    if (!existing) return null;
    const updated: Family = {
      ...existing,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
      ...(patch.checkinLanguage !== undefined ? { checkinLanguage: patch.checkinLanguage } : {}),
    };
    this.families.set(id, updated);
    return updated;
  }
}
