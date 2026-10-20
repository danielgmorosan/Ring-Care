import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AppointmentsService } from '../care/appointments.service';
import type { Medication } from '../care/medication.entity';
import { MedicationsService } from '../care/medications.service';
import { FamiliesService } from '../families/families.service';
import { normalizeTimeZone } from '../families/timezone';
import { BEE_API_PORT, type BeeApiPort } from './bee-api.port';
import type {
  CareProposal,
  CareProposalDecision,
  DecisionResult,
  ItemResult,
  MedicationData,
  ProposalItem,
  ProposalStatus,
  StoredCareProposal,
} from './care-proposal.entity';
import { CARE_PROPOSAL_REPOSITORY, type CareProposalRepository } from './care-proposal.repository';
import { addDays, humanDate, localDate, zonedTimeToUtc } from './extraction/calendar';

/** Placeholder wall-clock time for an appointment whose note gave no time. */
const APPOINTMENT_DEFAULT_TIME = '09:00';
/** Local time of the reminder the evening before an appointment. */
const APPOINTMENT_REMINDER_TIME = '18:00';
/** Local time of a todo's alarm when only a due date was given. */
const TODO_DEFAULT_TIME = '09:00';
/** Local time of the reminder on the morning a scheduled medication change starts. */
const MEDICATION_CHANGE_ALARM_TIME = '08:00';

/** Optional clock override (tests). */
export const BEE_CLOCK = Symbol('BEE_CLOCK');

export interface ApproveResult {
  applied: string[];
  /** Medication changes that start on a future date: noted, with a Bee todo for the day. */
  scheduled: string[];
  todosCreated: number;
}

/**
 * The caregiver's review of care proposals (decision 0012). Approval is the only path
 * from an extracted item to the care plan: medications and appointments change through
 * the care module's own services, and todos and appointment reminders go back to the
 * caregiver's Bee. Every decision is recorded once, immutably, with its per-item
 * outcome; repeating an approval answers from that record without applying again.
 */
