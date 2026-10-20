import { clockTimeInZone } from '../../families/timezone';

/**
 * Family-facing words for front-door activity in the night (decision 0011). Brand voice:
 * short declarative sentences, warm, no em dashes, no drama. Ring cannot tell us who is
 * at the door, so the copy says "someone" rather than guess. The contact named is the
 * family's own contact (these texts go only to the family's devices and phones, never
 * to the narrator). Pure and exported so the exact wording is tested.
 */

export type RingActivityKind = 'motion' | 'ding';

function opening(kind: RingActivityKind, at: string, tz: string): string {
  const time = clockTimeInZone(at, tz);
  return kind === 'ding'
    ? `Someone rang the front doorbell at ${time}.`
    : `Someone was at the front door at ${time}.`;
}

/**
 * The critical push when the ladder starts:
 * "Someone was at the front door at 3:04. We're calling Sofia now."
 */
export function buildNightDoorMessage(
  kind: RingActivityKind,
  at: string,
  tz: string,
  callingName: string | null,
): string {
  const next = callingName ? `We're calling ${callingName} now.` : 'Open the app to take a look.';
  return `${opening(kind, at, tz)} ${next}`;
}

/** The text and push to the whole chain when nobody picked up. */
export function buildNightDoorUnansweredMessage(
  kind: RingActivityKind,
  at: string,
  tz: string,
): string {
  return `${opening(kind, at, tz)} We haven't reached anyone by phone yet. Please check on home.`;
}

/** The family alert when the escalation engine is unavailable (no calls are placed). */
export function buildNightDoorAlertMessage(kind: RingActivityKind, at: string, tz: string): string {
  return `${opening(kind, at, tz)} Open the app to take a look.`;
}
