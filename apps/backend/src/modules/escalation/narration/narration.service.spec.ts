import type { Incident, IncidentStepView } from '../incident.repository';
import { MockNarrationAdapter } from './mock-narration.adapter';
import { InMemoryNarrativeRepository } from './in-memory-narrative.repository';
import { NarrationService } from './narration.service';
import type {
  DailySummaryRequest,
  Narration,
  NarrationPort,
  NarrationRequest,
  QuestionRequest,
} from './narration.port';

/** A port that records what it was asked to narrate, and can be made to fail. */
class SpyNarrationPort implements NarrationPort {
  requests: NarrationRequest[] = [];
  summaryRequests: DailySummaryRequest[] = [];
  fail = false;
  async narrate(request: NarrationRequest): Promise<Narration> {
    this.requests.push(request);
    if (this.fail) throw new Error('boom');
    return { text: 'spy narrative', generatedBy: 'claude', model: 'test-model' };
  }
  async summarizeDay(request: DailySummaryRequest): Promise<Narration> {
    this.summaryRequests.push(request);
    if (this.fail) throw new Error('boom');
    return { text: 'spy summary', generatedBy: 'claude', model: 'test-model' };
  }
  async answer(_request: QuestionRequest): Promise<Narration> {
    if (this.fail) throw new Error('boom');
    return { text: 'spy answer', generatedBy: 'claude', model: 'test-model' };
  }
}

const incident: Incident = {
  id: 'inc-1',
  familyId: 'fam-1',
  deviceId: 'dev-1',
  triggeringEventId: null,
  reason: 'fall.suspected',
  openedAt: '2026-07-05T14:12:00.000Z',
};

function step(
  over: Partial<IncidentStepView> & Pick<IncidentStepView, 'seq' | 'kind'>,
): IncidentStepView {
  return { contactName: null, contactRole: null, detail: {}, occurredAt: null, ...over };
}

describe('NarrationService', () => {
  describe('privacy: what reaches the adapter', () => {
    it('never sends contact names — only roles, labels, times, outcome', async () => {
      const spy = new SpyNarrationPort();
      const service = new NarrationService(
        spy,
        new InMemoryNarrativeRepository(),
        new MockNarrationAdapter(),
      );

      const steps: IncidentStepView[] = [
        step({ seq: 0, kind: 'incident_opened' }),
        step({ seq: 1, kind: 'call_answered', contactName: 'Ana Silva', contactRole: 'daughter' }),
      ];

      await service.narrativeFor(incident, steps, 'acknowledged');

      const sent = JSON.stringify(spy.requests[0]);
      expect(sent).not.toContain('Ana');
      expect(sent).not.toContain('Silva');
      expect(sent).toContain('daughter');
    });

    it('forwards only allowlisted voice check-in results, not raw detail', async () => {
      const spy = new SpyNarrationPort();
      const service = new NarrationService(
        spy,
        new InMemoryNarrativeRepository(),
        new MockNarrationAdapter(),
      );

      const steps: IncidentStepView[] = [
        step({
          seq: 0,
          kind: 'voice_checkin_result',
          detail: { result: 'i_am_fine', transcript: 'secret words the elder said' },
        }),
      ];

      await service.narrativeFor(incident, steps, 'stood_down');

      const sent = JSON.stringify(spy.requests[0]);
      expect(sent).toContain('i_am_fine');
      expect(sent).not.toContain('transcript');
      expect(sent).not.toContain('secret words');
    });
  });

  describe('persistence', () => {
    it('narrates a terminal incident once and reuses the stored text', async () => {
      const spy = new SpyNarrationPort();
      const repo = new InMemoryNarrativeRepository();
      const service = new NarrationService(spy, repo, new MockNarrationAdapter());
      const steps = [step({ seq: 0, kind: 'incident_opened' })];

      const first = await service.narrativeFor(incident, steps, 'stood_down');
      const second = await service.narrativeFor(incident, steps, 'stood_down');

      expect(first).toBe('spy narrative');
      expect(second).toBe('spy narrative');
      expect(spy.requests).toHaveLength(1); // second call reused the stored narrative
      expect((await repo.getLatest('inc-1'))?.generatedBy).toBe('claude');
    });

    it('does not persist an active incident, narrating fresh each open', async () => {
      const spy = new SpyNarrationPort();
      const repo = new InMemoryNarrativeRepository();
      const service = new NarrationService(spy, repo, new MockNarrationAdapter());
      const steps = [step({ seq: 0, kind: 'incident_opened' })];

      await service.narrativeFor(incident, steps, 'active');
      await service.narrativeFor(incident, steps, 'active');

      expect(spy.requests).toHaveLength(2); // regenerated, not cached
      expect(await repo.getLatest('inc-1')).toBeNull();
    });
  });

  describe('resilience', () => {
    it('falls back to the local mock when the adapter throws', async () => {
      const spy = new SpyNarrationPort();
      spy.fail = true;
      const service = new NarrationService(
        spy,
        new InMemoryNarrativeRepository(),
        new MockNarrationAdapter(),
      );
      const steps = [
        step({ seq: 0, kind: 'incident_opened' }),
        step({ seq: 1, kind: 'voice_checkin_result', detail: { result: 'i_am_fine' } }),
      ];

      const text = await service.narrativeFor(incident, steps, 'stood_down');

      // The mock's deterministic wording, proving the fallback ran.
      expect(text).toContain('possible fall');
      expect(text).toContain('All is well.');
    });
  });
});

