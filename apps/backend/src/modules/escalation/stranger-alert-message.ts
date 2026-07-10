/**
 * The critical-alert text a family receives when a guardian sees a stranger (F2.4).
 *
 * Brand voice: warm without being sentimental, confident without being cold, short
 * declarative sentences, no em dashes, never dramatized. It informs and reassures; it
 * does not alarm. The uniform is stated as the plain fact it is — context for the
 * caregiver's judgement, never a verdict (rule #5). Pure and exported so the exact
 * wording is unit-tested.
 */
export function buildStrangerAlertMessage(uniformed: boolean): string {
  if (uniformed) {
    return 'Someone we do not recognize is at the home, and they appear to be in a uniform. Open the app to take a look.';
  }
  return 'Someone we do not recognize is at the home. Open the app to take a look.';
}
