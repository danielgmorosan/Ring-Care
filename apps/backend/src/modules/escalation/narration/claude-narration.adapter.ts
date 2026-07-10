import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config/env.validation';
import type {
  DailySummaryRequest,
  Narration,
  NarrationPort,
  NarrationRequest,
  QuestionRequest,
} from './narration.port';

/**
 * The real narration adapter: the Claude API turns the structured trail into a warm
 * summary (text in, text out — never media, per rule #1). Uses fetch directly to
 * avoid a heavy SDK dependency. Enabled only when ANTHROPIC_API_KEY is set, which is
 * itself gated on a recorded founder decision because the request leaves the EU
 * (rule #6). The request carries roles/labels/times/outcome only — no names.
 */
const INCIDENT_SYSTEM_PROMPT = [
  'You narrate eldercare safety incidents for a worried family member.',
  'You receive a structured JSON log of what the system did. Write 2 to 4 short',
  'sentences describing what happened and how it resolved.',
  'Voice: warm without being sentimental, confident without being cold. Short',
  'declarative sentences. No em dashes. Inform and reassure. Never dramatize and',
  'never use exclamation marks. Refer to people by their role ("your daughter"),',
  'never invent names, details, medical facts, or locations not present in the log.',
  'Return only the summary text, no preamble.',
].join(' ');

const DAILY_SYSTEM_PROMPT = [
  "You write a family member's calm daily recap for an eldercare guardian.",
  'You receive structured JSON: the incidents of the day (may be empty) and how many',
  'guardian devices are online. Write 2 to 3 short sentences. On a day with no',
  'incidents, reassure plainly that it was calm. Otherwise summarize briefly and say',
  'whether things are settled. Voice: warm, confident, never dramatic. Short',
  'declarative sentences. No em dashes, no exclamation marks. Refer to people by role',
  'only, never invent names, meals, activities, or facts not present in the JSON.',
  'Return only the recap text, no preamble.',
].join(' ');

const QA_SYSTEM_PROMPT = [
  "You answer a caregiver's question about their family, for an eldercare service.",
  'You receive their question and a structured JSON snapshot of the family record:',
  'recent incidents, guardian online counts, medications, and appointments. Answer the',
  'question using ONLY those facts. If the snapshot does not contain the answer, say so',
  'plainly and do not guess. Never invent incidents, people, medical facts, or dates',
  'not present in the JSON. Refer to people by role, never by name. Voice: warm,',
  'confident, brief. Short declarative sentences. No em dashes, no exclamation marks.',
  'Return only the answer, no preamble.',
].join(' ');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

@Injectable()
export class ClaudeNarrationAdapter implements NarrationPort {
  constructor(private readonly config: AppConfig) {}

  narrate(request: NarrationRequest): Promise<Narration> {
    return this.callClaude(INCIDENT_SYSTEM_PROMPT, request);
  }

  summarizeDay(request: DailySummaryRequest): Promise<Narration> {
    return this.callClaude(DAILY_SYSTEM_PROMPT, request);
  }

  answer(request: QuestionRequest): Promise<Narration> {
    return this.callClaude(QA_SYSTEM_PROMPT, request);
  }

  /** One Claude Messages call. The payload is already minimized by the caller. */
  private async callClaude(system: string, payload: unknown): Promise<Narration> {
    const apiKey = this.config.anthropicApiKey;
    if (!apiKey) {
      // Should never happen: the module only wires this adapter when the key is set.
      throw new Error('ClaudeNarrationAdapter requires ANTHROPIC_API_KEY');
    }
    const model = this.config.anthropicModel;

    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        system,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Claude narration failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text!.trim())
      .join(' ')
      .trim();

    if (!text) {
      throw new Error('Claude narration returned no text');
    }
    return { text, generatedBy: 'claude', model };
  }
}
