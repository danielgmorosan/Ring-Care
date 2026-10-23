/**
 * Plain-language meanings of incident reasons and outcomes, sent to the AI provider
 * beside the raw labels so it describes events correctly (for example, that Ring saw
 * *someone* at the door, not that the parent was "active"). Labels only, no names.
 */
const REASONS: Readonly<Record<string, string>> = {
  'door.night_activity':
    'A Ring doorbell saw a person at the front door during the night. Ring cannot tell who it was.',
  'visit.no_show': 'An expected carer visit had no arrival at the front door.',
  'fall.suspected': 'The guardian phone saw a possible fall.',
  'fall.confirmed': 'The guardian phone saw a fall.',
};

const OUTCOMES: Readonly<Record<string, string>> = {
  acknowledged: 'A family member confirmed they were handling it.',
  stood_down: 'It was resolved as fine.',
  family_alerted: 'The family was alerted by text and notification.',
  emergency_notified: 'Emergency services were notified.',
  active: 'It is still in progress.',
};

export function reasonMeaning(reason: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(REASONS, reason) ? REASONS[reason] : undefined;
}

export function outcomeMeaning(outcome: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(OUTCOMES, outcome) ? OUTCOMES[outcome] : undefined;
}

/** An incident as the language model sees it: when, what, and how it ended, in words. */
export interface ModelIncident {
  date: string;
  time: string;
  what: string;
  outcome: string;
}

interface IncidentLike {
  reason: string;
  outcome: string;
  at: string;
  localTime?: string;
  meaning?: string;
  outcomeMeaning?: string;
}

/**
 * The model-facing view of an incident. Raw labels like "door.night_activity" read to a
 * model as something the parent did; the plain meaning does not. Labels are kept only
 * when no meaning is known.
 */
export function incidentForModel(i: IncidentLike): ModelIncident {
  return {
    date: i.at.slice(0, 10),
    time: i.localTime ?? i.at,
    what: i.meaning ?? i.reason,
    outcome: i.outcomeMeaning ?? i.outcome,
  };
}

/** Replace `incidents` in a day-summary or Q&A request with their model-facing view. */
export function forModel<T extends object>(request: T): T {
  const r = request as unknown as {
    incidents?: IncidentLike[];
    context?: { incidents?: IncidentLike[] };
  };
  if (Array.isArray(r.incidents)) {
    return { ...request, incidents: r.incidents.map(incidentForModel) } as T;
  }
  if (r.context && Array.isArray(r.context.incidents)) {
    return {
      ...request,
      context: { ...r.context, incidents: r.context.incidents.map(incidentForModel) },
    } as T;
  }
  return request;
}
