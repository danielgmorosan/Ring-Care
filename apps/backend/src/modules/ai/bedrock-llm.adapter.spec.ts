import { Logger } from '@nestjs/common';
import { BedrockLlmAdapter } from './bedrock-llm.adapter';
import { JSON_ONLY_INSTRUCTION, LlmProviderError, stripCodeFences } from './llm-text';
import {
  appConfigFor,
  awsError,
  BEDROCK_ENV,
  converseReply,
  EU_PROFILE,
  StubBedrockClient,
} from './testing/ai-test-helpers';

const SECRET_PROMPT = 'question about Maria Santos and her pills';

function setup(timeoutMs?: number) {
  const client = new StubBedrockClient();
  const adapter = new BedrockLlmAdapter(client, appConfigFor(BEDROCK_ENV), timeoutMs);
  return { client, adapter };
}

describe('BedrockLlmAdapter', () => {
  let logSpy: jest.SpyInstance;
  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => logSpy.mockRestore());

  it('sends a text-only Converse request: model id, system, one user turn, low temperature', async () => {
    const { client, adapter } = setup();

    const res = await adapter.complete({ system: 'Be calm.', user: 'hello', maxTokens: 123 });

    expect(res).toEqual({ text: 'A calm reply.', provider: 'bedrock', model: EU_PROFILE });
    expect(client.inputs).toHaveLength(1);
    const input = client.inputs[0]!;
    expect(input.modelId).toBe(EU_PROFILE);
    expect(input.system).toEqual([{ text: 'Be calm.' }]);
    expect(input.messages).toEqual([{ role: 'user', content: [{ text: 'hello' }] }]);
    expect(input.inferenceConfig).toEqual({ maxTokens: 123, temperature: 0.2 });
    // Rules #1 and #4: no media blocks of any kind, no tools, no extra fields.
    const wire = JSON.stringify(input);
    for (const key of [
      'image',
      'document',
      'video',
      'audio',
      'toolConfig',
      'additionalModelRequestFields',
    ]) {
      expect(wire).not.toContain(`"${key}"`);
    }
    expect(Object.keys(input).sort()).toEqual(['inferenceConfig', 'messages', 'modelId', 'system']);
  });

  it('defaults maxTokens when the caller does not set one', async () => {
    const { client, adapter } = setup();
    await adapter.complete({ system: 's', user: 'u' });
    expect(client.inputs[0]!.inferenceConfig?.maxTokens).toBe(400);
  });

  it('json mode: instructs JSON-only output and strips code fences', async () => {
    const { client, adapter } = setup();
    client.reply = async () => converseReply('```json\n{"medications": [], "ok": true}\n```');

    const res = await adapter.complete({ system: 'Extract.', user: 'note', json: true });

    expect(client.inputs[0]!.system).toEqual([{ text: `Extract.\n\n${JSON_ONLY_INSTRUCTION}` }]);
    expect(JSON.parse(res.text)).toEqual({ medications: [], ok: true });
  });

  it('text mode leaves fences alone', async () => {
    const { client, adapter } = setup();
    client.reply = async () => converseReply('```plain```');
    expect((await adapter.complete({ system: 's', user: 'u' })).text).toBe('```plain```');
  });

  it('joins multiple text blocks', async () => {
    const { client, adapter } = setup();
    client.reply = async () => ({
      ...converseReply(''),
      output: { message: { role: 'assistant', content: [{ text: 'One.' }, { text: ' Two.' }] } },
    });
    expect((await adapter.complete({ system: 's', user: 'u' })).text).toBe('One. Two.');
  });

  it.each([
    ['AccessDeniedException', 403, 'auth'],
    ['ThrottlingException', 429, 'throttled'],
    ['ValidationException', 400, 'bad_request'],
    ['ResourceNotFoundException', 404, 'bad_request'],
    ['InternalServerException', 500, 'upstream'],
  ])('maps %s to a clear %s error without prompt text', async (name, status, kind) => {
    const { client, adapter } = setup();
    client.reply = async () => {
      throw awsError(name, status);
    };

    const err = (await adapter
      .complete({ system: 's', user: SECRET_PROMPT })
      .catch((e) => e)) as LlmProviderError;

    expect(err).toBeInstanceOf(LlmProviderError);
    expect(err.kind).toBe(kind);
    expect(err.message).toContain(name);
    expect(err.message).toContain(String(status));
    expect(err.message).toContain(EU_PROFILE);
    expect(err.message).not.toContain('Maria');
  });

  it('times out and aborts the in-flight request', async () => {
    const { client, adapter } = setup(20);
    let aborted = false;
    client.reply = (_input, signal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          aborted = true;
          const e = new Error('Request aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });

    const err = (await adapter
      .complete({ system: 's', user: 'u' })
      .catch((e) => e)) as LlmProviderError;

    expect(aborted).toBe(true);
    expect(err.kind).toBe('timeout');
    expect(err.message).toMatch(/timed out after 20 ms/);
  });

  it('treats an empty completion as an error so the caller falls back', async () => {
    const { client, adapter } = setup();
    client.reply = async () => converseReply('   ');
    await expect(adapter.complete({ system: 's', user: 'u' })).rejects.toMatchObject({
      kind: 'empty',
    });
  });

  it('logs sizes and the model id, never prompt or completion text', async () => {
    const { client, adapter } = setup();
    client.reply = async () => converseReply('Your mother Maria is fine.');

    await adapter.complete({ system: 'sys', user: SECRET_PROMPT });

    const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain(EU_PROFILE);
    expect(logged).toContain('eu-central-1');
    expect(logged).toMatch(/in_chars=\d+ out_chars=\d+/);
    expect(logged).not.toContain('Maria');
    expect(logged).not.toContain('pills');
  });

  it('refuses to run without a client (misconfiguration)', async () => {
    const adapter = new BedrockLlmAdapter(null, appConfigFor({}));
    await expect(adapter.complete({ system: 's', user: 'u' })).rejects.toThrow(
      /AI_PROVIDER=bedrock/,
    );
  });
});

describe('stripCodeFences', () => {
  it.each([
    ['{"a":1}', '{"a":1}'],
    ['  {"a":1}\n', '{"a":1}'],
    ['```json\n{"a":1}\n```', '{"a":1}'],
    ['```JSON\n{"a":1}```', '{"a":1}'],
    ['```\n{"a":1}\n```', '{"a":1}'],
    ['Here you go:\n{"a":{"b":2}}\nThanks', '{"a":{"b":2}}'],
    ['```json\n[1,2]\n```', '[1,2]'],
    ['no json here', 'no json here'],
  ])('%j -> %j', (raw, expected) => {
    expect(stripCodeFences(raw)).toBe(expected);
  });
});
