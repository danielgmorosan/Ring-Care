import { z } from 'zod';

/**
 * A care-plan proposal extracted from the caregiver's own Bee voice note (decision 0012).
 * Proposals are append-only and never change the care plan by themselves: only a
 * caregiver's approval does. Status is derived from the decision record.
 */

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-31). */
const ymd = z
  .string()
  .regex(YMD)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'invalid date');
const hhmm = z.string().regex(HH_MM);
const text = (max: number) => z.string().trim().min(1).max(max);
/** Optional in LLM output; normalized to null. */
const opt = <T extends z.ZodTypeAny>(schema: T) =>
  schema
    .nullish()
    .transform((v): z.output<T> | null => (v === undefined ? null : (v as z.output<T> | null)));

export const medicationDataSchema = z.object({
  medicationName: text(120),
  dose: opt(text(120)),
  times: z
    .array(hhmm)
    .max(12)
    .nullish()
    .transform((v) => v ?? []),
  startDate: opt(ymd),
});

export const appointmentDataSchema = z.object({
  title: text(160),
  date: ymd,
  time: opt(hhmm),
  location: opt(text(200)),
});

export const todoDataSchema = z.object({
  text: text(200),
  dueDate: opt(ymd),
  dueTime: opt(hhmm),
});

export const noteDataSchema = z.object({ text: text(500) });

const base = {
  title: text(120),
  detail: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => v ?? ''),
};

/** One extracted item, before the server assigns its id. */
export const extractedItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('medication_change'), ...base, data: medicationDataSchema }),
  z.object({ kind: z.literal('new_medication'), ...base, data: medicationDataSchema }),
  z.object({ kind: z.literal('appointment'), ...base, data: appointmentDataSchema }),
  z.object({ kind: z.literal('todo'), ...base, data: todoDataSchema }),
  z.object({ kind: z.literal('note'), ...base, data: noteDataSchema }),
]);

export type ExtractedItem = z.infer<typeof extractedItemSchema>;
export type ProposalItemKind = ExtractedItem['kind'];
export type MedicationData = z.infer<typeof medicationDataSchema>;
export type AppointmentData = z.infer<typeof appointmentDataSchema>;
export type TodoData = z.infer<typeof todoDataSchema>;

/** Contract: ProposalItem = { id, kind, title, detail, data }. */
export type ProposalItem = ExtractedItem & { id: string };

export type ProposalStatus = 'pending' | 'approved' | 'rejected';

/** Per-item outcome of an approval, kept in the decision record. */
export interface ItemResult {
  itemId: string;
  kind: ProposalItemKind;
  status: 'applied' | 'noted' | 'skipped' | 'failed';
  /** The care-module record touched, when there is one. */
  medicationId?: string;
  appointmentId?: string;
  /** Bee todo created for this item, when there is one. */
  beeTodoId?: string;
  beeTodoError?: string;
  message?: string;
}

export interface DecisionResult {
  applied: string[];
  todosCreated: number;
  items: ItemResult[];
}

export interface CareProposalDecision {
  id: string;
  proposalId: string;
  decision: 'approved' | 'rejected';
  itemIds: string[];
  decidedBy: string | null;
  decidedAt: string;
  result: DecisionResult;
}

export interface StoredCareProposal {
  id: string;
  familyId: string;
  source: 'bee';
  sourceRef: string;
  summary: string;
  items: ProposalItem[];
  extractedBy: string;
  createdAt: string;
}

/** The contract shape returned to the family app. */
export interface CareProposal {
  id: string;
  source: 'bee';
  createdAt: string;
  summary: string;
  status: ProposalStatus;
  items: ProposalItem[];
  /** Present once decided. Additive to the contract. */
  decision?: { decision: 'approved' | 'rejected'; decidedAt: string; result: DecisionResult };
}
