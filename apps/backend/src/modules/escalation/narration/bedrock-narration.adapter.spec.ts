import { Logger } from '@nestjs/common';
import { BedrockLlmAdapter } from '../../ai/bedrock-llm.adapter';
import {
  appConfigFor,
  awsError,
  BEDROCK_ENV,
  converseReply,
  EU_PROFILE,
  StubBedrockClient,
} from '../../ai/testing/ai-test-helpers';
import type { Incident, IncidentStepView } from '../incident.repository';
import { BedrockNarrationAdapter } from './bedrock-narration.adapter';
import { InMemoryNarrativeRepository } from './in-memory-narrative.repository';
import { MockNarrationAdapter } from './mock-narration.adapter';
import { DAILY_SYSTEM_PROMPT, INCIDENT_SYSTEM_PROMPT, QA_SYSTEM_PROMPT } from './narration.prompts';
import { NarrationService } from './narration.service';

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

function setup() {
  const client = new StubBedrockClient();
  const narrator = new BedrockNarrationAdapter(
    new BedrockLlmAdapter(client, appConfigFor(BEDROCK_ENV)),
  );
  const repo = new InMemoryNarrativeRepository();
  const service = new NarrationService(narrator, repo, new MockNarrationAdapter());
  return { client, repo, service };
}

describe('BedrockNarrationAdapter (end to end with a stubbed client)', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('narrates an incident with the shared prompt and records bedrock + model id', async () => {
    const { client, repo, service } = setup();
    client.reply = async () =>
      converseReply('We noticed a possible fall at 15:12. Your daughter has it.');
    const steps = [
      step({ seq: 0, kind: 'incident_opened' }),
      step({ seq: 1, kind: 'call_answered', contactName: 'Ana Silva', contactRole: 'daughter' }),
      step({
        seq: 2,
        kind: 'voice_checkin_result',
        detail: { result: 'i_am_fine', transcript: 'private words' },
      }),
    ];

    const text = await service.narrativeFor(incident, steps, 'acknowledged');

    expect(text).toBe('We noticed a possible fall at 15:12. Your daughter has it.');
    const input = client.inputs[0]!;
    expect(input.modelId).toBe(EU_PROFILE);
    expect(input.system).toEqual([{ text: INCIDENT_SYSTEM_PROMPT }]);
    const user = input.messages![0]!.content![0]!.text!;
    expect(JSON.parse(user)).toMatchObject({ reason: 'fall.suspected', outcome: 'acknowledged' });
    expect(user).toContain('daughter');
    expect(user).toContain('i_am_fine');
    expect(user).not.toContain('Ana');
    expect(user).not.toContain('Silva');
    expect(user).not.toContain('private words');

    const stored = await repo.getLatest('inc-1');
    expect(stored).toMatchObject({ generatedBy: 'bedrock', model: EU_PROFILE });
  });

  it('daily summary and Q&A use their shared prompts', async () => {
    const { client, service } = setup();
    await service.summarizeDay({
      date: '2026-07-05',
      incidents: [],
      guardiansTotal: 1,
      guardiansOnline: 1,
    });
    await service.answer({
      question: 'Did she take her pills?',
      context: {
        timezone: 'UTC',
        incidents: [],
        guardians: { total: 1, online: 1 },
        medications: [],
        appointments: [],
      },
    });
    expect(client.inputs[0]!.system).toEqual([{ text: DAILY_SYSTEM_PROMPT }]);
    expect(client.inputs[1]!.system).toEqual([{ text: QA_SYSTEM_PROMPT }]);
    expect(client.inputs[1]!.messages![0]!.content![0]!.text).toContain('Did she take her pills?');
  });

  it('falls back to the local mock when Bedrock fails, and stores it as mock', async () => {
    const { client, repo, service } = setup();
    client.reply = async () => {
      throw awsError('AccessDeniedException', 403);
    };

    const text = await service.narrativeFor(
      incident,
      [step({ seq: 0, kind: 'incident_opened' })],
      'stood_down',
    );

    expect(text).toContain('possible fall');
    expect((await repo.getLatest('inc-1'))?.generatedBy).toBe('mock');
  });
});
