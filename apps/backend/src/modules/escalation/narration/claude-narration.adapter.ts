import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config/env.validation';
import type {
  DailySummaryRequest,
  Narration,
  NarrationPort,
  NarrationRequest,
  QuestionRequest,
} from './narration.port';
import { DAILY_SYSTEM_PROMPT, INCIDENT_SYSTEM_PROMPT, QA_SYSTEM_PROMPT } from './narration.prompts';
import { forModel } from './incident-meanings';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * The real narration adapter: the Claude API turns the structured trail into a warm
 * summary (text in, text out — never media, per rule #1). Uses fetch directly to
 * avoid a heavy SDK dependency. Enabled only when ANTHROPIC_API_KEY is set, which is
 * itself gated on a recorded founder decision because the request leaves the EU
 * (rule #6). The request carries roles/labels/times/outcome only — no names.
 */
@Injectable()
export class ClaudeNarrationAdapter implements NarrationPort {
  constructor(private readonly config: AppConfig) {}

  narrate(request: NarrationRequest): Promise<Narration> {
    return this.callClaude(INCIDENT_SYSTEM_PROMPT, request);
  }

  summarizeDay(request: DailySummaryRequest): Promise<Narration> {
    return this.callClaude(DAILY_SYSTEM_PROMPT, forModel(request));
  }

  answer(request: QuestionRequest): Promise<Narration> {
    return this.callClaude(QA_SYSTEM_PROMPT, forModel(request));
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
