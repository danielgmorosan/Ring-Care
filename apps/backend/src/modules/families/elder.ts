/**
 * The protected person's display name and relationship word, as the caregiver sets them.
 * Both are optional and shown only to the family (e.g. "Maria's home"). They are
 * identifying data: exported under GDPR, blanked on erasure, and never sent to an AI
 * provider. Narration and Q&A keep using roles only (rules #1 and #6 minimization).
 */
export const ELDER_RELATIONS = ['mother', 'father', 'grandmother', 'grandfather', 'other'] as const;
export type ElderRelation = (typeof ELDER_RELATIONS)[number];

/** Longest display name we accept. Short on purpose: it is a label, not a legal name. */
export const ELDER_NAME_MAX_LENGTH = 60;

/**
 * Rejects control characters (C0/C1, line/paragraph separators) and bidi overrides, which
 * could break layouts or spoof text. Ordinary letters, accents, spaces, apostrophes and
 * hyphens are all fine ("Maria", "Zé", "Anne-Marie", "D'Arcy").
 */
export const ELDER_NAME_PATTERN = /^[^\p{Cc}\u2028\u2029\u202A-\u202E\u2066-\u2069]+$/u;

export function isElderRelation(value: unknown): value is ElderRelation {
  return typeof value === 'string' && (ELDER_RELATIONS as readonly string[]).includes(value);
}

/** Coerce a stored value to a known relation, or null. */
export function normalizeElderRelation(value: unknown): ElderRelation | null {
  return isElderRelation(value) ? value : null;
}

/** Trim a submitted name; an empty or whitespace-only name means "clear it". */
export function trimElderName(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
