import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../config/env.validation';
import { BEDROCK_CLIENT, type BedrockSender } from './bedrock.client';
import {
  DEFAULT_MAX_TOKENS,
  LLM_TEMPERATURE,
  LLM_TIMEOUT_MS,
  LlmProviderError,
  stripCodeFences,
  systemFor,
} from './llm-text';
import type { LlmPort, LlmRequest, LlmResponse } from './llm.port';

/**
 * Amazon Bedrock in an EU region (decision 0013) via the Converse API. Text in, text
 * out: the request carries a system prompt and one user text block, never image,
 * document, video or audio blocks (rules #1 and #4). Logs sizes, model and latency
 * only; never prompt or completion text.
 */
@Injectable()
export class BedrockLlmAdapter implements LlmPort {
  private readonly logger = new Logger(BedrockLlmAdapter.name);

  constructor(
    @Inject(BEDROCK_CLIENT) private readonly client: BedrockSender | null,
    private readonly config: AppConfig,
    private readonly timeoutMs: number = LLM_TIMEOUT_MS,
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const modelId = this.config.bedrockModelId;
    if (!this.client || !modelId) {
      // Should never happen: the module wires this adapter only when Bedrock is configured.
      throw new Error('BedrockLlmAdapter requires AI_PROVIDER=bedrock and BEDROCK_MODEL_ID');
    }

    const command = new ConverseCommand({
      modelId,
      system: [{ text: systemFor(request.system, request.json) }],
      messages: [{ role: 'user', content: [{ text: request.user }] }],
      inferenceConfig: {
        maxTokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: LLM_TEMPERATURE,
      },
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = Date.now();
    let output;
    try {
      output = await this.client.send(command, { abortSignal: controller.signal });
    } catch (err) {
      throw this.toError(err, modelId, controller.signal.aborted);
    } finally {
      clearTimeout(timer);
    }

    const raw = (output.output?.message?.content ?? [])
      .map((block) => (typeof block.text === 'string' ? block.text.trim() : ''))
      .filter(Boolean)
      .join(' ')
      .trim();
    if (!raw) {
      throw new LlmProviderError(
        'bedrock',
        'empty',
        `Bedrock returned no text (model ${modelId}, stopReason ${output.stopReason ?? 'unknown'})`,
      );
    }
    const text = request.json ? stripCodeFences(raw) : raw;

    this.logger.log(
      `bedrock converse ok model=${modelId} region=${this.config.bedrockRegion} ` +
        `in_chars=${request.system.length + request.user.length} out_chars=${text.length} ` +
        `in_tokens=${output.usage?.inputTokens ?? '?'} out_tokens=${output.usage?.outputTokens ?? '?'} ` +
        `ms=${Date.now() - started}`,
    );
    return { text, provider: 'bedrock', model: modelId };
  }

  /** Map an SDK error to a loggable message: kind, AWS error name, status. No prompt text. */
  private toError(err: unknown, modelId: string, aborted: boolean): LlmProviderError {
    if (aborted) {
      return new LlmProviderError(
        'bedrock',
        'timeout',
        `Bedrock timed out after ${this.timeoutMs} ms (model ${modelId})`,
      );
    }
    const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    const name = e.name ?? 'Error';
    const status = e.$metadata?.httpStatusCode;
    const kind: LlmProviderError['kind'] =
      name === 'AccessDeniedException' ||
      name === 'UnrecognizedClientException' ||
      name === 'CredentialsProviderError'
        ? 'auth'
        : name === 'ThrottlingException' || name === 'ServiceQuotaExceededException'
          ? 'throttled'
          : name === 'ValidationException' || name === 'ResourceNotFoundException'
            ? 'bad_request'
            : 'upstream';
    const hint =
      kind === 'auth'
        ? ' Check AWS credentials, the IAM policy, and model access in the Bedrock console.'
        : kind === 'bad_request'
          ? ' Check BEDROCK_MODEL_ID is an inference profile id available in BEDROCK_REGION.'
          : '';
    const detail = (e.message ?? '').slice(0, 200);
    return new LlmProviderError(
      'bedrock',
      kind,
      `Bedrock call failed: ${name}${status ? ` (${status})` : ''} for model ${modelId}: ${detail}.${hint}`,
    );
  }
}
