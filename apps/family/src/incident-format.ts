import type { IncidentOutcome, IncidentStep } from './api/types';

export type StepTone = 'well' | 'attention' | 'incident';

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
    case 'incident_opened':
      return {
        title: 'We noticed something',
        subtitle: detailString(step.detail, 'reason'),
        tone: 'incident',
      };
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
    case 'stood_down':
      return { title: 'Stood down. All is well.', subtitle: null, tone: 'well' };
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
