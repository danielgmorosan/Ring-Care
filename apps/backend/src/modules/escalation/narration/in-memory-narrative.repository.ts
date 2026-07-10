import { Injectable } from '@nestjs/common';
import type { NarrativeRecord, NarrativeRepository } from './narrative.repository';

@Injectable()
export class InMemoryNarrativeRepository implements NarrativeRepository {
  private readonly byIncident = new Map<string, NarrativeRecord[]>();
  private seq = 0;

  async getLatest(incidentId: string): Promise<NarrativeRecord | null> {
    const list = this.byIncident.get(incidentId);
    return list && list.length ? list[list.length - 1]! : null;
  }

  async append(record: Omit<NarrativeRecord, 'createdAt'>): Promise<NarrativeRecord> {
    // Monotonic synthetic timestamp; Date.now() is avoided for deterministic tests.
    const full: NarrativeRecord = {
      ...record,
      createdAt: new Date(this.seq++).toISOString(),
    };
    const list = this.byIncident.get(record.incidentId) ?? [];
    list.push(full);
    this.byIncident.set(record.incidentId, list);
    return full;
  }
}