@Injectable()
export class CareProposalsService {
  private readonly logger = new Logger(CareProposalsService.name);
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    @Inject(CARE_PROPOSAL_REPOSITORY) private readonly proposals: CareProposalRepository,
    @Inject(BEE_API_PORT) private readonly bee: BeeApiPort,
    private readonly families: FamiliesService,
    private readonly medications: MedicationsService,
    private readonly appointments: AppointmentsService,
    @Optional() @Inject(BEE_CLOCK) clock?: () => Date,
  ) {
    this.now = clock ?? (() => new Date());
  }

  private readonly now: () => Date;

  async list(familyId: string, status?: ProposalStatus): Promise<CareProposal[]> {
    await this.families.findByIdOrFail(familyId);
    const stored = await this.proposals.listByFamily(familyId);
    const decisions = await this.proposals.listDecisions(stored.map((p) => p.id));
    const byProposal = new Map(decisions.map((d) => [d.proposalId, d]));
    return stored
      .map((p) => toView(p, byProposal.get(p.id) ?? null))
      .filter((p) => !status || p.status === status);
  }

  async approve(
    familyId: string,
    userId: string | null,
    proposalId: string,
    itemIds?: string[],
  ): Promise<ApproveResult> {
    return this.withLock(proposalId, async () => {
      const proposal = await this.findOrFail(familyId, proposalId);
      const existing = await this.proposals.findDecision(proposal.id);
      if (existing) return answerFrom(existing);

      const selected = selectItems(proposal, itemIds);
      const family = await this.families.findByIdOrFail(familyId);
      const tz = normalizeTimeZone(family.timezone);
      const results: ItemResult[] = [];
      for (const item of selected) results.push(await this.applyItem(familyId, tz, item));

      const result: DecisionResult = {
        applied: results.filter((r) => r.status === 'applied').map((r) => r.itemId),
        scheduled: results.filter((r) => r.status === 'scheduled').map((r) => r.itemId),
        todosCreated: results.filter((r) => r.beeTodoId).length,
        items: results,
      };
      const { decision } = await this.proposals.recordDecision({
        proposalId: proposal.id,
        decision: 'approved',
        itemIds: selected.map((i) => i.id),
        decidedBy: userId,
        result,
      });
      this.logger.log(
        `Care proposal ${proposal.id} approved: ${result.applied.length}/${selected.length} applied, ${result.scheduled?.length ?? 0} scheduled, ${result.todosCreated} Bee todo(s)`,
      );
      return answerFrom(decision);
    });
  }

  async reject(familyId: string, userId: string | null, proposalId: string): Promise<CareProposal> {
    return this.withLock(proposalId, async () => {
      const proposal = await this.findOrFail(familyId, proposalId);
      const existing = await this.proposals.findDecision(proposal.id);
      if (existing && existing.decision === 'approved') {
        throw new ConflictException('This proposal was already approved.');
      }
      const decision =
        existing ??
        (
          await this.proposals.recordDecision({
            proposalId: proposal.id,
            decision: 'rejected',
            itemIds: [],
            decidedBy: userId,
            result: { applied: [], scheduled: [], todosCreated: 0, items: [] },
          })
        ).decision;
      return toView(proposal, decision);
    });
  }

  private async findOrFail(familyId: string, id: string): Promise<StoredCareProposal> {
    await this.families.findByIdOrFail(familyId);
    const proposal = await this.proposals.findById(familyId, id);
    if (!proposal) throw new NotFoundException(`Care proposal ${id} not found`);
    return proposal;
  }

  /** Serializes decisions per proposal within this process (the DB unique key backs it). */
  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(fn);
    this.locks.set(key, next);
    try {
      return await next;
    } finally {
      if (this.locks.get(key) === next) this.locks.delete(key);
    }
  }

  private async applyItem(familyId: string, tz: string, item: ProposalItem): Promise<ItemResult> {
    const base = { itemId: item.id, kind: item.kind };
    try {
      switch (item.kind) {
        case 'medication_change':
        case 'new_medication':
          return { ...base, ...(await this.applyMedication(familyId, tz, item.data)) };
        case 'appointment': {
          const d = item.data;
          const at = zonedTimeToUtc(d.date, d.time ?? APPOINTMENT_DEFAULT_TIME, tz);
          const appointment = await this.findOrCreateAppointment(familyId, d.title, at, {
            location: d.location ?? undefined,
            notes: d.time
              ? 'Added from a Bee note.'
              : 'Added from a Bee note. No time was given, so please check it.',
          });
          const reminderAt = zonedTimeToUtc(addDays(d.date, -1), APPOINTMENT_REMINDER_TIME, tz);
          const todoText = `Tomorrow: ${d.title}${d.time ? ` at ${d.time}` : ''}`;
          return {
            ...base,
            status: 'applied',
            appointmentId: appointment.id,
            ...(await this.createTodo(todoText, reminderAt)),
          };
        }
        case 'todo': {
          const d = item.data;
          const alarmAt = d.dueDate
            ? zonedTimeToUtc(d.dueDate, d.dueTime ?? TODO_DEFAULT_TIME, tz)
            : null;
          const todo = await this.createTodo(d.text, alarmAt);
          return { ...base, status: todo.beeTodoId ? 'applied' : 'failed', ...todo };
        }
        case 'note':
          return { ...base, status: 'noted' };
      }
    } catch (err) {
      this.logger.warn(`Applying proposal item ${item.id} failed: ${(err as Error).message}`);
      return { ...base, status: 'failed', message: (err as Error).message.slice(0, 200) };
    }
  }

  private async applyMedication(
    familyId: string,
    tz: string,
    d: MedicationData,
  ): Promise<MedicationOutcome> {
    const current = await this.medications.list(familyId);
    const found = matchMedication(current, d.medicationName);
    // Never update the wrong one: a name that fits several medications changes nothing.
    if (found.kind === 'ambiguous') {
      return {
        status: 'noted',
        message:
          `"${d.medicationName}" matches more than one medication ` +
          `(${found.candidates.map((m) => m.name).join(', ')}). Nothing was changed. ` +
          'Please update the right one in the care plan.',
      };
    }
    const match = found.kind === 'match' ? found.medication : null;
    // "From Monday": a change that starts later is not applied now (the elder keeps the
    // current dose until then). Today, a past date, or no date: apply immediately.
    if (d.startDate && d.startDate > localDate(this.now(), tz)) {
      return this.scheduleMedication(familyId, tz, d, d.startDate, match);
    }
    const startNote = d.startDate ? `From ${humanDate(d.startDate)}: ${describeDose(d)}.` : null;
    if (match) {
      const notes = startNote ? appendNote(match.notes, startNote) : undefined;
      const updated = await this.medications.update(familyId, match.id, {
        ...(d.dose ? { dosage: d.dose } : {}),
        ...(d.times.length > 0 ? { times: d.times } : {}),
        ...(notes !== undefined ? { notes } : {}),
      });
      return { status: 'applied', medicationId: updated.id };
    }
    const created = await this.medications.create(familyId, {
      name: d.medicationName,
      ...(d.dose ? { dosage: d.dose } : {}),
      times: d.times,
      notes: appendNote(null, startNote ?? 'Added from a Bee note.'),
    });
    return {
      status: 'applied',
      medicationId: created.id,
      message: 'Added to the medication list.',
    };
  }

  /**
   * A medication change that starts on `startDate`: the dose and times stay as they are,
   * the medication gets a dated note, and the caregiver's Bee gets a todo with an alarm on
   * the morning of the start date. A new medication is listed with the note but no dose
   * times, so no dose reminder fires before it starts.
   */
  private async scheduleMedication(
    familyId: string,
    tz: string,
    d: MedicationData,
    startDate: string,
    match: Medication | null,
  ): Promise<MedicationOutcome> {
    const when = humanDate(startDate);
    const note = `From ${when}: ${describeDose(d)}.`;
    let medicationId: string;
    if (match) {
      const notes = appendNote(match.notes, note);
      medicationId =
        notes === match.notes
          ? match.id // already noted (a retried approval)
          : (await this.medications.update(familyId, match.id, { notes })).id;
    } else {
      const created = await this.medications.create(familyId, {
        name: d.medicationName,
        times: [],
        notes: appendNote(null, `${note} Added from a Bee note.`),
      });
      medicationId = created.id;
    }
    const alarmAt = zonedTimeToUtc(startDate, MEDICATION_CHANGE_ALARM_TIME, tz);
    const todo = await this.createTodo(scheduledChangeTodo(d, match !== null), alarmAt);
    return {
      status: 'scheduled',
      medicationId,
      message: `Scheduled for ${when}. The current plan stays until then.`,
      ...todo,
    };
  }

  /** Re-applying after a crash must not double-book: reuse an identical appointment. */
  private async findOrCreateAppointment(
    familyId: string,
    title: string,
    at: string,
    extra: { location?: string; notes: string },
  ) {
    const existing = (await this.appointments.list(familyId)).find(
      (a) =>
        a.title.toLowerCase() === title.toLowerCase() &&
        new Date(a.at).getTime() === new Date(at).getTime(),
    );
    if (existing) return existing;
    return this.appointments.create(familyId, { title, at, ...extra });
  }

  /** Creates a Bee todo. Alarms in the past are dropped. Bee failures never fail the item. */
  private async createTodo(
    text: string,
    alarmAt: string | null,
  ): Promise<Pick<ItemResult, 'beeTodoId' | 'beeTodoError'>> {
    const alarm = alarmAt && new Date(alarmAt).getTime() > this.now().getTime() ? alarmAt : null;
    try {
      const todo = await this.bee.createTodo(text.slice(0, 200), alarm);
      return { beeTodoId: todo.id };
    } catch (err) {
      this.logger.warn(`Bee todo failed: ${(err as Error).message}`);
      return { beeTodoError: (err as Error).message.slice(0, 200) };
    }
  }
}

