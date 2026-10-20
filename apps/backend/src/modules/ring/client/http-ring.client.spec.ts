import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpRingClient, retryAfterMs } from './http-ring.client';
import { RingApiError, RingDeviceOfflineError } from './ring-client.port';
import { OAuthRingTokenProvider, StaticRingTokenProvider } from './ring-token.provider';

const BASE = 'https://api.ring.test';
const OAUTH = 'https://oauth.ring.test';

interface FakeReply {
  status: number;
  body?: string;
  headers?: Record<string, string>;
}

function reply({ status, body = '', headers = {} }: FakeReply): Response {
  return new Response(status === 204 ? null : body, { status, headers });
}

/** A scripted fake fetch: each call takes the next reply and is recorded. */
function fakeFetch(replies: FakeReply[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = replies.shift();
    if (!next) throw new Error(`unexpected fetch ${url}`);
    return reply(next);
  });
  global.fetch = fn as unknown as typeof fetch;
  return calls;
}

const tokenReply = (access: string, refresh = 'rt-2', expiresIn = 14400): FakeReply => ({
  status: 200,
  body: JSON.stringify({ access_token: access, refresh_token: refresh, expires_in: expiresIn }),
  headers: { 'content-type': 'application/json' },
});

function oauth(now: () => number = Date.now) {
  return new OAuthRingTokenProvider(
    {
      ringOauthBaseUrl: OAUTH,
      ringClientId: 'cid',
      ringClientSecret: 'csecret',
      ringRefreshToken: 'rt-1',
    },
    now,
  );
}

const devicesJson = readFileSync(join(__dirname, '..', 'fixtures', 'devices-list.json'), 'utf8');
const header = (init: RequestInit, name: string) => (init.headers as Record<string, string>)[name];

