import type { ExtractedItem } from '../care-proposal.entity';
import { WEEKDAYS, addDays, addMonths, humanDate, nextWeekday } from './calendar';

/**
 * Deterministic, rule-based extraction of care items from a caregiver's short voice
 * note. Used when no LLM is configured (or it answers with the mock), and when the LLM
 * output fails validation. It understands the demo phrasing and its common variants:
 *
 *   "Mom's Donepezil goes to 5 mg at 8 pm from Monday, blood test in two weeks,
 *    pick up the new prescription"
 *
 * It never invents: a clause it recognises as care-related but cannot structure becomes
 * a note, and an ambiguous date or time ("next week", "at 8") is left out rather than
 * guessed. Unrelated clauses are ignored.
 */

export interface RulesInput {
  text: string;
  /** The note's local calendar day (YYYY-MM-DD) in the family's timezone. */
  today: string;
  /** Names of the elder's current medications, matched case-insensitively. */
  knownMedications?: string[];
}

export interface RulesOutput {
  summary: string;
  items: ExtractedItem[];
}

export const RULES_EXTRACTOR_ID = 'rules:v1';

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  'a couple of': 2,
  couple: 2,
  'a few': 3,
};

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const STOP_WORDS = new Set([
  'mom',
  'mum',
  'mother',
  'dad',
  'father',
  'grandma',
  'grandpa',
  'gran',
  'nan',
  'her',
  'his',
  'their',
  'the',
  'a',
  'an',
  'she',
  'he',
  'i',
  'we',
  'they',
  'it',
  'dr',
  'doctor',
  'gp',
  'pm',
  'am',
  'new',
  'now',
  'also',
  'then',
  'and',
  'from',
  'starting',
  'at',
  'to',
  'on',
  'in',
  'of',
  'by',
  'is',
  'was',
  'will',
  'should',
  'goes',
  'go',
  'dose',
  'dosage',
  'take',
  'takes',
  'taking',
  'tablet',
  'tablets',
  'pill',
  'pills',
  'medication',
  'medicine',
  'morning',
  'evening',
  'night',
  'today',
  'tomorrow',
  'tonight',
  'next',
  'this',
  'every',
  'daily',
  'once',
  'twice',
  'increase',
  'increased',
  'reduce',
  'reduced',
  'decrease',
  'decreased',
  'change',
  'changes',
  'changed',
  'start',
  'starts',
  'begin',
  'stop',
  'up',
  'down',
  'raise',
  'lower',
  'switch',
  'mg',
  ...WEEKDAYS,
  ...MONTHS,
]);

const CHANGE_VERBS =
  /\b(goes|go|going|went|increase[sd]?|decrease[sd]?|reduce[sd]?|raise[sd]?|lower(?:s|ed)?|change[sd]?|switch(?:es|ed)?|adjust(?:s|ed)?|moves?|moved|up to|down to|now)\b/i;
const NEW_VERBS =
  /\b(start(?:s|ing)? (?:on|taking)|begin(?:s|ning)?|new|add(?:s|ed)?|prescribed|put (?:her|him|them) on)\b/i;
const STOP_VERBS = /\b(stop(?:s|ped|ping)?|discontinue[sd]?|no more|come off|came off)\b/i;

