import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { z } from 'zod';
import { LLM_PORT, type LlmPort } from '../../ai/llm.port';
import { extractedItemSchema, type ExtractedItem } from '../care-proposal.entity';
import { localDate } from './calendar';
import { RULES_EXTRACTOR_ID, extractWithRules, summarize } from './rules-extractor';

export interface ExtractionInput {
  /** The caregiver's own words (transcript text). Never audio. */
  text: string;
  /** When the note was spoken; relative dates resolve against it. */
  spokenAt: string;
  /** The family's IANA timezone. */
  timezone: string;
  currentMedications: { name: string; dosage: string | null; times: string[] }[];
}

export interface ExtractionResult {
  summary: string;
  items: ExtractedItem[];
  /** 'bedrock:<model>' | 'anthropic:<model>' | 'rules:v1'. */
  extractedBy: string;
}

const MAX_NOTE_CHARS = 4000;
const MAX_ITEMS = 10;

export const EXTRACTION_SYSTEM_PROMPT = `You turn a caregiver's short voice note, spoken in her own words after a doctor's visit, into proposed changes to an older person's care plan. A human reviews every item before anything changes.

Reply with ONE JSON object and nothing else:
{"summary": string, "items": Item[]}

Item is one of:
{"kind":"medication_change","title":string,"detail":string,"data":{"medicationName":string,"dose":string|null,"times":["HH:MM"],"startDate":"YYYY-MM-DD"|null}}
{"kind":"new_medication","title":string,"detail":string,"data":{"medicationName":string,"dose":string|null,"times":["HH:MM"],"startDate":"YYYY-MM-DD"|null}}
{"kind":"appointment","title":string,"detail":string,"data":{"title":string,"date":"YYYY-MM-DD","time":"HH:MM"|null,"location":string|null}}
{"kind":"todo","title":string,"detail":string,"data":{"text":string,"dueDate":"YYYY-MM-DD"|null,"dueTime":"HH:MM"|null}}
{"kind":"note","title":string,"detail":string,"data":{"text":string}}

Rules:
- Use only what the note says. Never invent a medication, dose, time, date or place.
- If you are unsure about any part of an item, make it a "note" with the caregiver's words instead.
- medication_change is for a medication in currentMedications (match the name); new_medication is for one not in the list.
- Resolve relative dates ("from Monday", "in two weeks", "tomorrow") against noteLocalDate, in the family's timezone. "From Monday" said on any day means the next Monday after that day. If a date is vague ("next week", "soon"), use a note.
- Times are 24-hour HH:MM and only when stated ("8 pm" is "20:00"). Leave time null when none was given.
- A task the caregiver has to do herself ("pick up the new prescription", "book the blood test") is a todo.
- title: a short, plain line, at most 80 characters. detail: the caregiver's words the item came from.
- summary: one short sentence. Warm, plain English. No em dashes.
- If the note has no care content, reply {"summary":"","items":[]}.`;

const responseSchema = z.object({
  summary: z.string().max(600).nullish(),
  items: z.array(z.unknown()).max(50),
});

/**
 * Extracts care items from the caregiver's note. Prefers the LLM behind LLM_PORT
 * (Bedrock EU, decision 0013) and falls back to the deterministic rules extractor when
 * the port is missing, answers with the mock, fails, or returns output that does not
 * validate. Either way the result is only ever a proposal for a human to approve.
 */
@Injectable()
export class CareExtractorService {
  private readonly logger = new Logger(CareExtractorService.name);

  constructor(@Optional() @Inject(LLM_PORT) private readonly llm?: LlmPort | null) {}

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    const text = input.text.trim().slice(0, MAX_NOTE_CHARS);
    const today = localDate(input.spokenAt, input.timezone);
    if (!text) return { summary: '', items: [], extractedBy: RULES_EXTRACTOR_ID };

    const fromLlm = await this.tryLlm({ ...input, text }, today);
    if (fromLlm) return fromLlm;

    const rules = extractWithRules({
      text,
      today,
      knownMedications: input.currentMedications.map((m) => m.name),
    });
    return { ...rules, extractedBy: RULES_EXTRACTOR_ID };
  }

  private async tryLlm(input: ExtractionInput, today: string): Promise<ExtractionResult | null> {
    if (!this.llm) return null;
    const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long' }).format(
      new Date(`${today}T12:00:00Z`),
    );
    // Minimized (rule #1): the caregiver's words, the date context and the current
    // medication schedule. No audio, no identities.
    const user = JSON.stringify({
      noteLocalDate: today,
      noteWeekday: weekday,
      timezone: input.timezone,
      currentMedications: input.currentMedications,
      note: input.text,
    });
    try {
      const res = await this.llm.complete({
        system: EXTRACTION_SYSTEM_PROMPT,
        user,
        maxTokens: 1200,
        json: true,
      });
      if (res.provider === 'mock') return null;
      const parsed = parseLlmExtraction(res.text);
      if (!parsed) {
        this.logger.warn('LLM extraction did not validate; using the rules extractor');
        return null;
      }
      return { ...parsed, extractedBy: `${res.provider}:${res.model}` };
    } catch (err) {
      this.logger.warn(
        `LLM extraction failed (${(err as Error).message}); using the rules extractor`,
      );
      return null;
    }
  }
}

function extractJsonObject(text: string): unknown {
  const unfenced = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start < 0 || end <= start) return undefined;
    try {
      return JSON.parse(unfenced.slice(start, end + 1));
    } catch {
      return undefined;
    }
  }
}

/**
 * Parses and validates LLM output. Returns null when the output is unusable (not JSON,
 * wrong shape, or the mock marker {"mock":true}). Individual items that fail validation
 * are downgraded to notes when they carry readable text, and dropped otherwise.
 */
export function parseLlmExtraction(
  text: string,
): { summary: string; items: ExtractedItem[] } | null {
  const raw = extractJsonObject(text);
  if (typeof raw === 'object' && raw !== null && (raw as { mock?: unknown }).mock === true) {
    return null;
  }
  const top = responseSchema.safeParse(raw);
  if (!top.success) return null;

  const items: ExtractedItem[] = [];
  for (const candidate of top.data.items) {
    const item = validateItem(candidate);
    if (item) items.push(item);
    if (items.length >= MAX_ITEMS) break;
  }
  const summary = top.data.summary?.trim() || summarize(items);
  return { summary: items.length ? summary.replace(/—/g, ',') : '', items };
}

function validateItem(candidate: unknown): ExtractedItem | null {
  const parsed = extractedItemSchema.safeParse(candidate);
  if (parsed.success) {
    const item = parsed.data;
    // A medication item with nothing to apply is not actionable: keep it as a note.
    if (
      (item.kind === 'medication_change' || item.kind === 'new_medication') &&
      !item.data.dose &&
      item.data.times.length === 0
    ) {
      return asNote(item.title, item.detail);
    }
    return item;
  }
  if (typeof candidate === 'object' && candidate !== null) {
    const c = candidate as { title?: unknown; detail?: unknown };
    if (typeof c.title === 'string' && c.title.trim()) {
      return asNote(c.title, typeof c.detail === 'string' ? c.detail : '');
    }
  }
  return null;
}

function asNote(title: string, detail: string): ExtractedItem {
  const t = title.trim().slice(0, 120);
  return {
    kind: 'note',
    title: t,
    detail: detail.trim().slice(0, 500),
    data: { text: (detail.trim() || t).slice(0, 500) },
  };
}
