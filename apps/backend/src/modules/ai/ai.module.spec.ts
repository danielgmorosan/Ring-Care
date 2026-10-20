import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppConfig } from '../../config/env.validation';
import { selectNarrator } from '../escalation/narration/select-narrator';
import type { NarrationPort } from '../escalation/narration/narration.port';
import { AiModule, createBedrockClient } from './ai.module';
import { AnthropicLlmAdapter } from './anthropic-llm.adapter';
import { BedrockLlmAdapter } from './bedrock-llm.adapter';
import { assertEuBedrockConfig, BEDROCK_CLIENT } from './bedrock.client';
import { LLM_PORT, type LlmPort } from './llm.port';
import { MockLlmAdapter } from './mock-llm.adapter';
import {
  appConfigFor,
  BEDROCK_ENV,
  EU_PROFILE,
  StubBedrockClient,
} from './testing/ai-test-helpers';

async function llmFor(env: Record<string, string>): Promise<LlmPort> {
  const config = appConfigFor(env);
  @Global()
  @Module({ providers: [{ provide: AppConfig, useValue: config }], exports: [AppConfig] })
  class TestConfigModule {}

  const moduleRef = await Test.createTestingModule({ imports: [TestConfigModule, AiModule] })
    .overrideProvider(BEDROCK_CLIENT)
    .useValue(new StubBedrockClient())
    .compile();
  return moduleRef.get<LlmPort>(LLM_PORT);
}

// [env, expected LLM adapter, expected narrator]
const MATRIX: Array<[string, Record<string, string>, unknown, 'mock' | 'claude' | 'bedrock']> = [
  ['nothing configured', {}, MockLlmAdapter, 'mock'],
  [
    'AI_PROVIDER unset, Claude key set (legacy behaviour)',
    { ANTHROPIC_API_KEY: 'k' },
    AnthropicLlmAdapter,
    'claude',
  ],
  ['AI_PROVIDER=bedrock with a model id', BEDROCK_ENV, BedrockLlmAdapter, 'bedrock'],
  ['AI_PROVIDER=bedrock without a model id', { AI_PROVIDER: 'bedrock' }, MockLlmAdapter, 'mock'],
  [
    'AI_PROVIDER=bedrock wins over a Claude key',
    { ...BEDROCK_ENV, ANTHROPIC_API_KEY: 'k' },
    BedrockLlmAdapter,
    'bedrock',
  ],
  [
    'AI_PROVIDER=anthropic with a key',
    { AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' },
    AnthropicLlmAdapter,
    'claude',
  ],
  ['AI_PROVIDER=anthropic without a key', { AI_PROVIDER: 'anthropic' }, MockLlmAdapter, 'mock'],
  [
    'AI_PROVIDER=mock even with a key',
    { AI_PROVIDER: 'mock', ANTHROPIC_API_KEY: 'k' },
    MockLlmAdapter,
    'mock',
  ],
];

describe('AI provider selection', () => {
  it.each(MATRIX)('LLM_PORT: %s', async (_label, env, expected) => {
    expect(await llmFor(env)).toBeInstanceOf(expected as new (...args: never[]) => unknown);
  });

  it.each(MATRIX)('NARRATION_PORT: %s', (_label, env, _llm, narrator) => {
    const tag = (name: string) => ({ name }) as unknown as NarrationPort;
    const narrators = { mock: tag('mock'), claude: tag('claude'), bedrock: tag('bedrock') };
    const chosen = selectNarrator(appConfigFor(env), narrators) as unknown as { name: string };
    expect(chosen.name).toBe(narrator);
  });

  it('unset config resolves to the mock, which never calls out', async () => {
    const llm = await llmFor({});
    await expect(llm.complete({ system: 's', user: 'u' })).resolves.toEqual({
      text: expect.any(String),
      provider: 'mock',
      model: 'mock',
    });
    await expect(llm.complete({ system: 's', user: 'u', json: true })).resolves.toMatchObject({
      text: '{"mock":true}',
    });
  });
});

describe('createBedrockClient', () => {
  it('returns null unless Bedrock is the provider', () => {
    expect(createBedrockClient(appConfigFor({}))).toBeNull();
    expect(createBedrockClient(appConfigFor({ ANTHROPIC_API_KEY: 'k' }))).toBeNull();
  });

  it('builds a client pinned to the configured EU region (default eu-central-1)', async () => {
    const client = createBedrockClient(appConfigFor(BEDROCK_ENV));
    expect(client).toBeInstanceOf(BedrockRuntimeClient);
    expect(await (client as BedrockRuntimeClient).config.region()).toBe('eu-central-1');

    const west = createBedrockClient(appConfigFor({ ...BEDROCK_ENV, BEDROCK_REGION: 'eu-west-1' }));
    expect(await (west as BedrockRuntimeClient).config.region()).toBe('eu-west-1');
  });

  it('refuses a non-EU region or a non-EU inference profile at boot (rule #6)', () => {
    expect(() =>
      createBedrockClient(appConfigFor({ ...BEDROCK_ENV, BEDROCK_REGION: 'us-east-1' })),
    ).toThrow(/EU region/);
    expect(() =>
      createBedrockClient(
        appConfigFor({ AI_PROVIDER: 'bedrock', BEDROCK_MODEL_ID: 'us.anthropic.x-v1:0' }),
      ),
    ).toThrow(/non-EU inference profile/);
    expect(() =>
      createBedrockClient(
        appConfigFor({ AI_PROVIDER: 'bedrock', BEDROCK_MODEL_ID: 'global.anthropic.x-v1:0' }),
      ),
    ).toThrow(/non-EU/);
  });

  it('accepts an eu. profile, a plain in-region model id, and an EU ARN', () => {
    expect(() => assertEuBedrockConfig('eu-central-1', EU_PROFILE)).not.toThrow();
    expect(() => assertEuBedrockConfig('eu-central-1', 'anthropic.x-v1:0')).not.toThrow();
    expect(() =>
      assertEuBedrockConfig(
        'eu-central-1',
        'arn:aws:bedrock:eu-central-1:123:inference-profile/eu.x',
      ),
    ).not.toThrow();
    expect(() =>
      assertEuBedrockConfig('eu-central-1', 'arn:aws:bedrock:us-east-1:123:inference-profile/us.x'),
    ).toThrow(/EU region/);
  });
});
