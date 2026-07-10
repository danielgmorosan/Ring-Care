/**
 * The alert a family receives when a scheduled medication dose was not confirmed (F3.4).
 * Brand voice: calm and plain, names the medication and the time, no alarm. It prompts
 * a check-in, it does not diagnose. Pure and exported so the wording is unit-tested.
 */
export function buildMissedDoseMessage(medicationName: string, slot: string): string {
  return `The ${slot} dose of ${medicationName} has not been confirmed. Open the app to check in.`;
}
