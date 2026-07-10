import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { EscalationContact } from './temporal/types';
import { ContactRepository, ContactUpdate, NewContact } from './contact.repository';

@Injectable()
export class InMemoryContactRepository implements ContactRepository {
  private readonly byFamily = new Map<string, EscalationContact[]>();

  /** Seed a family's chain directly (used in tests / skeleton mode). */
  set(familyId: string, contacts: EscalationContact[]): void {
    this.byFamily.set(familyId, contacts);
  }

  async listByFamily(familyId: string): Promise<EscalationContact[]> {
    return [...(this.byFamily.get(familyId) ?? [])].sort((a, b) => a.priority - b.priority);
  }

  async findById(familyId: string, contactId: string): Promise<EscalationContact | null> {
    return (this.byFamily.get(familyId) ?? []).find((c) => c.id === contactId) ?? null;
  }

  async create(contact: NewContact): Promise<EscalationContact> {
    const { familyId, ...rest } = contact;
    const created: EscalationContact = { id: uuidv4(), ...rest };
    const list = this.byFamily.get(familyId) ?? [];
    list.push(created);
    this.byFamily.set(familyId, list);
    return created;
  }

  async update(
    familyId: string,
    contactId: string,
    update: ContactUpdate,
  ): Promise<EscalationContact | null> {
    const list = this.byFamily.get(familyId) ?? [];
    const index = list.findIndex((c) => c.id === contactId);
    if (index < 0) return null;
    const merged = { ...list[index]!, ...update };
    list[index] = merged;
    return merged;
  }

  async delete(familyId: string, contactId: string): Promise<boolean> {
    const list = this.byFamily.get(familyId) ?? [];
    const index = list.findIndex((c) => c.id === contactId);
    if (index < 0) return false;
    list.splice(index, 1);
    return true;
  }

  async redactByFamily(familyId: string): Promise<void> {
    for (const c of this.byFamily.get(familyId) ?? []) {
      c.name = 'Erased contact';
      c.phone = null;
      c.pushToken = null;
    }
  }
}
