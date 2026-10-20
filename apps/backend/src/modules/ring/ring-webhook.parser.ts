import { createHash } from 'node:crypto';
import type { RingEventKind } from './ring.entity';

/**
 * A Ring webhook reduced to what we keep: labels and ids (rule #1). Snapshot or clip
 * URLs that Ring may include are deliberately never read.
 */
export interface ParsedRingWebhook {
  /** Ring's event id, or `sha256:<digest of the body>` when none was found. */
  eventKey: string;
  rawType: string;
  kind: RingEventKind;
  ringDeviceId: string | null;
  subType: string | null;
  /** Canonical ISO instant, or null when the body carried no usable timestamp. */
  occurredAt: string | null;
}

/**
 * Ring's exact notification shape is not pinned down in our docs (the developer pages
 * were unreachable while this was built), so the parser is tolerant: it accepts a flat
 * body (`event_type`, `device_id`, ...) or a JSON:API envelope (`data.type`,
 * `data.attributes`, `data.relationships.device.data.id`), and a mix of both. The
 * recorded fixtures under ./fixtures pin down the shapes we accept.
 */

const KIND_BY_TYPE: Record<string, RingEventKind> = {
  motion_detected: 'motion',
  motion: 'motion',
  button_press: 'ding',
  button_pressed: 'ding',
  ding: 'ding',
  doorbell_press: 'ding',
  doorbell_pressed: 'ding',
  device_online: 'online',
  online: 'online',
  device_offline: 'offline',
  offline: 'offline',
};

type Json = Record<string, unknown>;

function obj(v: unknown): Json | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : undefined;
}

function at(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const key of path.split('.')) {
    const o = obj(cur);
    if (!o) return undefined;
    cur = o[key];
  }
  return cur;
}

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

function firstString(root: unknown, paths: string[]): string | null {
  for (const p of paths) {
    const s = str(at(root, p));
    if (s) return s;
  }
  return null;
}

/** Accepts ISO strings and epoch seconds/milliseconds. */
function toIso(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const ms = v < 1e12 ? v * 1000 : v;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === 'string' && v.trim() !== '') {
    if (/^\d+(\.\d+)?$/.test(v.trim())) return toIso(Number(v.trim()));
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

const TYPE_PATHS = [
  'event_type',
  'eventType',
  'type',
  'event',
  'data.event_type',
  'data.attributes.event_type',
  'data.attributes.type',
  'data.type',
  'attributes.event_type',
];
const EVENT_ID_PATHS = [
  'event_id',
  'eventId',
  'id',
  'data.attributes.event_id',
  'data.event_id',
  'data.id',
  'meta.event_id',
  'meta.id',
  'notification_id',
];
const DEVICE_ID_PATHS = [
  'device_id',
  'deviceId',
  'device.id',
  'data.device_id',
  'data.attributes.device_id',
  'data.relationships.device.data.id',
  'relationships.device.data.id',
  'attributes.device_id',
  'data.device.id',
];
const SUB_TYPE_PATHS = [
  'attributes.sub_type',
  'data.attributes.sub_type',
  'sub_type',
  'subType',
  'data.sub_type',
  'attributes.subType',
  'data.attributes.subType',
  'data.attributes.smart_alert',
  'data.attributes.detection_type',
];
const TIME_PATHS = [
  'occurred_at',
  'timestamp',
  'event_time',
  'created_at',
  'time',
  'attributes.timestamp',
  'attributes.occurred_at',
  'attributes.created_at',
  'data.attributes.occurred_at',
  'data.attributes.timestamp',
  'data.attributes.event_time',
  'data.attributes.created_at',
  'data.timestamp',
  'meta.timestamp',
];

function normalizeType(t: string): string {
  return t
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, '_');
}

/** Parses a raw webhook body. Throws only when the body is not a JSON object. */
export function parseRingWebhook(rawBody: Buffer): ParsedRingWebhook {
  const body: unknown = JSON.parse(rawBody.toString('utf8'));
  if (!obj(body)) throw new Error('Ring webhook body is not a JSON object');

  // Prefer a candidate that names a known event; otherwise keep the first string seen,
  // so unknown types are still recorded verbatim as 'other'.
  let rawType: string | null = null;
  let kind: RingEventKind = 'other';
  for (const p of TYPE_PATHS) {
    const s = str(at(body, p));
    if (!s) continue;
    const known = KIND_BY_TYPE[normalizeType(s)];
    if (known) {
      rawType = s;
      kind = known;
      break;
    }
    rawType ??= s;
  }

  const ringEventId = firstString(body, EVENT_ID_PATHS);
  const eventKey = ringEventId
    ? `ring:${ringEventId}`
    : `sha256:${createHash('sha256').update(rawBody).digest('hex')}`;

  let occurredAt: string | null = null;
  for (const p of TIME_PATHS) {
    occurredAt = toIso(at(body, p));
    if (occurredAt) break;
  }

  const subType = firstString(body, SUB_TYPE_PATHS);

  return {
    eventKey,
    rawType: rawType ?? 'unknown',
    kind,
    ringDeviceId: firstString(body, DEVICE_ID_PATHS),
    subType: subType ? subType.toLowerCase() : null,
    occurredAt,
  };
}
