import { Injectable } from '@nestjs/common';
import type {
  DailySummaryRequest,
  NarrationPort,
  NarrationRequest,
  NarrationStep,
  QuestionRequest,
} from './narration.port';

/**
 * Dev/CI narration adapter. Produces a warm, human-words summary from the structured
 * trail with NO external call — deterministic, so tests are stable and nothing leaves
 * the backend. The real Claude adapter (F3.2) implements the same port. Brand voice:
 * short declarative sentences, no em dashes, informs and reassures without drama.
 */
@Injectable()
export class MockNarrationAdapter implements NarrationPort {
  async narrate(
    request: NarrationRequest,
  ): Promise<{ text: string; generatedBy: 'mock'; model: null }> {
    return { text: buildNarrative(request), generatedBy: 'mock', model: null };
  }

  async summarizeDay(
    request: DailySummaryRequest,
  ): Promise<{ text: string; generatedBy: 'mock'; model: null }> {
    return { text: buildDailySummary(request), generatedBy: 'mock', model: null };
  }

  async answer(
    request: QuestionRequest,
  ): Promise<{ text: string; generatedBy: 'mock'; model: null }> {
    return { text: buildAnswer(request), generatedBy: 'mock', model: null };
  }
}

function reasonPhrase(reason: string): string {
  switch (reason) {
    case 'fall.suspected':
      return 'We noticed a possible fall';
    case 'fall.confirmed':
      return 'We detected a fall';
    case 'zone.breach':
      return 'Someone entered an area marked off limits';
    case 'wandering':
      return 'We noticed movement toward the door at an unusual time';
    default:
      return `We opened an incident (${reason})`;
  }
}

function clockTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
}

function who(step: NarrationStep): string {
  return step.contactRole ? `your ${step.contactRole}` : 'the next contact';
}

/** Build the sentences that describe what happened, in ladder order. */
function eventSentences(steps: NarrationStep[]): string[] {
  const out: string[] = [];
  for (const step of steps) {
    switch (step.kind) {
      case 'voice_checkin_result':
        if (step.note === 'i_am_fine')
          out.push('They answered the check-in and said they are fine.');
        else if (step.note === 'distress')
          out.push('They answered the check-in and asked for help.');
        else if (step.note === 'silence') out.push('The check-in went unanswered.');
        else out.push('We ran a voice check-in.');
        break;
      case 'call_answered':
        out.push(`We reached ${who(step)} by phone.`);
        break;
      case 'call_no_answer':
        out.push(`${capitalize(who(step))} did not answer.`);
        break;
      case 'sms_sent':
        out.push(`We texted ${who(step)}.`);
        break;
      case 'quiet_hours_skipped':
        out.push(`We held off waking ${who(step)} during quiet hours.`);
        break;
      case 'emergency_notified':
        out.push('We called emergency services.');
        break;
      // incident_opened, call_placed, push_sent, stood_down are covered by the
      // opening line and the outcome line; no separate sentence needed.
      default:
        break;
    }
  }
  return out;
}

function outcomeSentence(outcome: string): string {
  switch (outcome) {
    case 'stood_down':
      return 'All is well.';
    case 'acknowledged':
      return 'A family member has it from here.';
    case 'emergency_notified':
      return 'Emergency services are on the way.';
    case 'active':
    default:
      return 'We are still working through it and will keep you posted.';
  }
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export function buildNarrative(request: NarrationRequest): string {
  const time = clockTime(request.openedAt);
  const opening = time
    ? `${reasonPhrase(request.reason)} at ${time}.`
    : `${reasonPhrase(request.reason)}.`;
  const parts = [opening, ...eventSentences(request.steps), outcomeSentence(request.outcome)];
  return parts.join(' ');
}

/** The reassuring line about whether the home was watched over today. */
function guardianSentence(total: number, online: number): string {
  if (total === 0) return 'No guardian is set up yet.';
  if (online === total) return 'Your guardian watched over the home throughout the day.';
  if (online > 0) return 'Your guardian is watching over the home now.';
  return 'Your guardian is offline right now. We will let you know when it reconnects.';
}

export function buildDailySummary(request: DailySummaryRequest): string {
  const { incidents } = request;
  const parts: string[] = [];

  if (incidents.length === 0) {
    parts.push('A calm day.');
    parts.push(guardianSentence(request.guardiansTotal, request.guardiansOnline));
    parts.push('Nothing needed your attention.');
    return parts.join(' ');
  }

  const resolved = incidents.every(
    (i) => i.outcome !== 'active' && i.outcome !== 'emergency_notified',
  );
  const count = incidents.length;
  parts.push(
    count === 1
      ? 'One moment needed attention today.'
      : `${capitalize(numberWord(count))} moments needed attention today.`,
  );
  const first = incidents[0]!;
  const firstTime = clockTime(first.at);
  parts.push(
    firstTime ? `${reasonPhrase(first.reason)} at ${firstTime}.` : `${reasonPhrase(first.reason)}.`,
  );
  parts.push(
    resolved ? 'Everything is settled now.' : 'We are still on it and will keep you posted.',
  );
  parts.push(guardianSentence(request.guardiansTotal, request.guardiansOnline));
  return parts.join(' ');
}

function numberWord(n: number): string {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five'];
  return words[n] ?? String(n);
}

/**
 * The local Q&A stand-in: a deterministic digest of the family's structured context.
 * It does not parse the question (real question-answering needs the Claude adapter);
 * it reports the facts plainly so the caregiver still gets grounded information.
 */
export function buildAnswer(request: QuestionRequest): string {
  const { incidents, guardians, medications, appointments } = request.context;
  const parts = ['Here is what I can tell you from the record.'];

  if (incidents.length === 0) {
    parts.push('Nothing has needed attention recently.');
  } else {
    const count = incidents.length;
    parts.push(
      count === 1
        ? 'One moment needed attention recently.'
        : `${capitalize(numberWord(count))} moments needed attention recently.`,
    );
    const latest = incidents[incidents.length - 1]!;
    const resolved = latest.outcome !== 'active' && latest.outcome !== 'emergency_notified';
    parts.push(
      `The most recent was ${reasonPhrase(latest.reason).toLowerCase()}, and ${
        resolved ? 'it is settled' : 'we are still on it'
      }.`,
    );
  }

  parts.push(guardianSentence(guardians.total, guardians.online));

  parts.push(
    medications.length === 0
      ? 'No medications are on the schedule.'
      : `${capitalize(numberWord(medications.length))} medication${
          medications.length === 1 ? '' : 's'
        } on the schedule.`,
  );

  parts.push(
    appointments.length === 0
      ? 'Nothing is on the calendar.'
      : `${capitalize(numberWord(appointments.length))} appointment${
          appointments.length === 1 ? '' : 's'
        } coming up, next is ${appointments[0]!.title}.`,
  );

  return parts.join(' ');
}
