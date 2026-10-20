import { Logger } from '@nestjs/common';
import type { BeeApiPort, BeeConversation, BeeTodo, BeeUtterance } from './bee-api.port';

/**
 * Bee developer API over HTTPS (decision 0012). Everything we know or assume about
 * Bee's wire format lives in this one file.
 *
 * Confirmed from docs.bee.computer/docs/proxy:
 * - Base URL https://api.developer.bee.amazon.dev, `Authorization: Bearer <token>`.
 * - GET /v1/conversations/:id, POST /v1/todos with { text, alarm_at } where alarm_at is
 *   sent as ISO 8601 and returned as epoch milliseconds.
 * - About 60 requests per minute per token; back off on 429.
 *
 * Assumed (TODO confirm against a real response):
 * - The conversation JSON shape. We accept it bare or wrapped in { conversation }, in
 *   snake_case or camelCase, with utterances either top level or nested in
 *   transcriptions[].utterances[]. See parseBeeConversation.
 * - The todo response shape: bare or wrapped in { todo }.
 */
export class HttpBeeApiAdapter implements BeeApiPort {
  private readonly logger = new Logger(HttpBeeApiAdapter.name);

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutMs = 8000,
  ) {}

  async getConversation(id: string): Promise<BeeConversation | null> {
    const res = await this.request('GET', `/v1/conversations/${encodeURIComponent(id)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Bee GET conversation failed: HTTP ${res.status}`);
    return parseBeeConversation(await res.json(), id);
  }

  async createTodo(text: string, alarmAt?: string | null): Promise<BeeTodo> {
    const body: Record<string, unknown> = { text };
    if (alarmAt) body.alarm_at = alarmAt;
    const res = await this.request('POST', '/v1/todos', body);
    if (!res.ok) throw new Error(`Bee POST todo failed: HTTP ${res.status}`);
    return parseBeeTodo(await res.json(), text, alarmAt ?? null);
  }

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (res.status === 429) this.logger.warn('Bee API rate limit hit (HTTP 429)');
    return res;
  }
}

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

/** ISO 8601 from an ISO string or epoch (seconds or milliseconds). */
export function toIso(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const ms = v < 1e12 ? v * 1000 : v;
    return new Date(ms).toISOString();
  }
  if (typeof v === 'string' && v.trim()) {
    if (/^\d+$/.test(v.trim())) return toIso(Number(v.trim()));
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  return null;
}

function pick(o: Json, ...keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
}

function utterancesOf(list: unknown): BeeUtterance[] {
  if (!Array.isArray(list)) return [];
  const out: BeeUtterance[] = [];
  for (const u of list) {
    if (typeof u === 'string' && u.trim()) {
      out.push({ text: u.trim(), speaker: null });
    } else if (isObj(u)) {
      const text = str(u.text);
      if (text) out.push({ text: text.trim(), speaker: str(u.speaker) });
    }
  }
  return out;
}

/** Tolerant parse of GET /v1/conversations/:id (shape not yet confirmed; see above). */
export function parseBeeConversation(raw: unknown, fallbackId: string): BeeConversation | null {
  if (!isObj(raw)) return null;
  const c = isObj(raw.conversation) ? raw.conversation : isObj(raw.data) ? raw.data : raw;

  let utterances = utterancesOf(pick(c, 'utterances', 'transcript'));
  const transcriptions = pick(c, 'transcriptions', 'transcription');
  if (utterances.length === 0 && Array.isArray(transcriptions)) {
    // Prefer the final (non-realtime) transcription when Bee provides both.
    const sorted = [...transcriptions].filter(isObj).sort((a, b) => {
      return Number(Boolean(a.realtime)) - Number(Boolean(b.realtime));
    });
    for (const t of sorted) {
      utterances = utterancesOf(t.utterances);
      if (utterances.length > 0) break;
    }
  }

  return {
    id: str(pick(c, 'id', 'uuid', 'conversation_id', 'conversationId')) ?? fallbackId,
    startedAt: toIso(pick(c, 'start_time', 'startTime', 'started_at', 'created_at', 'createdAt')),
    state: str(c.state),
    shortSummary: str(pick(c, 'short_summary', 'shortSummary')),
    summary: str(pick(c, 'summary', 'full_summary', 'fullSummary')),
    utterances,
  };
}

/** Tolerant parse of POST /v1/todos. */
export function parseBeeTodo(raw: unknown, text: string, alarmAt: string | null): BeeTodo {
  const t = isObj(raw) && isObj(raw.todo) ? raw.todo : isObj(raw) ? raw : {};
  return {
    id: str(pick(t, 'id', 'uuid')) ?? 'unknown',
    text: str(t.text) ?? text,
    alarmAt: toIso(pick(t, 'alarm_at', 'alarmAt')) ?? alarmAt,
  };
}
