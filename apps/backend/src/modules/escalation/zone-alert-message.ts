/**
 * The critical-alert text a family receives when someone enters a hazard zone (F2.3).
 *
 * Brand voice: warm, plain, short. It names the place the family named and says what
 * happened, nothing more. No dramatization, no em dashes. Pure and exported so the
 * wording is unit-tested. The zone name is the caregiver's own label, so it is safe to
 * include — it is not biometric or media (rule #1).
 */
export function buildZoneAlertMessage(zoneName: string): string {
  return `Someone is in the ${zoneName}. Open the app to take a look.`;
}

/**
 * The alert for a doorway crossing at an unusual hour (F2.3 wandering). Says the plain
 * fact — someone is at the door, and it is late — without alarm. Same voice rules.
 */
export function buildDoorCrossingMessage(zoneName: string): string {
  return `Someone is at the ${zoneName}, and it is late. Open the app to take a look.`;
}
