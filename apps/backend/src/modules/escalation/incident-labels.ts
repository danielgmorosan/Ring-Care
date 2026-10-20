/**
 * Short, human labels for incident and alert reasons, for the Timeline and incident
 * headers. Brand voice: plain words, no drama. Pure and exported so the wording is
 * tested and every surface agrees. An unknown reason falls back to itself so a new
 * reason still renders rather than disappearing.
 */
const REASON_LABELS: Readonly<Record<string, string>> = Object.freeze({
  'fall.suspected': 'Possible fall',
  'fall.confirmed': 'Fall',
  'zone.breach': 'Off-limits area',
  wandering: 'Door at an unusual hour',
  // Ring (decision 0011).
  'door.night_activity': 'Front door at night',
  'visit.no_show': 'Expected visit missed',
});

export function incidentReasonLabel(reason: string): string {
  return Object.prototype.hasOwnProperty.call(REASON_LABELS, reason)
    ? REASON_LABELS[reason]!
    : reason;
}
