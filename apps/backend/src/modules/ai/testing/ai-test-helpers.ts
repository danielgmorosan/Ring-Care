import type { ConverseCommand, ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import type { ConfigService } from '@nestjs/config';
import { AppConfig, validateEnv, type Env } from '../../../config/env.validation';
import type { BedrockSender } from '../bedrock.client';

/** A real AppConfig over a validated env, isolated from process.env. Test-only. */
export function appConfigFor(raw: Record<string, string>): AppConfig {
  const env = validateEnv(raw);
  const service = {
    get: (key: keyof Env) => env[key],
  } as unknown as ConfigService<Env, true>;
  return new AppConfig(service);
}

/** A Bedrock client stub: records every Converse input and returns a canned reply. */
export class StubBedrockClient implements BedrockSender {
  readonly inputs: ConverseCommand['input'][] = [];
  reply: (input: ConverseCommand['input'], signal?: AbortSignal) => Promise<ConverseCommandOutput> =
    async () => converseReply('A calm reply.');

  async send(
    command: ConverseCommand,
    options?: { abortSignal?: AbortSignal },
  ): Promise<ConverseCommandOutput> {
    this.inputs.push(command.input);
    return this.reply(command.input, options?.abortSignal);
  }
}

export function converseReply(text: string): ConverseCommandOutput {
  return {
    $metadata: { httpStatusCode: 200 },
    output: { message: { role: 'assistant', content: [{ text }] } },
    stopReason: 'end_turn',
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    metrics: { latencyMs: 1 },
  };
}

/** An AWS-SDK-shaped service error. */
export function awsError(name: string, status: number, message = 'aws says no'): Error {
  const err = new Error(message) as Error & { $metadata: { httpStatusCode: number } };
  err.name = name;
  err.$metadata = { httpStatusCode: status };
  return err;
}

export const EU_PROFILE = 'eu.anthropic.test-model-v1:0';
export const BEDROCK_ENV = { AI_PROVIDER: 'bedrock', BEDROCK_MODEL_ID: EU_PROFILE };