const TODO_PREFIX =
  /^(?:(?:and|also|then|please|remember to|don'?t forget to|(?:i|we) (?:need|have) to|need to|have to|must|got to|gotta)\s+)*/i;
const TODO_VERBS =
  /^(pick up|collect|buy|get|order|call|phone|ring|book|schedule|make an?|renew|fill|refill|ask|bring|email|send|drop off|take (?:her|him|them|mom|mum|dad) to|arrange|confirm|cancel)\b/i;

const APPOINTMENT_WORDS =
  /\b(blood ?tests?|bloods|tests?|scans?|appointments?|appt|check-?ups?|follow-?ups?|reviews?|consultations?|visits?|x-?rays?|mri|ct|ultrasounds?|ecgs?|ekgs?|exams?|screenings?|physio(?:therapy)?|dentist|optician|specialist|cardiologist|neurologist|nurse|clinic|hospital)\b/i;
const CARE_WORDS =
  /\b(dose|dosage|mg|pills?|tablets?|capsules?|medications?|medicines?|meds|prescriptions?|pharmacy|doctor|gp|blood pressure|sugar|insulin|symptoms?|side effects?|allerg(?:y|ies))\b/i;

const DOSE =
  /(\d+(?:[.,]\d+)?)\s*(mg|milligrams?|mcg|micrograms?|µg|g|grams?|ml|millilit(?:er|re)s?|units?|iu|tablets?|pills?|capsules?|drops?|puffs?)\b/i;

const UNIT_ALIASES: Record<string, string> = {
  milligram: 'mg',
  milligrams: 'mg',
  microgram: 'mcg',
  micrograms: 'mcg',
  µg: 'mcg',
  gram: 'g',
  grams: 'g',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
};

function capitalize(s: string): string {
  const t = s.trim();
  return t ? t[0]!.toUpperCase() + t.slice(1) : t;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Splits a note into clauses. Commas, sentence ends and "and then"/"also" separate items. */
export function splitClauses(text: string): string[] {
  return text
    .split(/[;!?\n]+|\.(?=\s|$)|,\s+|\s+(?:and then|and also|also|plus)\s+/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

interface Found<T> {
  value: T;
  match: string;
}

/** A clock time stated unambiguously: "8 pm", "8:30am", "20:00", "noon", "8 in the evening". */
export function findTime(clause: string): Found<string> | null {
  let m = /\b(?:at\s+)?(\d{1,2})(?:[:.h](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?=\s|$|[,.;])/i.exec(
    clause,
  );
  if (m) {
    let h = Number(m[1]);
    const min = Number(m[2] ?? '0');
    const pm = /^p/i.test(m[3]!);
    if (h < 1 || h > 12 || min > 59) return null;
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
    return { value: `${pad(h)}:${pad(min)}`, match: m[0] };
  }
  m =
    /\b(?:at\s+)?(\d{1,2})(?:[:.h](\d{2}))?(?:\s*o'?clock)?\s+(?:in the\s+)?(morning|afternoon|evening|at night|tonight)\b/i.exec(
      clause,
    );
  if (m) {
    let h = Number(m[1]);
    const min = Number(m[2] ?? '0');
    if (h < 1 || h > 12 || min > 59) return null;
    const pm = !/morning/i.test(m[3]!);
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
    return { value: `${pad(h)}:${pad(min)}`, match: m[0] };
  }
  m = /\b(?:at\s+)?([01]?\d|2[0-3])[:h]([0-5]\d)\b/i.exec(clause);
  if (m) return { value: `${pad(Number(m[1]))}:${m[2]}`, match: m[0] };
  m = /\b(?:at\s+)?(noon|midday)\b/i.exec(clause);
  if (m) return { value: '12:00', match: m[0] };
  return null;
}

/** A date resolved against `today`. Ambiguous phrases ("next week") return null. */
export function findDate(clause: string, today: string): Found<string> | null {
  const lower = clause.toLowerCase();
  // Positions are the same in `lower` and `clause`; return the caregiver's own casing.
  const orig = (x: RegExpExecArray) => clause.slice(x.index, x.index + x[0].length);
  let m = /\b(?:on\s+|from\s+|by\s+|starting\s+)?the day after tomorrow\b/.exec(lower);
  if (m) return { value: addDays(today, 2), match: orig(m) };
  m = /\b(?:from\s+|by\s+|starting\s+)?(today|tonight|tomorrow)\b/.exec(lower);
  if (m) return { value: addDays(today, m[1] === 'tomorrow' ? 1 : 0), match: orig(m) };

  m =
    /\b(?:in|within)\s+(\d+|a couple of|a few|couple|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(days?|weeks?|months?)(?:'?\s*time)?\b/.exec(
      lower,
    );
  if (m) {
    const n = /^\d+$/.test(m[1]!) ? Number(m[1]) : NUMBER_WORDS[m[1]!];
    if (n === undefined || n > 366) return null;
    const unit = m[2]!;
    const value = unit.startsWith('day')
      ? addDays(today, n)
      : unit.startsWith('week')
        ? addDays(today, n * 7)
        : addMonths(today, n);
    return { value, match: orig(m) };
  }

  m =
    /\b(?:(?:on|from|by|starting|this|next|from next|starting next)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.exec(
      lower,
    );
  if (m)
    return {
      value: nextWeekday(today, WEEKDAYS.indexOf(m[1] as (typeof WEEKDAYS)[number])),
      match: orig(m),
    };

  const monthAlt = MONTHS.join('|');
  m = new RegExp(
    `\\b(?:on\\s+|from\\s+|by\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthAlt})\\b`,
  ).exec(lower);
  let day: number | undefined;
  let month: number | undefined;
  if (m) {
    day = Number(m[1]);
    month = MONTHS.indexOf(m[2]!);
  } else {
    m = new RegExp(
      `\\b(?:on\\s+|from\\s+|by\\s+)?(${monthAlt})\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\b`,
    ).exec(lower);
    if (m) {
      month = MONTHS.indexOf(m[1]!);
      day = Number(m[2]);
    }
  }
  if (m && day !== undefined && month !== undefined) {
    let year = Number(today.slice(0, 4));
    let candidate = `${year}-${pad(month + 1)}-${pad(day)}`;
    if (!isRealDate(candidate)) return null;
    if (candidate < today) {
      year += 1;
      candidate = `${year}-${pad(month + 1)}-${pad(day)}`;
      if (!isRealDate(candidate)) return null;
    }
    return { value: candidate, match: orig(m) };
  }
  return null;
}

function isRealDate(ymd: string): boolean {
  const d = new Date(`${ymd}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === ymd;
}

function findDose(clause: string): Found<string> | null {
  const m = DOSE.exec(clause);
  if (!m) return null;
  const unitRaw = m[2]!.toLowerCase();
  const unit = UNIT_ALIASES[unitRaw] ?? unitRaw;
  return { value: `${m[1]!.replace(',', '.')} ${unit}`, match: m[0] };
}

function findMedicationName(clause: string, known: string[]): string | null {
  for (const name of known) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(clause)) return name;
  }
  const words = clause.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*/g) ?? [];
  const usable = (w: string) => {
    const base = w.toLowerCase().replace(/'s$/, '');
    return (
      !STOP_WORDS.has(base) &&
      !STOP_WORDS.has(w.toLowerCase()) &&
      !/'s$/i.test(w) &&
      base.length > 2
    );
  };
  // A capitalised word that is not a person, weekday or filler: "Mom's Donepezil goes..."
  const capital = words.find((w) => /^[A-Z]/.test(w) && usable(w));
  if (capital) return capitalize(capital);
  // Otherwise the word right before the change verb: "her donepezil goes to 5 mg".
  const verb = CHANGE_VERBS.exec(clause);
  if (verb) {
    const before = clause.slice(0, verb.index).match(/[A-Za-zÀ-ÿ'-]+/g) ?? [];
    const last = before[before.length - 1];
    if (last && usable(last)) return capitalize(last);
    const after = clause.slice(verb.index + verb[0].length).match(/[A-Za-zÀ-ÿ'-]+/g) ?? [];
    const next = after.find(usable);
    if (next && !DOSE.test(next)) return capitalize(next);
  }
  return null;
}

function stripPhrases(clause: string, phrases: (string | undefined)[]): string {
  let out = clause;
  for (const p of phrases) if (p) out = out.replace(p, ' ');
  return out.replace(/\s+/g, ' ').trim();
}

function cleanTitle(s: string): string {
  return capitalize(
    s
      .replace(
        /^(?:(?:and|also|then|so|she|he|they|we|has|have|got|there'?s|there is|there will be|a|an|the|her|his|mom'?s|mum'?s|dad'?s|next|is|will be|needs?|needs to have)\s+)+/i,
        '',
      )
      .replace(/\s+(?:on|at|for|in)$/i, '')
      .trim(),
  );
}

function said(clause: string): string {
  return `You said: "${clause}".`;
}

function note(clause: string): ExtractedItem {
  const text = capitalize(clause).slice(0, 500);
  return { kind: 'note', title: text.slice(0, 120), detail: said(clause), data: { text } };
}

/** One clause to at most one item. */
function extractClause(clause: string, today: string, known: string[]): ExtractedItem | null {
  const date = findDate(clause, today);
  const time = findTime(clause);
  const body = clause.replace(TODO_PREFIX, '');

  // 1. Imperatives the caregiver has to do: "pick up the new prescription".
  if (TODO_VERBS.test(body)) {
    const text = capitalize(stripPhrases(body, [date?.match, time?.match])).slice(0, 200);
    if (!text) return null;
    return {
      kind: 'todo',
      title: text.slice(0, 120),
      detail: said(clause),
      data: { text, dueDate: date?.value ?? null, dueTime: date ? (time?.value ?? null) : null },
    };
  }

  // 2. A dose: a medication change or a new medication.
  const dose = findDose(clause);
  const mentionsKnown = known.some((k) => clause.toLowerCase().includes(k.toLowerCase()));
  if (dose || mentionsKnown) {
    if (STOP_VERBS.test(clause)) return note(clause);
    const name = findMedicationName(clause, known);
    if (!name || (!dose && !time)) return note(clause);
    const isKnown = known.some((k) => k.toLowerCase() === name.toLowerCase());
    const kind =
      !isKnown && NEW_VERBS.test(clause) && !CHANGE_VERBS.test(clause)
        ? 'new_medication'
        : 'medication_change';
    const parts = [
      name,
      kind === 'medication_change' ? 'to' : '',
      dose?.value ?? '',
      time ? `at ${time.value}` : '',
    ];
    let title = parts.filter(Boolean).join(' ');
    if (date) title += ` from ${humanDate(date.value)}`;
    if (kind === 'new_medication') title = `Start ${title}`;
    return {
      kind,
      title: title.slice(0, 120),
      detail: said(clause),
      data: {
        medicationName: name,
        dose: dose?.value ?? null,
        times: time ? [time.value] : [],
        startDate: date?.value ?? null,
      },
    };
  }

  // 3. An appointment with a resolvable date: "blood test in two weeks".
  if (APPOINTMENT_WORDS.test(clause)) {
    if (!date) return note(clause);
    const title = cleanTitle(stripPhrases(clause, [date.match, time?.match])).slice(0, 160);
    if (!title) return note(clause);
    let heading = `${title} on ${humanDate(date.value)}`;
    if (time) heading += ` at ${time.value}`;
    return {
      kind: 'appointment',
      title: heading.slice(0, 120),
      detail: time ? said(clause) : `${said(clause)} No time was given.`,
      data: { title, date: date.value, time: time?.value ?? null, location: null },
    };
  }

  // 4. Care-related but unstructured: keep it as a note. Anything else is not ours.
  // "Stop the Aspirin" names a medication even when it is not on the list yet.
  if (CARE_WORDS.test(clause)) return note(clause);
  if (STOP_VERBS.test(clause) && findMedicationName(clause, known)) return note(clause);
  return null;
}

export function extractWithRules(input: RulesInput): RulesOutput {
  const known = input.knownMedications ?? [];
  const items: ExtractedItem[] = [];
  for (const clause of splitClauses(input.text.slice(0, 4000))) {
    const item = extractClause(clause, input.today, known);
    if (item) items.push(item);
    if (items.length >= 10) break;
  }
  return { summary: summarize(items), items };
}

/** "From your note: Donepezil to 5 mg at 20:00 from Monday 26 October; ..." */
export function summarize(items: ExtractedItem[]): string {
  if (items.length === 0) return '';
  const text = `From your note: ${items.map((i) => i.title).join('; ')}.`;
  return text.length > 400 ? `${text.slice(0, 397)}...` : text;
}
