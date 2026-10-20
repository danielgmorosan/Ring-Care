import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../config/env.validation';
import {
  DEFAULT_MAX_TOKENS,
  LLM_TEMPERATURE,
  LLM_TIMEOUT_MS,
  LlmProviderError,
  stripCodeFences,
  systemFor,
} from './llm-text';
import type { LlmPort, LlmRequest, LlmResponse } from './llm.port';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * The Claude API directly, same fetch pattern as the Claude narration adapter. Leaves
 * the EU, so it stays gated on decision 0002. Text in, text out only.
 */
@Injectable()
export class AnthropicLlmAdapter implements LlmPort {
  private readonly logger = new Logger(AnthropicLlmAdapter.name);

  constructor(
    private readonly config: AppConfig,
    private readonly timeoutMs: number = LLM_TIMEOUT_MS,
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const apiKey = this.config.anthropicApiKey;
    if (!apiKey) throw new Error('AnthropicLlmAdapter requires ANTHROPIC_API_KEY');
    const model = this.config.anthropicModel;

    let res: Response;
    try {
      res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          temperature: LLM_TEMPERATURE,
          system: systemFor(request.system, request.json),
          messages: [{ role: 'user', content: request.user }],
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const name = (err as Error).name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new LlmProviderError(
          'anthropic',
          'timeout',
          `Claude API timed out after ${this.timeoutMs} ms`,
        );
      }
      throw new LlmProviderError('anthropic', 'upstream', `Claude API unreachable: ${name}`);
    }

    if (!res.ok) {
      const kind =
        res.status === 401 || res.status === 403
          ? 'auth'
          : res.status === 429
            ? 'throttled'
            : res.status === 400
              ? 'bad_request'
              : 'upstream';
      throw new LlmProviderError(
        'anthropic',
        kind,
        `Claude API failed (${res.status}) for model ${model}`,
      );
    }

    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const raw = (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text!.trim())
      .join(' ')
      .trim();
    if (!raw)
      throw new LlmProviderError(
        'anthropic',
        'empty',
        `Claude API returned no text (model ${model})`,
      );

    const text = request.json ? stripCodeFences(raw) : raw;
    this.logger.log(
      `anthropic ok model=${model} in_chars=${request.system.length + request.user.length} out_chars=${text.length}`,
    );
    return { text, provider: 'anthropic', model };
  }
}
