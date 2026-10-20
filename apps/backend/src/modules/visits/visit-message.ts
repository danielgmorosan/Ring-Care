import { clockTimeInZone } from '../families/timezone';

/**
 * Family-facing words for expected visits (decision 0011). Brand voice: short declarative
 * sentences, warm, no em dashes, no drama. The visitor label is the family's own label
 * ("Anna", "Nurse"), so it is safe to show them. Pure and exported so the wording is
 * tested. Times are the household's local clock.
 */

/** The timeline line when a visitor arrives: "Anna arrived at 9:02." */
export function buildVisitArrivalText(visitorLabel: string, arrivedAt: string, tz: string): string {
  return `${visitorLabel} arrived at ${clockTimeInZone(arrivedAt, tz)}.`;
}

/** The alert when nobody arrived in the grace period: "Anna was expected at 9:00 and ..." */
export function buildVisitNoShowMessage(
  visitorLabel: string,
  startsAt: string,
  tz: string,
): string {
  return `${visitorLabel} was expected at ${clockTimeInZone(startsAt, tz)} and hasn't arrived yet. Open the app to check in.`;
}