describe('OAuthRingTokenProvider', () => {
  it('exchanges the refresh token, caches the access token, and keeps the rotated one', async () => {
    let now = 1_000_000;
    const provider = oauth(() => now);
    const calls = fakeFetch([tokenReply('at-1', 'rt-2'), tokenReply('at-2', 'rt-3')]);

    expect(await provider.getAccessToken()).toBe('at-1');
    expect(await provider.getAccessToken()).toBe('at-1'); // cached
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${OAUTH}/oauth/token`);
    const form = new URLSearchParams(calls[0]!.init.body as string);
    expect(form.get('grant_type')).toBe('refresh_token');
    expect(form.get('refresh_token')).toBe('rt-1');
    expect(form.get('client_id')).toBe('cid');
    expect(form.get('client_secret')).toBe('csecret');

    now += 4 * 60 * 60 * 1000; // past expiry
    expect(await provider.getAccessToken()).toBe('at-2');
    // The second exchange used the refresh token Ring rotated to.
    expect(new URLSearchParams(calls[1]!.init.body as string).get('refresh_token')).toBe('rt-2');
  });

  it('collapses concurrent refreshes into one exchange', async () => {
    const provider = oauth();
    const calls = fakeFetch([tokenReply('at-1')]);
    const [a, b] = await Promise.all([provider.getAccessToken(), provider.getAccessToken()]);
    expect([a, b]).toEqual(['at-1', 'at-1']);
    expect(calls).toHaveLength(1);
  });

  it('throws a RingApiError when the exchange is refused', async () => {
    fakeFetch([{ status: 400, body: '{"error":"invalid_grant"}' }]);
    await expect(oauth().getAccessToken()).rejects.toBeInstanceOf(RingApiError);
  });
});

describe('HttpRingClient', () => {
  const noSleep = jest.fn(async () => undefined);

  beforeEach(() => noSleep.mockClear());

  it('lists devices from the JSON:API body with a Bearer token', async () => {
    const calls = fakeFetch([{ status: 200, body: devicesJson }]);
    const client = new HttpRingClient(BASE, new StaticRingTokenProvider('pg-token'));
    expect(await client.listDevices()).toEqual([
      { id: 'ring-dev-front-1', name: 'Front Door', online: true, kind: 'doorbell_v4' },
      { id: 'ring-dev-hall-2', name: 'Hallway', online: false, kind: 'stickup_cam' },
    ]);
    expect(calls[0]!.url).toBe(`${BASE}/v1/devices`);
    expect(header(calls[0]!.init, 'authorization')).toBe('Bearer pg-token');
  });

  it('on 401 refreshes the OAuth token once and retries', async () => {
    const calls = fakeFetch([
      tokenReply('at-old'),
      { status: 401 },
      tokenReply('at-new', 'rt-3'),
      { status: 200, body: devicesJson },
    ]);
    const client = new HttpRingClient(BASE, oauth());
    await expect(client.listDevices()).resolves.toHaveLength(2);
    expect(header(calls[1]!.init, 'authorization')).toBe('Bearer at-old');
    expect(header(calls[3]!.init, 'authorization')).toBe('Bearer at-new');
  });

  it('gives up after one refresh when Ring keeps answering 401', async () => {
    fakeFetch([tokenReply('a'), { status: 401 }, tokenReply('b'), { status: 401 }]);
    const client = new HttpRingClient(BASE, oauth());
    await expect(client.listDevices()).rejects.toMatchObject({ status: 401 });
  });

  it('does not retry a 401 with a Playground token (it cannot refresh)', async () => {
    const calls = fakeFetch([{ status: 401 }]);
    const client = new HttpRingClient(BASE, new StaticRingTokenProvider('pg'));
    await expect(client.listDevices()).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(1);
  });

  it('honours Retry-After on 429, capped and bounded', async () => {
    fakeFetch([
      { status: 429, headers: { 'retry-after': '2' } },
      { status: 429, headers: { 'retry-after': '120' } },
      { status: 200, body: devicesJson },
    ]);
    const client = new HttpRingClient(BASE, new StaticRingTokenProvider('pg'), {
      sleep: noSleep,
      maxRetryAfterMs: 5000,
    });
    await expect(client.listDevices()).resolves.toHaveLength(2);
    expect(noSleep.mock.calls).toEqual([[2000], [5000]]);

    fakeFetch([{ status: 429 }, { status: 429 }, { status: 429 }]);
    await expect(client.listDevices()).rejects.toMatchObject({ status: 429 });
  });

  it('opens a WHEP session: SDP in, SDP answer + Location out', async () => {
    const calls = fakeFetch([
      {
        status: 201,
        body: 'v=0\r\nanswer\r\n',
        headers: {
          'content-type': 'application/sdp',
          location: '/v1/devices/ring-dev-front-1/media/streaming/whep/sessions/sess-42',
        },
      },
    ]);
    const client = new HttpRingClient(BASE, new StaticRingTokenProvider('pg'));
    const session = await client.startLiveView('ring-dev-front-1', 'v=0\r\noffer\r\n');

    expect(session).toEqual({
      sessionId: 'sess-42',
      sdpAnswer: 'v=0\r\nanswer\r\n',
      location: `${BASE}/v1/devices/ring-dev-front-1/media/streaming/whep/sessions/sess-42`,
    });
    expect(calls[0]!.url).toBe(`${BASE}/v1/devices/ring-dev-front-1/media/streaming/whep/sessions`);
    expect(calls[0]!.init.method).toBe('POST');
    expect(header(calls[0]!.init, 'content-type')).toBe('application/sdp');
    expect(calls[0]!.init.body).toBe('v=0\r\noffer\r\n');
  });

  it('maps a 503 on a device call to RingDeviceOfflineError', async () => {
    fakeFetch([{ status: 503 }]);
    const client = new HttpRingClient(BASE, new StaticRingTokenProvider('pg'));
    await expect(client.startLiveView('d', 'v=0\r\n')).rejects.toBeInstanceOf(
      RingDeviceOfflineError,
    );
  });

  it('closes a session at its Location, tolerating 404, and never sends the token off-host', async () => {
    const calls = fakeFetch([{ status: 204 }, { status: 404 }, { status: 204 }]);
    const client = new HttpRingClient(BASE, new StaticRingTokenProvider('pg'));
    const loc = `${BASE}/v1/devices/d/media/streaming/whep/sessions/s1`;
    await client.stopLiveView('d', 's1', loc);
    await client.stopLiveView('d', 's1', loc);
    // A foreign Location falls back to the Ring API path.
    await client.stopLiveView('d', 's2', 'https://evil.test/steal');
    expect(calls.map((c) => [c.init.method, c.url])).toEqual([
      ['DELETE', loc],
      ['DELETE', loc],
      ['DELETE', `${BASE}/v1/devices/d/media/streaming/whep/sessions/s2`],
    ]);
  });
});

describe('retryAfterMs', () => {
  it('reads seconds, HTTP dates, and defaults to 1 s', () => {
    expect(retryAfterMs('3')).toBe(3000);
    expect(retryAfterMs(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect(retryAfterMs(null)).toBe(1000);
    expect(retryAfterMs('garbage')).toBe(1000);
  });
});
