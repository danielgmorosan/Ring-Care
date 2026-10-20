import { Logger } from '@nestjs/common';
import { AnthropicLlmAdapter } from './anthropic-llm.adapter';
import { JSON_ONLY_INSTRUCTION } from './llm-text';
import { appConfigFor } from './testing/ai-test-helpers';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('AnthropicLlmAdapter', () => {
  const config = appConfigFor({
    AI_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: 'sk-test',
    ANTHROPIC_MODEL: 'claude-test',
  });
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());

  it('posts a Messages request and strips fences in json mode', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ content: [{ type: 'text', text: '```json\n{"x":1}\n```' }] }),
    );

    const res = await new AnthropicLlmAdapter(config).complete({
      system: 'S',
      user: 'U',
      json: true,
    });

    expect(res).toEqual({ text: '{"x":1}', provider: 'anthropic', model: 'claude-test' });
    const [url, init] = fetchSpy.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: 'claude-test',
      system: `S\n\n${JSON_ONLY_INSTRUCTION}`,
      messages: [{ role: 'user', content: 'U' }],
    });
  });

  it('maps HTTP errors without echoing the body', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ error: { message: 'secret prompt echoed' } }, 429));
    const err = await new AnthropicLlmAdapter(config)
      .complete({ system: 's', user: 'u' })
      .catch((e) => e);
    expect(err).toMatchObject({ kind: 'throttled' });
    expect(err.message).not.toContain('secret');
  });

  it('times out', async () => {
    fetchSpy.mockImplementation(
      (_url, init: RequestInit) =>
        new Promise((_res, rej) =>
          init.signal!.addEventListener('abort', () => rej(init.signal!.reason as Error)),
        ),
    );
    const err = await new AnthropicLlmAdapter(config, 20)
      .complete({ system: 's', user: 'u' })
      .catch((e) => e);
    expect(err).toMatchObject({ kind: 'timeout' });
  });
});
