import { Injectable } from '@nestjs/common';
import {
  NIGHT_DOOR_OPENER_OUTCOMES,
  type RingCareDecision,
  type RingCareDecisionRepository,
} from './ring-care-decision.repository';

@Injectable()
export class InMemoryRingCareDecisionRepository implements RingCareDecisionRepository {
  private readonly byEvent = new Map<string, RingCareDecision>();

  /** `now` stands in for the database's now() on recorded_at (tests pass a fake clock). */
  constructor(private readonly now: () => Date = () => new Date()) {}

  async record(decision: RingCareDecision): Promise<boolean> {
    if (this.byEvent.has(decision.ringEventId)) return false; // one decision per event
    this.byEvent.set(decision.ringEventId, {
      ...decision,
      recordedAt: this.now().toISOString(),
    });
    return true;
  }

  async findByRingEvent(ringEventId: string): Promise<RingCareDecision | null> {
    const d = this.byEvent.get(ringEventId);
    return d ? { ...d } : null;
  }

  async latestNightDoorOpener(familyId: string): Promise<RingCareDecision | null> {
    const openers = [...this.byEvent.values()]
      .filter((d) => d.familyId === familyId && NIGHT_DOOR_OPENER_OUTCOMES.includes(d.outcome))
      .sort((a, b) => (b.recordedAt ?? b.at).localeCompare(a.recordedAt ?? a.at));
    return openers[0] ?? null;
  }
}
