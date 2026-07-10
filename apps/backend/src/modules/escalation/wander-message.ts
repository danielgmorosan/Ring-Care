/**
 * The alert a family receives when someone left through a door and did not come back
 * within the window (F2.3 wandering). Brand voice: plain and calm, names the family's
 * own door, no dramatization, no em dashes. Pure and exported so the wording is tested.
 */
export function buildWanderMessage(doorName: string): string {
  return `Someone left through the ${doorName} and has not come back. Open the app to take a look.`;
}