type MedicationOutcome = Pick<
  ItemResult,
  'status' | 'medicationId' | 'message' | 'beeTodoId' | 'beeTodoError'
>;

/** "Donepezil changes to 5 mg at 20:00 today", read on the morning of the start date. */
function scheduledChangeTodo(d: MedicationData, existing: boolean): string {
  const dose = [d.dose, d.times.length ? `at ${d.times.join(', ')}` : null]
    .filter(Boolean)
    .join(' ');
  if (!existing) return `${d.medicationName} starts today${dose ? `: ${dose}` : ''}`;
  return dose
    ? `${d.medicationName} changes to ${dose} today`
    : `${d.medicationName} changes today. Check the care plan.`;
}

function selectItems(proposal: StoredCareProposal, itemIds?: string[]): ProposalItem[] {
  if (itemIds === undefined) return proposal.items;
  const wanted = new Set(itemIds);
  const unknown = itemIds.filter((id) => !proposal.items.some((i) => i.id === id));
  if (unknown.length > 0) throw new BadRequestException(`Unknown item ids: ${unknown.join(', ')}`);
  if (wanted.size === 0) {
    throw new BadRequestException('Choose at least one item to approve, or reject the proposal.');
  }
  return proposal.items.filter((i) => wanted.has(i.id));
}

