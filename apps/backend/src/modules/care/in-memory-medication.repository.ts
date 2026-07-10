import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { Medication } from './medication.entity';
import { MedicationRepository, MedicationUpdate, NewMedication } from './medication.repository';

@Injectable()
export class InMemoryMedicationRepository implements MedicationRepository {
  private readonly byFamily = new Map<string, Medication[]>();
  private seq = 0;

  async listByFamily(familyId: string): Promise<Medication[]> {
    return [...(this.byFamily.get(familyId) ?? [])].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
  }

  async findById(familyId: string, id: string): Promise<Medication | null> {
    return (this.byFamily.get(familyId) ?? []).find((m) => m.id === id) ?? null;
  }

  async create(medication: NewMedication): Promise<Medication> {
    const { familyId, ...rest } = medication;
    const created: Medication = {
      id: uuidv4(),
      familyId,
      ...rest,
      // Monotonic synthetic timestamp; avoids Date.now() for stable test ordering.
      createdAt: new Date(this.seq++).toISOString(),
    };
    const list = this.byFamily.get(familyId) ?? [];
    list.push(created);
    this.byFamily.set(familyId, list);
    return created;
  }

  async update(familyId: string, id: string, patch: MedicationUpdate): Promise<Medication | null> {
    const list = this.byFamily.get(familyId) ?? [];
    const index = list.findIndex((m) => m.id === id);
    if (index < 0) return null;
    const merged = { ...list[index]!, ...patch };
    list[index] = merged;
    return merged;
  }

  async delete(familyId: string, id: string): Promise<boolean> {
    const list = this.byFamily.get(familyId) ?? [];
    const index = list.findIndex((m) => m.id === id);
    if (index < 0) return false;
    list.splice(index, 1);
    return true;
  }
}