describe('MockNarrationAdapter', () => {
  it('builds a warm, ordered narrative with no em dashes or exclamations', async () => {
    const mock = new MockNarrationAdapter();
    const steps: IncidentStepView[] = [
      {
        seq: 0,
        kind: 'incident_opened',
        contactName: null,
        contactRole: null,
        detail: {},
        occurredAt: null,
      },
      {
        seq: 1,
        kind: 'voice_checkin_result',
        contactName: null,
        contactRole: null,
        detail: {},
        occurredAt: null,
      },
      {
        seq: 2,
        kind: 'call_no_answer',
        contactName: null,
        contactRole: 'son',
        detail: {},
        occurredAt: null,
      },
      {
        seq: 3,
        kind: 'call_answered',
        contactName: null,
        contactRole: 'daughter',
        detail: {},
        occurredAt: null,
      },
    ];
    const service = new NarrationService(mock, new InMemoryNarrativeRepository(), mock);

    const text = await service.narrativeFor(incident, steps, 'acknowledged');

    expect(text).toContain('We noticed a possible fall at');
    expect(text).toContain('Your son did not answer.');
    expect(text).toContain('We reached your daughter by phone.');
    expect(text).toContain('A family member has it from here.');
    expect(text).not.toContain('—');
    expect(text).not.toContain('!');
  });
});

describe('Q&A (answer)', () => {
  const context = {
    timezone: 'UTC',
    incidents: [],
    guardians: { total: 1, online: 1 },
    medications: [{ name: 'Bisoprolol', times: ['08:00'] }],
    appointments: [],
  };

  it('the mock digests the context deterministically', async () => {
    const mock = new MockNarrationAdapter();
    const { text } = await mock.answer({ question: 'anything', context });
    expect(text).toContain('Here is what I can tell you');
    expect(text).toContain('Nothing has needed attention recently.');
    expect(text).toContain('One medication on the schedule.');
    expect(text).not.toContain('!');
  });

  it('NarrationService.answer falls back to the mock when the port fails', async () => {
    const spy = new SpyNarrationPort();
    spy.fail = true;
    const service = new NarrationService(
      spy,
      new InMemoryNarrativeRepository(),
      new MockNarrationAdapter(),
    );
    const text = await service.answer({ question: 'q', context });
    expect(text).toContain('Here is what I can tell you');
  });
});
