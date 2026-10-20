import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Press-1 confirmation on family calls (decision 0003, follow-up). Pure helpers: the
 * TwiML a call speaks, the signed callback link Twilio posts the key press to, and the
 * checks that make a forged acknowledgement impossible. Text only: no audio is captured
 * or stored (rule #1); Twilio reads our text aloud and reports one digit back.
 */

/** Public route Twilio posts the key press to. */
export const CONFIRM_CALLBACK_PATH = '/twilio/calls/confirm';

/** How long a signed callback link stays valid. Comfortably longer than any call. */
export const CONFIRM_LINK_TTL_SECONDS = 60 * 60;

/** Seconds Twilio waits for a key after the message has been read. */
export const GATHER_TIMEOUT_SECONDS = 10;

/** What a fall call says when no incident-specific message is given (the original text). */
export const GENERIC_CALL_MESSAGE =
  'This is an Obrigada safety alert. Please open your Obrigada app to check on your family member.';

export const PRESS_ONE_PROMPT = 'Press 1 if you are handling this.';
export const CONFIRMED_REPLY = 'Thank you. We have let the family know you are handling it.';
export const NOT_CONFIRMED_REPLY = 'Thank you. We will keep trying the family. Goodbye.';
export const CLOSED_REPLY =
  'Thank you. This alert has already closed. Please open the Obrigada app for the latest.';
export const NO_INPUT_REPLY =
  'We did not hear a response. We will keep trying the family. Goodbye.';

const VOICE = 'alice';

/** Escape text for an XML text node or attribute value. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const say = (text: string): string => `<Say voice="${VOICE}">${escapeXml(text)}</Say>`;

/** A one-way call: read the message, nothing to press (Twilio without callbacks). */
export function buildOneWayCallTwiml(message: string = GENERIC_CALL_MESSAGE): string {
  return `<Response>${say(message)}</Response>`;
}

/**
 * A call that asks for a press-1. The message and the prompt sit inside <Gather>, so a key
 * press at any point posts to `actionUrl`. With no key, Twilio falls through to the goodbye
 * and hangs up; the workflow's own timer then moves on to the next contact.
 */
export function buildConfirmCallTwiml(params: {
  message: string;
  actionUrl: string;
  gatherTimeoutSeconds?: number;
}): string {
  const timeout = params.gatherTimeoutSeconds ?? GATHER_TIMEOUT_SECONDS;
  return (
    '<Response>' +
    `<Gather numDigits="1" timeout="${timeout}" method="POST" action="${escapeXml(params.actionUrl)}">` +
    say(`${params.message} ${PRESS_ONE_PROMPT}`) +
    '</Gather>' +
    say(NO_INPUT_REPLY) +
    '<Hangup/>' +
    '</Response>'
  );
}

export type ConfirmReply = 'confirmed' | 'other_digit' | 'no_input' | 'closed';

/** The reply to the key press. */
export function buildConfirmReplyTwiml(reply: ConfirmReply): string {
  switch (reply) {
    case 'confirmed':
      return `<Response>${say(CONFIRMED_REPLY)}</Response>`;
    case 'closed':
      return `<Response>${say(CLOSED_REPLY)}<Hangup/></Response>`;
    case 'other_digit':
      return `<Response>${say(NOT_CONFIRMED_REPLY)}<Hangup/></Response>`;
    case 'no_input':
      return `<Response>${say(NO_INPUT_REPLY)}<Hangup/></Response>`;
  }
}

/**
 * The key that signs callback links: CALLBACK_SIGNING_SECRET when set, otherwise a key
 * derived from JWT_SECRET (domain-separated, so a link token is never a valid JWT key).
 */
export function deriveCallbackKey(secrets: {
  callbackSigningSecret?: string;
  jwtSecret: string;
}): Buffer {
  const root = secrets.callbackSigningSecret ?? secrets.jwtSecret;
  return createHmac('sha256', root).update('obrigada.call-confirm.v1').digest();
}

function signingInput(incidentId: string, contactId: string, exp: number): string {
  return `${incidentId}\n${contactId}\n${exp}`;
}

/** HMAC-SHA256 over (incident, contact, expiry), base64url. */
export function signConfirmToken(
  key: Buffer,
  incidentId: string,
  contactId: string,
  exp: number,
): string {
  return createHmac('sha256', key)
    .update(signingInput(incidentId, contactId, exp))
    .digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export type ConfirmTokenCheck = 'ok' | 'bad_signature' | 'expired' | 'malformed';

export function verifyConfirmToken(
  key: Buffer,
  params: { incidentId?: string; contactId?: string; exp?: string; token?: string },
  nowSeconds: number,
): ConfirmTokenCheck {
  const { incidentId, contactId, exp, token } = params;
  if (!incidentId || !contactId || !exp || !token || !/^\d{1,12}$/.test(exp)) return 'malformed';
  const expected = signConfirmToken(key, incidentId, contactId, Number(exp));
  if (!safeEqual(expected, token)) return 'bad_signature';
  if (Number(exp) < nowSeconds) return 'expired';
  return 'ok';
}

/** The signed callback link Twilio posts the key press to. */
export function buildConfirmUrl(params: {
  publicBaseUrl: string;
  key: Buffer;
  incidentId: string;
  contactId: string;
  exp: number;
}): string {
  const query = new URLSearchParams({
    incident: params.incidentId,
    contact: params.contactId,
    exp: String(params.exp),
    token: signConfirmToken(params.key, params.incidentId, params.contactId, params.exp),
  });
  return `${params.publicBaseUrl.replace(/\/+$/, '')}${CONFIRM_CALLBACK_PATH}?${query.toString()}`;
}

/**
 * Twilio's request signature: base64 HMAC-SHA1, keyed by the account auth token, over the
 * full URL Twilio requested followed by every POST parameter as key+value, keys sorted.
 */
export function twilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
}

export function verifyTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | undefined,
): boolean {
  if (!signature) return false;
  return safeEqual(twilioSignature(authToken, url, params), signature);
}
