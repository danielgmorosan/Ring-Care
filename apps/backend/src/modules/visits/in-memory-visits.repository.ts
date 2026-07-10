import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { ExpectedVisit } from './visit.entity';
import { NewVisit, VisitsRepository, VisitUpdate } from './visits.repository';

@Injectable()
export class InMemoryVisitsRepository implements VisitsRepository {
  private readonly byFamily = new Map<string, ExpectedVisit[]>();

  async listByFamily(familyId: string): Promise<ExpectedVisit[]> {
    return [...(this.byFamily.get(familyId) ?? [])].sort((a, b) =>
      a.startsAt.localeCompare(b.startsAt),
    );
  }

  async findById(familyId: string, id: string): Promise<ExpectedVisit | null> {
    return (this.byFamily.get(familyId) ?? []).find((v) => v.id === id) ?? null;
  }

  async findCovering(familyId: string, at: string): Promise<ExpectedVisit[]> {
    return (this.byFamily.get(familyId) ?? [])
      .filter((v) => v.startsAt <= at && at <= v.endsAt)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  async create(visit: NewVisit): Promise<ExpectedVisit> {
    const { familyId, ...rest } = visit;
    const created: ExpectedVisit = {
      id: uuidv4(),
      familyId,
      ...rest,
      // Distinct instant per row; visits are ordered by their window, not creation.
      createdAt: new Date(0).toISOString(),
    };
    const list = this.byFamily.get(familyId) ?? [];
    list.push(created);
    this.byFamily.set(familyId, list);
    return created;
  }

  async update(familyId: string, id: string, patch: VisitUpdate): Promise<ExpectedVisit | null> {
    const list = this.byFamily.get(familyId) ?? [];
    const index = list.findIndex((v) => v.id === id);
    if (index < 0) return null;
    const merged = { ...list[index]!, ...patch };
    list[index] = merged;
    return merged;
  }

  async delete(familyId: string, id: string): Promise<boolean> {
    const list = this.byFamily.get(familyId) ?? [];
    const index = list.findIndex((v) => v.id === id);
    if (index < 0) return false;
    list.splice(index, 1);
    return true;
  }
}