function answerFrom(decision: CareProposalDecision): ApproveResult {
  if (decision.decision === 'rejected') {
    throw new ConflictException('This proposal was already rejected.');
  }
  return {
    applied: decision.result.applied,
    scheduled: decision.result.scheduled ?? [],
    todosCreated: decision.result.todosCreated,
  };
}

function toView(p: StoredCareProposal, d: CareProposalDecision | null): CareProposal {
  return {
    id: p.id,
    source: p.source,
    createdAt: p.createdAt,
    summary: p.summary,
    status: d ? d.decision : 'pending',
    items: p.items,
    ...(d ? { decision: { decision: d.decision, decidedAt: d.decidedAt, result: d.result } } : {}),
  };
}

/** Case, whitespace and punctuation-insensitive: "Vitamin-D3 (1000 IU)" -> "vitamin d3 1000 iu". */
export function normalizeMedicationName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export type MedicationMatch =
  | { kind: 'match'; medication: Medication }
  | { kind: 'none' }
  | { kind: 'ambiguous'; candidates: Medication[] };

/**
 * Which listed medication a spoken name refers to. The full normalized name must match:
 * exactly, or as whole words inside the stored name ("Donepezil" fits "Donepezil 10 mg
 * tablets"). A first-word match is never enough, so "Vitamin D" does not fit "Vitamin
 * B12". More than one candidate is ambiguous: the caller must not update any of them.
 */
export function matchMedication(list: Medication[], spoken: string): MedicationMatch {
  const wanted = normalizeMedicationName(spoken);
  if (!wanted) return { kind: 'none' };
  const exact = list.filter((m) => normalizeMedicationName(m.name) === wanted);
  if (exact.length === 1) return { kind: 'match', medication: exact[0]! };
  if (exact.length > 1) return { kind: 'ambiguous', candidates: exact };
  const containing = list.filter((m) =>
    ` ${normalizeMedicationName(m.name)} `.includes(` ${wanted} `),
  );
  if (containing.length === 1) return { kind: 'match', medication: containing[0]! };
  if (containing.length > 1) return { kind: 'ambiguous', candidates: containing };
  return { kind: 'none' };
}

function describeDose(d: MedicationData): string {
  const parts = [d.dose, d.times.length ? `at ${d.times.join(', ')}` : null].filter(Boolean);
  return parts.length ? parts.join(' ') : 'as discussed';
}

function appendNote(existing: string | null, line: string): string {
  if (existing?.includes(line)) return existing; // a retried approval never doubles a note
  const combined = existing ? `${existing} ${line}` : line;
  return combined.length > 500 ? combined.slice(combined.length - 500) : combined;
}
