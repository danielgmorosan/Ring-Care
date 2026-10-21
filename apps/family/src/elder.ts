import type { ElderRelation, Family } from './api/types';

/**
 * How the app names the person Obrigada looks after. The caregiver can set a display
 * name ("Maria") and a relationship word ("mother"); both are optional, so every string
 * here has a graceful fallback. These stay in the family app: narration and Q&A only
 * ever see roles, never the name.
 */

export const ELDER_NAME_MAX_LENGTH = 60;

export const ELDER_RELATIONS: { value: ElderRelation; label: string }[] = [
  { value: 'mother', label: 'Mother' },
  { value: 'father', label: 'Father' },
  { value: 'grandmother', label: 'Grandmother' },
  { value: 'grandfather', label: 'Grandfather' },
  { value: 'other', label: 'Someone else' },
];

type ElderFields = Pick<Family, 'elderName' | 'elderRelation'> | null | undefined;

/** "Maria", else "your mother", else "your family member". Lower case for mid-sentence use. */
export function elderReference(family: ElderFields): string {
  const name = family?.elderName?.trim();
  if (name) return name;
  const relation = family?.elderRelation;
  if (relation && relation !== 'other') return `your ${relation}`;
  return 'your family member';
}

/** The same reference, capitalised to start a sentence: "Maria", "Your mother". */
export function elderReferenceStart(family: ElderFields): string {
  const ref = elderReference(family);
  return ref.charAt(0).toUpperCase() + ref.slice(1);
}

/** The Home hero title: "Maria's home", "Your mother's home", "Your family member's home". */
export function elderHomeTitle(family: ElderFields): string {
  return `${elderReferenceStart(family)}'s home`;
}

/** Trim a typed name; blank means "not set" (sent as null so it clears). */
export function cleanElderName(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, ELDER_NAME_MAX_LENGTH);
}
