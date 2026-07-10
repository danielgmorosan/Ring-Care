import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { SightingDecision } from './sighting-decision.entity';
import { NewSightingDecision, SightingRepository } from './sighting.repository';

@Injectable()
export class InMemorySightingRepository implements SightingRepository {
  private readonly byFamily = new Map<string, SightingDecision[]>();
  private readonly seenEventIds = new Set<string>();
  private seq = 0;

  async append(decision: NewSightingDecision): Promise<void> {
    if (this.seenEventIds.has(decision.eventId)) return; // idempotent on eventId
    this.seenEventIds.add(decision.eventId);
    const record: SightingDecision = {
      id: uuidv4(),
      ...decision,
      // Monotonic synthetic timestamp; avoids Date.now() for stable test ordering.
      recordedAt: new Date(this.seq++).toISOString(),
    };
    const list = this.byFamily.get(decision.familyId) ?? [];
    list.push(record);
    this.byFamily.set(decision.familyId, list);
  }

  async listByFamily(familyId: string): Promise<SightingDecision[]> {
    return [...(this.byFamily.get(familyId) ?? [])].sort((a, b) => b.at.localeCompare(a.at));
  }
}
