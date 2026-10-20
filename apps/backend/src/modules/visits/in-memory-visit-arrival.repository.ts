import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { VisitArrival } from './visit-arrival.entity';
import type { NewVisitArrival, VisitArrivalRepository } from './visit-arrival.repository';

@Injectable()
export class InMemoryVisitArrivalRepository implements VisitArrivalRepository {
  private readonly byVisit = new Map<string, VisitArrival>();

  async record(arrival: NewVisitArrival): Promise<boolean> {
    if (this.byVisit.has(arrival.visitId)) return false; // one arrival per visit
    this.byVisit.set(arrival.visitId, { id: uuidv4(), ...arrival });
    return true;
  }

  async findByVisit(visitId: string): Promise<VisitArrival | null> {
    return this.byVisit.get(visitId) ?? null;
  }

  async listByFamily(familyId: string): Promise<VisitArrival[]> {
    return [...this.byVisit.values()]
      .filter((a) => a.familyId === familyId)
      .sort((a, b) => b.arrivedAt.localeCompare(a.arrivedAt));
  }
}
