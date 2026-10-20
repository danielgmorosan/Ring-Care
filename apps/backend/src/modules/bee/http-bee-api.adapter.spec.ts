import { HttpBeeApiAdapter, parseBeeConversation, parseBeeTodo } from './http-bee-api.adapter';

describe('HttpBeeApiAdapter', () => {
  const realFetch = global.fetch;
  let calls: { url: string; init: RequestInit }[];

  function stubFetch(status: number, body: unknown) {
    calls = [];
    global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
  }

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('fetches a conversation with the bearer token', async () => {
    stubFetch(200, {
      conversation: {
        id: 12,
        start_time: 1792501500000,
        state: 'COMPLETED',
        short_summary: 'GP visit',
        transcriptions: [
          { realtime: true, utterances: [{ text: 'partial', speaker: 'A' }] },
          { realtime: false, utterances: [{ text: 'Donepezil goes to 5 mg', speaker: 'A' }] },
        ],
      },
    });
    const bee = new HttpBeeApiAdapter('https://api.developer.bee.amazon.dev/', 'tok');
    const c = await bee.getConversation('12');
    expect(calls[0]!.url).toBe('https://api.developer.bee.amazon.dev/v1/conversations/12');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(c).toEqual({
      id: '12',
      startedAt: new Date(1792501500000).toISOString(),
      state: 'COMPLETED',
      shortSummary: 'GP visit',
      summary: null,
      utterances: [{ text: 'Donepezil goes to 5 mg', speaker: 'A' }],
    });
  });

  it('returns null for an unknown conversation and throws on other errors', async () => {
    stubFetch(404, {});
    const bee = new HttpBeeApiAdapter('https://bee.test', 'tok');
    expect(await bee.getConversation('x')).toBeNull();
    stubFetch(500, {});
    await expect(bee.getConversation('x')).rejects.toThrow('HTTP 500');
  });

  it('creates a todo with alarm_at as ISO 8601', async () => {
    stubFetch(201, { id: 99, text: 'Pick up', alarm_at: 1793000000000 });
    const bee = new HttpBeeApiAdapter('https://bee.test', 'tok');
    const todo = await bee.createTodo('Pick up', '2026-11-02T18:00:00.000Z');
    expect(calls[0]!.url).toBe('https://bee.test/v1/todos');
    expect(calls[0]!.init.method).toBe('POST');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      text: 'Pick up',
      alarm_at: '2026-11-02T18:00:00.000Z',
    });
    expect(todo).toEqual({
      id: '99',
      text: 'Pick up',
      alarmAt: new Date(1793000000000).toISOString(),
    });
  });

  it('omits alarm_at when there is no alarm', async () => {
    stubFetch(200, { todo: { id: 'abc', text: 'Call GP' } });
    const todo = await new HttpBeeApiAdapter('https://bee.test', 'tok').createTodo('Call GP');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ text: 'Call GP' });
    expect(todo.id).toBe('abc');
  });
});

describe('Bee response parsing', () => {
  it('accepts a bare camelCase conversation with top-level utterances', () => {
    expect(
      parseBeeConversation(
        { uuid: 'u1', startTime: '2026-10-20T13:05:00Z', utterances: ['hello', { text: ' x ' }] },
        'fallback',
      ),
    ).toMatchObject({
      id: 'u1',
      startedAt: '2026-10-20T13:05:00.000Z',
      utterances: [{ text: 'hello' }, { text: 'x' }],
    });
  });

  it('falls back to the requested id and tolerates junk', () => {
    expect(parseBeeConversation({}, 'req')?.id).toBe('req');
    expect(parseBeeConversation('nope', 'req')).toBeNull();
    expect(parseBeeTodo(null, 't', null)).toEqual({ id: 'unknown', text: 't', alarmAt: null });
  });
});
