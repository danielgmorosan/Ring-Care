/**
 * The elder-facing voice check-in language. This is a per-household SAFETY setting, not
 * localization: when the guardian asks "Are you okay?" after a suspected fall, it must
 * speak in the language the elder actually understands (CLAUDE.md). It is set per home and
 * independent of the caregiver's app language.
 *
 * English ships first; European Portuguese (PT-PT, never Brazilian) is the fast-follow.
 * Extend this list as elder-facing languages are added — each needs a verified TTS voice.
 */
export type CheckinLanguage = 'en' | 'pt-PT';

export const CHECKIN_LANGUAGES = ['en', 'pt-PT'] as const;

export const DEFAULT_CHECKIN_LANGUAGE: CheckinLanguage = 'en';

export function isCheckinLanguage(value: unknown): value is CheckinLanguage {
  return typeof value === 'string' && (CHECKIN_LANGUAGES as readonly string[]).includes(value);
}

/** Coerce a stored/incoming value to a known language, defaulting safely to English. */
export function normalizeCheckinLanguage(value: unknown): CheckinLanguage {
  return isCheckinLanguage(value) ? value : DEFAULT_CHECKIN_LANGUAGE;
}
