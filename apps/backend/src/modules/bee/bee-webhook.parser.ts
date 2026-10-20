/**
 * Tolerant parsing of what `bee stream --webhook-endpoint` posts (decision 0012).
 *
 * The bee CLI README documents the event types and their `data` payloads, and that
 * `--webhook-body` is a template whose `{{message}}` is the same one-line message as
 * `--agent` output (e.g. `Event new-utterance: [speaker_1] "Hello" conv=<uuid>`). It
 * does not document the default webhook body, the content type, or whether the
 * template is JSON-escaped. So we accept all of these:
 *
 * 1. A JSON event: { event|type, data: { conversation: { id|uuid }, conversation_id } }
 * 2. A JSON wrapper around the agent message: { message: "Event new-conversation: ..." }
 * 3. The agent message as text/plain.
 * 4. Anything else: we look for a known event type and a conversation id in the text.
 */

export const CONVERSATION_EVENTS = ['new-conversation', 'update-conversation-summary'] as const;
export type ConversationEvent = (typeof CONVERSATION_EVENTS)[number];

const KNOWN_EVENTS = [
  'update-conversation-summary',
  'update-conversation',
  'new-conversation',
  'delete-conversation',
  'new-utterance',
  'update-location',
  'todo-created',
  'todo-updated',
  'todo-deleted',
  'journal-created',
  'journal-updated',
  'journal-deleted',
  'journal-text',
  'connected',
];

export interface ParsedBeeWebhook {
  eventType: string | null;
  conversationId: string | null;
}

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function idOf(v: unknown): string | null {
  if (typeof v === 'string' && /^[\w-]{1,128}$/.test(v.trim())) return v.trim();
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return String(v);
  return null;
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function fromData(data: Json): string | null {
  const conv = isObj(data.conversation) ? data.conversation : null;
  return (
    (conv && (idOf(conv.id) ?? idOf(conv.uuid))) ??
    idOf(data.conversation_id) ??
    idOf(data.conversationId) ??
    idOf(data.conversation_uuid) ??
    idOf(data.conversationUuid) ??
    null
  );
}

/** Parses an agent-style line: `Event new-conversation: ... conv=<id>`. */
function fromText(text: string): ParsedBeeWebhook {
  const eventMatch = /\bEvent\s+([a-z][a-z-]+)\s*:/i.exec(text);
  let eventType = eventMatch ? eventMatch[1]!.toLowerCase() : null;
  if (!eventType) eventType = KNOWN_EVENTS.find((e) => new RegExp(`\\b${e}\\b`).test(text)) ?? null;
  const idMatch =
    /(?<![\w-])(?:conv|conversation|conversation_id|conversationId|conversation_uuid)\s*[=:]\s*"?([\w-]{1,128})/i.exec(
      text,
    ) ?? /(?<![\w-])(?:id|uuid)\s*[=:]\s*"?([\w-]{1,128})/i.exec(text);
  return { eventType, conversationId: idMatch ? idMatch[1]! : null };
}

export function parseBeeWebhook(body: unknown): ParsedBeeWebhook {
  if (typeof body === 'string') {
    const trimmed = body.trim();
    const json = trimmed.startsWith('{') ? tryJson(trimmed) : undefined;
    return json !== undefined ? parseBeeWebhook(json) : fromText(trimmed);
  }
  if (!isObj(body)) return { eventType: null, conversationId: null };

  const eventRaw = body.event ?? body.type ?? body.name ?? body.event_type;
  const eventType = typeof eventRaw === 'string' ? eventRaw.trim().toLowerCase() : null;
  let data: unknown = body.data ?? body.payload;
  if (typeof data === 'string') data = tryJson(data) ?? data;

  if (eventType && KNOWN_EVENTS.includes(eventType)) {
    const conversationId = (isObj(data) ? fromData(data) : null) ?? fromData(body);
    if (conversationId) return { eventType, conversationId };
  }
  // { message: "<agent line or JSON>" } from a --webhook-body template.
  for (const key of ['message', 'text', 'body', 'content']) {
    const v = body[key];
    if (typeof v === 'string' && v.trim()) {
      const inner = parseBeeWebhook(v);
      if (inner.eventType || inner.conversationId) {
        return {
          eventType: inner.eventType ?? eventType,
          conversationId: inner.conversationId ?? (isObj(data) ? fromData(data) : null),
        };
      }
    }
  }
  return { eventType, conversationId: (isObj(data) ? fromData(data) : null) ?? fromData(body) };
}

export function isConversationEvent(eventType: string | null): eventType is ConversationEvent {
  return CONVERSATION_EVENTS.includes(eventType as ConversationEvent);
}
