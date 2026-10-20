import type { LlmPort, LlmRequest, LlmResponse } from '../../ai/llm.port';
import {
  CareExtractorService,
  parseLlmExtraction,
  type ExtractionInput,
} from './care-extractor.service';

const DEMO =
  "Mom's Donepezil goes to 5 mg at 8 pm from Monday, blood test in two weeks, pick up the new prescription";

const input: ExtractionInput = {
  text: DEMO,
  // 14:05 in Lisbon on Tuesday 20 October 2026.
  spokenAt: '2026-10-20T13:05:00.000Z',
  timezone: 'Europe/Lisbon',
  currentMedications: [{ name: 'Donepezil', dosage: '10 mg', times: ['08:00'] }],
};

class FakeLlm implements LlmPort {
  requests: LlmRequest[] = [];
  constructor(private readonly reply: Partial<LlmResponse> | Error) {}
  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push(request);
    if (this.reply instanceof Error) throw this.reply;
    return { text: '', provider: 'bedrock', model: 'eu.anthropic.claude-test', ...this.reply };
  }
}

const VALID = JSON.stringify({
  summary: 'Donepezil changes to 5 mg in the evening, and a blood test is due.',
  items: [
    {
      kind: 'medication_change',
      title: 'Donepezil to 5 mg at 20:00',
      detail: 'goes to 5 mg at 8 pm from Monday',
      data: {
        medicationName: 'Donepezil',
        dose: '5 mg',
        times: ['20:00'],
        startDate: '2026-10-26',
      },
    },
    {
      kind: 'appointment',
      title: 'Blood test',
      detail: 'blood test in two weeks',
      data: { title: 'Blood test', date: '2026-11-03', time: null },
    },
  ],
});

describe('CareExtractorService', () => {
  it('uses validated LLM output and records the provider and model', async () => {
    const llm = new FakeLlm({ text: VALID });
    const result = await new CareExtractorService(llm).extract(input);
    expect(result.extractedBy).toBe('bedrock:eu.anthropic.claude-test');
    expect(result.items.map((i) => i.kind)).toEqual(['medication_change', 'appointment']);
    expect(result.items[1]!.data).toEqual({
      title: 'Blood test',
      date: '2026-11-03',
      time: null,
      location: null,
    });
    expect(result.summary).toContain('Donepezil');
  });

  it('sends only the caregiver text and date context, as JSON mode', async () => {
    const llm = new FakeLlm({ text: VALID });
    await new CareExtractorService(llm).extract(input);
    const req = llm.requests[0]!;
    expect(req.json).toBe(true);
    const user = JSON.parse(req.user);
    expect(user).toEqual({
      noteLocalDate: '2026-10-20',
      noteWeekday: 'Tuesday',
      timezone: 'Europe/Lisbon',
      currentMedications: input.currentMedications,
      note: DEMO,
    });
  });

  it.each([
    ['invalid JSON', { text: 'Sure! Here are the items: medication...' }],
    ['the wrong shape', { text: '{"things": []}' }],
    ['the mock marker', { text: '{"mock":true}' }],
    ['the mock provider', { text: VALID, provider: 'mock' as const, model: 'mock' }],
  ])('falls back to the rules extractor on %s', async (_label, reply) => {
    const result = await new CareExtractorService(new FakeLlm(reply)).extract(input);
    expect(result.extractedBy).toBe('rules:v1');
    expect(result.items.map((i) => i.kind)).toEqual(['medication_change', 'appointment', 'todo']);
  });

  it('falls back when the LLM throws or no LLM is provided', async () => {
    const thrown = await new CareExtractorService(new FakeLlm(new Error('timeout'))).extract(input);
    expect(thrown.extractedBy).toBe('rules:v1');
    const none = await new CareExtractorService(undefined).extract(input);
    expect(none.extractedBy).toBe('rules:v1');
    expect(none.items[0]).toMatchObject({
      kind: 'medication_change',
      data: {
        medicationName: 'Donepezil',
        dose: '5 mg',
        times: ['20:00'],
        startDate: '2026-10-26',
      },
    });
  });

  it('returns no items for an empty note without calling the LLM', async () => {
    const llm = new FakeLlm({ text: VALID });
    const result = await new CareExtractorService(llm).extract({ ...input, text: '   ' });
    expect(result.items).toEqual([]);
    expect(llm.requests).toHaveLength(0);
  });
});

describe('parseLlmExtraction', () => {
  it('accepts fenced JSON', () => {
    expect(parseLlmExtraction('```json\n' + VALID + '\n```')?.items).toHaveLength(2);
  });

  it('downgrades items it cannot trust to notes, and drops unreadable ones', () => {
    const parsed = parseLlmExtraction(
      JSON.stringify({
        summary: 'x',
        items: [
          // Impossible date: never guessed, kept as a note.
          {
            kind: 'appointment',
            title: 'Scan',
            detail: 'scan on the 31st',
            data: { title: 'Scan', date: '2026-02-31' },
          },
          // Nothing to apply.
          {
            kind: 'medication_change',
            title: 'Donepezil',
            detail: 'talk about donepezil',
            data: { medicationName: 'Donepezil' },
          },
          // Bad time format.
          {
            kind: 'todo',
            title: 'Call GP',
            data: { text: 'Call GP', dueDate: '2026-10-22', dueTime: '8pm' },
          },
          { kind: 'mystery' },
          'not an object',
        ],
      }),
    );
    expect(parsed?.items).toEqual([
      {
        kind: 'note',
        title: 'Scan',
        detail: 'scan on the 31st',
        data: { text: 'scan on the 31st' },
      },
      {
        kind: 'note',
        title: 'Donepezil',
        detail: 'talk about donepezil',
        data: { text: 'talk about donepezil' },
      },
      { kind: 'note', title: 'Call GP', detail: '', data: { text: 'Call GP' } },
    ]);
  });

  it('returns an empty proposal for a note with no care content', () => {
    expect(parseLlmExtraction('{"summary":"","items":[]}')).toEqual({ summary: '', items: [] });
  });
});
