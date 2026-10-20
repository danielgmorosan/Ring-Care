import { Logger } from '@nestjs/common';
import {
  RingApiError,
  RingDeviceOfflineError,
  type RingClient,
  type RingDevice,
  type RingLiveSession,
} from './ring-client.port';
import type { RingTokenProvider } from './ring-token.provider';

export interface HttpRingClientOptions {
  /** Max 429 retries per call. Bounded so a caregiver request never hangs. */
  maxRateLimitRetries?: number;
  /** Upper bound on any single Retry-After wait. */
  maxRetryAfterMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Retry-After is seconds or an HTTP date. */
export function retryAfterMs(header: string | null, now = Date.now()): number {
  if (!header) return 1000;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? 1000 : Math.max(0, date - now);
}

/**
 * Ring Partner API (Amazon Vision) over plain fetch. Signalling and metadata only: the
 * only media-related calls open and close a WHEP session, whose media then flows
 * between Ring and the family app, never through us (rule #1).
 *
 * 401 → refresh the token once and retry; 429 → honour Retry-After, bounded; 503 on a
 * device call → RingDeviceOfflineError.
 */
export class HttpRingClient implements RingClient {
  private readonly logger = new Logger(HttpRingClient.name);
  private readonly maxRateLimitRetries: number;
  private readonly maxRetryAfterMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly baseUrl: string,
    private readonly tokens: RingTokenProvider,
    options: HttpRingClientOptions = {},
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.maxRateLimitRetries = options.maxRateLimitRetries ?? 2;
    this.maxRetryAfterMs = options.maxRetryAfterMs ?? 5000;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async listDevices(): Promise<RingDevice[]> {
    const res = await this.request('GET', '/v1/devices', {
      headers: { accept: 'application/vnd.api+json, application/json' },
    });
    const json = (await res.json()) as { data?: unknown };
    const list = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];
    const devices: RingDevice[] = [];
    for (const raw of list as Array<Record<string, unknown>>) {
      const id = typeof raw?.id === 'string' || typeof raw?.id === 'number' ? String(raw.id) : null;
      if (!id) continue;
      const attrs = (raw.attributes ?? {}) as Record<string, unknown>;
      const status = String(attrs.status ?? attrs.connection_status ?? 'online').toLowerCase();
      const kindRaw = attrs.kind ?? attrs.device_type ?? attrs.type ?? raw.type;
      devices.push({
        id,
        name: typeof attrs.name === 'string' ? attrs.name : '',
        online: status !== 'offline' && status !== 'disconnected',
        kind: typeof kindRaw === 'string' && kindRaw !== 'devices' ? kindRaw : null,
      });
    }
    return devices;
  }

  async startLiveView(ringDeviceId: string, sdpOffer: string): Promise<RingLiveSession> {
    const path = `/v1/devices/${encodeURIComponent(ringDeviceId)}/media/streaming/whep/sessions`;
    const res = await this.request('POST', path, {
      headers: { 'content-type': 'application/sdp', accept: 'application/sdp' },
      body: sdpOffer,
      device: true,
    });
    const sdpAnswer = await res.text();
    const location = res.headers.get('location');
    if (!location || !sdpAnswer) {
      throw new RingApiError('Ring WHEP answer missing SDP or Location', res.status);
    }
    const resolved = new URL(location, `${this.baseUrl}/`).toString();
    const sessionId = decodeURIComponent(
      new URL(resolved).pathname.split('/').filter(Boolean).pop() ?? '',
    );
    if (!sessionId) throw new RingApiError('Ring WHEP Location has no session id', res.status);
    return { sessionId, sdpAnswer, location: resolved };
  }

  async stopLiveView(ringDeviceId: string, sessionId: string, location?: string): Promise<void> {
    // Use Ring's Location only when it is on the configured Ring host (our token goes there).
    const path =
      location && location.startsWith(`${this.baseUrl}/`)
        ? location
        : `/v1/devices/${encodeURIComponent(ringDeviceId)}/media/streaming/whep/sessions/${encodeURIComponent(sessionId)}`;
    try {
      await this.request('DELETE', path, { device: true });
    } catch (err) {
      // Already gone is fine: the goal (no open session) holds.
      if (err instanceof RingApiError && err.status === 404) return;
      throw err;
    }
  }

  private async request(
    method: string,
    pathOrUrl: string,
    opts: { headers?: Record<string, string>; body?: string; device?: boolean },
  ): Promise<Response> {
    const url = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${this.baseUrl}${pathOrUrl}`;
    if (!url.startsWith(`${this.baseUrl}/`)) {
      // Only ever send our bearer token to the configured Ring host.
      throw new RingApiError('Refusing to call a non-Ring URL', 0);
    }
    let refreshed = false;
    let rateLimited = 0;
    for (;;) {
      const token = await this.tokens.getAccessToken();
      let res: Response;
      try {
        res = await fetch(url, {
          method,
          headers: { ...opts.headers, authorization: `Bearer ${token}` },
          body: opts.body,
        });
      } catch (err) {
        throw new RingApiError(`Ring ${method} failed: ${(err as Error).message}`, 0);
      }
      if (res.ok) return res;

      if (res.status === 401 && !refreshed && this.tokens.invalidate()) {
        refreshed = true;
        continue;
      }
      if (res.status === 429 && rateLimited < this.maxRateLimitRetries) {
        rateLimited++;
        const wait = Math.min(retryAfterMs(res.headers.get('retry-after')), this.maxRetryAfterMs);
        this.logger.warn(`Ring rate limited ${method} ${pathOrUrl}; retrying in ${wait}ms`);
        await this.sleep(wait);
        continue;
      }
      if (res.status === 503 && opts.device) throw new RingDeviceOfflineError();
      throw new RingApiError(`Ring ${method} ${pathOrUrl} failed (${res.status})`, res.status);
    }
  }
}
