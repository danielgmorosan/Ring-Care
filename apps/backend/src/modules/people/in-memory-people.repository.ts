import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { Person } from './person.entity';
import { NewPerson, PeopleRepository, PersonUpdate } from './people.repository';

@Injectable()
export class InMemoryPeopleRepository implements PeopleRepository {
  private readonly byFamily = new Map<string, Person[]>();
  private seq = 0;

  async listByFamily(familyId: string): Promise<Person[]> {
    return [...(this.byFamily.get(familyId) ?? [])]
      .filter((p) => p.active)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async findById(familyId: string, id: string): Promise<Person | null> {
    return (this.byFamily.get(familyId) ?? []).find((p) => p.id === id) ?? null;
  }

  async create(person: NewPerson): Promise<Person> {
    const { familyId, ...rest } = person;
    const created: Person = {
      id: uuidv4(),
      familyId,
      ...rest,
      active: true,
      // Monotonic synthetic timestamp; avoids Date.now() for stable test ordering.
      createdAt: new Date(this.seq++).toISOString(),
    };
    const list = this.byFamily.get(familyId) ?? [];
    list.push(created);
    this.byFamily.set(familyId, list);
    return created;
  }

  async update(familyId: string, id: string, patch: PersonUpdate): Promise<Person | null> {
    const list = this.byFamily.get(familyId) ?? [];
    const index = list.findIndex((p) => p.id === id && p.active);
    if (index < 0) return null;
    const merged = { ...list[index]!, ...patch };
    list[index] = merged;
    return merged;
  }

  async deactivate(familyId: string, id: string): Promise<boolean> {
    const list = this.byFamily.get(familyId) ?? [];
    const person = list.find((p) => p.id === id && p.active);
    if (!person) return false;
    person.active = false;
    return true;
  }
}
