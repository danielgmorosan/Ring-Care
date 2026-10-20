import type { IncidentOutcome, IncidentStep } from './api/types';

export type StepTone = 'well' | 'attention' | 'incident';

/** Why an incident opened, in human words, with a glyph and a source note. Unknown reasons
 * still render (humanised) so a newer backend never breaks the timeline. */
export interface ReasonInfo {
  label: string;
  glyph: string;
  tone: StepTone;
  /** Where the signal came from, e.g. "From Ring at the front door". */
  source: string | null;
}

const REASONS: Record<string, ReasonInfo> = {
  'fall.suspected': { label: 'Possible fall', glyph: '!', tone: 'incident', source: null },
  'fall.confirmed': { label: 'Fall', glyph: '!', tone: 'incident', source: null },
  'door.night_activity': {
    label: 'Front door at night',
    glyph: '☾',
    tone: 'attention',
    source: 'Seen by Ring at the front door',
  },
  'visit.no_show': {
    label: "Visit didn't happen",
    glyph: '◷',
    tone: 'attention',
    source: 'No arrival at the front door',
  },
};

export function reasonInfo(reason: string): ReasonInfo {
  const known = REASONS[reason];
  if (known) return known;
  const words = reason.replace(/[._]/g, ' ').trim();
  return {
    label: words.length > 0 ? words.charAt(0).toUpperCase() + words.slice(1) : 'Incident',
    glyph: '•',
    tone: 'attention',
    source: null,
  };
}

/** The opening step of the ladder, phrased for the kind of incident. */
function openedTitle(reason: string | null): string {
  switch (reason) {
    case 'door.night_activity':
      return 'Someone was at the front door at night';
    case 'visit.no_show':
      return "The expected visitor hasn't arrived";
    default:
      return 'We noticed something';
  }
}

/** How an incident resolved, in a warm chip label + tone. */
export function outcomeLabel(outcome: IncidentOutcome): { label: string; tone: StepTone } {
  switch (outcome) {
    case 'stood_down':
      return { label: 'All is well', tone: 'well' };
    case 'acknowledged':
      return { label: 'Answered by family', tone: 'well' };
    case 'emergency_notified':
      return { label: 'Emergency called', tone: 'incident' };
    case 'active':
    default:
      return { label: 'In progress', tone: 'attention' };
  }
}

function detailString(detail: IncidentStep['detail'], key: string): string | null {
  const value = detail[key];
  return typeof value === 'string' ? value : null;
}

/** One ladder step in human words: a title, a quiet subtitle, and a tone. */
export function stepLabel(step: IncidentStep): {
  title: string;
  subtitle: string | null;
  tone: StepTone;
} {
  const who = step.contactName ?? 'the next contact';
  switch (step.kind) {
    case 'incident_opened': {
      const reason = detailString(step.detail, 'reason');
      const info = reason ? reasonInfo(reason) : null;
      return {
        title: openedTitle(reason),
        subtitle: info ? (info.source ?? info.label) : null,
        tone: info?.tone === 'attention' ? 'attention' : 'incident',
      };
    }
    case 'voice_checkin_result': {
      const result = detailString(step.detail, 'result');
      if (result === 'i_am_fine')
        return { title: 'Voice check-in: they said they are fine', subtitle: null, tone: 'well' };
      if (result === 'distress')
        return { title: 'Voice check-in: they asked for help', subtitle: null, tone: 'incident' };
      if (result === 'silence')
        return { title: 'Voice check-in: no answer', subtitle: null, tone: 'attention' };
      return { title: 'Voice check-in', subtitle: result, tone: 'attention' };
    }
    case 'call_placed':
      return { title: `We called ${who}`, subtitle: null, tone: 'attention' };
    case 'call_answered':
      return { title: `${who} answered`, subtitle: null, tone: 'well' };
    case 'call_no_answer':
      return { title: `${who} did not answer`, subtitle: null, tone: 'attention' };
    case 'sms_sent':
      return { title: `We texted ${who}`, subtitle: null, tone: 'attention' };
    case 'push_sent':
      return { title: `We alerted ${who}`, subtitle: null, tone: 'attention' };
    case 'quiet_hours_skipped':
      return { title: `We waited before waking ${who}`, subtitle: 'Quiet hours', tone: 'well' };
    case 'emergency_notified':
      return { title: 'We called emergency services', subtitle: null, tone: 'incident' };
    case 'caregiver_acknowledged': {
      const by = detailString(step.detail, 'byName') ?? step.contactName;
      return {
        title: by ? `${by} is handling this` : 'Family is handling this',
        subtitle: 'Calls paused',
        tone: 'well',
      };
    }
    case 'acknowledgement_lapsed':
      return {
        title: 'No all-clear yet, so we carried on',
        subtitle: 'Calls resumed',
        tone: 'attention',
      };
    case 'stood_down': {
      const why = detailString(step.detail, 'reason');
      return {
        title: 'Stood down. All is well.',
        subtitle:
          why === 'voice_checkin_ok'
            ? 'They said they were fine'
            : why === 'caregiver_all_clear'
              ? 'Family confirmed all clear'
              : null,
        tone: 'well',
      };
    }
    default:
      return { title: step.kind.replace(/_/g, ' '), subtitle: null, tone: 'attention' };
  }
}

/** A short, warm relative time like "just now", "3h ago", "2 Jul". */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMin = Math.round((now - then) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Clock time for a single step, e.g. "3:12". Null when the step carries no timestamp. */
export function stepTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
