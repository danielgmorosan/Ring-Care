import { Injectable } from '@nestjs/common';
import {
  NIGHT_DOOR_OPENER_OUTCOMES,
  type RingCareDecision,
  type RingCareDecisionRepository,
} from './ring-care-decision.repository';

@Injectable()
export class InMemoryRingCareDecisionRepository implements RingCareDecisionRepository {
  private readonly byEvent = new Map<string, RingCareDecision>();

  async record(decision: RingCareDecision): Promise<boolean> {
    if (this.byEvent.has(decision.ringEventId)) return false; // one decision per event
    this.byEvent.set(decision.ringEventId, { ...decision });
    return true;
  }

  async findByRingEvent(ringEventId: string): Promise<RingCareDecision | null> {
    return this.byEvent.get(ringEventId) ?? null;
  }

  async latestNightDoorOpener(familyId: string): Promise<RingCareDecision | null> {
    const openers = [...this.byEvent.values()]
      .filter((d) => d.familyId === familyId && NIGHT_DOOR_OPENER_OUTCOMES.includes(d.outcome))
      .sort((a, b) => b.at.localeCompare(a.at));
    return openers[0] ?? null;
  }
}
