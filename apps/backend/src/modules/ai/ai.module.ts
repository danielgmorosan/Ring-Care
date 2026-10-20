import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { Module } from '@nestjs/common';
import { AppConfig } from '../../config/env.validation';
import { AnthropicLlmAdapter } from './anthropic-llm.adapter';
import { BedrockLlmAdapter } from './bedrock-llm.adapter';
import { assertEuBedrockConfig, BEDROCK_CLIENT, type BedrockSender } from './bedrock.client';
import { LLM_PORT, type LlmPort } from './llm.port';
import { MockLlmAdapter } from './mock-llm.adapter';

/** Pick the LlmPort implementation for the configured provider. Exported for tests. */
export function selectLlm(
  config: AppConfig,
  adapters: { mock: LlmPort; anthropic: LlmPort; bedrock: LlmPort },
): LlmPort {
  switch (config.aiProvider) {
    case 'bedrock':
      return adapters.bedrock;
    case 'anthropic':
      return adapters.anthropic;
    default:
      return adapters.mock;
  }
}

/** The real Bedrock client only when Bedrock is the provider; null otherwise. */
export function createBedrockClient(config: AppConfig): BedrockSender | null {
  if (config.aiProvider !== 'bedrock') return null;
  assertEuBedrockConfig(config.bedrockRegion, config.bedrockModelId!);
  // Credentials resolve through the default AWS provider chain, never from code.
  return new BedrockRuntimeClient({ region: config.bedrockRegion, maxAttempts: 2 });
}

/**
 * AI provider wiring (decision 0013). Provides LLM_PORT: Bedrock in an EU region when
 * AI_PROVIDER=bedrock, the Claude API when 'anthropic', otherwise a deterministic mock.
 * LLM output is descriptive text only and never holds authority over escalation (rule #3).
 */
@Module({
  providers: [
    MockLlmAdapter,
    {
      provide: AnthropicLlmAdapter,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => new AnthropicLlmAdapter(config),
    },
    { provide: BEDROCK_CLIENT, inject: [AppConfig], useFactory: createBedrockClient },
    {
      provide: BedrockLlmAdapter,
      inject: [BEDROCK_CLIENT, AppConfig],
      useFactory: (client: BedrockSender | null, config: AppConfig) =>
        new BedrockLlmAdapter(client, config),
    },
    {
      provide: LLM_PORT,
      inject: [AppConfig, MockLlmAdapter, AnthropicLlmAdapter, BedrockLlmAdapter],
      useFactory: (
        config: AppConfig,
        mock: MockLlmAdapter,
        anthropic: AnthropicLlmAdapter,
        bedrock: BedrockLlmAdapter,
      ) => selectLlm(config, { mock, anthropic, bedrock }),
    },
  ],
  exports: [LLM_PORT, BedrockLlmAdapter],
})
export class AiModule {}
