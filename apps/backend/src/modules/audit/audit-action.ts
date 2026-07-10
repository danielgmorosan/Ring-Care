/**
 * Maps an HTTP mutation to a stable semantic action and a warm, human label for the
 * caregiver's activity history. Kept side-effect free so it is trivially testable.
 */

const VERB: Record<string, string> = { POST: 'create', PATCH: 'update', DELETE: 'delete' };

/** The resource segment of a /me route, e.g. '/me/medications/:id' -> 'medications'. */
function resourceOf(route: string): string {
  const match = /^\/me\/([^/]+)/.exec(route);
  return match ? match[1]! : 'record';
}

/** A stable slug like 'medications.create'. Special-cases the pairing sub-route. */
export function deriveAction(method: string, route: string): string {
  if (route.endsWith('/claim-code')) return 'device.pair';
  if (route.endsWith('/wipe')) return 'device.wipe';
  const verb = VERB[method] ?? method.toLowerCase();
  return `${resourceOf(route)}.${verb}`;
}

const LABELS: Record<string, string> = {
  'devices.create': 'Registered a guardian',
  'device.pair': 'Started pairing a guardian',
  'device.wipe': 'Wiped a guardian remotely',
  'contacts.create': 'Added a contact',
  'contacts.update': 'Updated a contact',
  'contacts.delete': 'Removed a contact',
  'live.create': 'Opened the live camera',
  'people.create': 'Enrolled a household member',
  'people.update': 'Updated a household member',
  'people.delete': 'Removed a household member',
  'zones.create': 'Added a safety zone',
  'zones.update': 'Updated a safety zone',
  'zones.delete': 'Removed a safety zone',
  'visits.create': 'Logged an expected visit',
  'visits.update': 'Updated an expected visit',
  'visits.delete': 'Removed an expected visit',
  'medications.create': 'Added a medication',
  'medications.update': 'Updated a medication',
  'medications.delete': 'Removed a medication',
  'appointments.create': 'Added an appointment',
  'appointments.update': 'Updated an appointment',
  'appointments.delete': 'Removed an appointment',
  'ask.create': 'Asked Obrigada a question',
  'family.update': 'Updated home settings',
  'push-tokens.create': 'Registered a device for alerts',
  'push-tokens.delete': 'Removed a device from alerts',
  'export.create': 'Exported all family data',
  'erase.create': 'Erased all family data',
};

/** A human sentence for the activity feed; falls back to a readable default. */
export function actionLabel(action: string): string {
  if (LABELS[action]) return LABELS[action]!;
  const [resource, verb] = action.split('.');
  const past = verb === 'create' ? 'Added' : verb === 'delete' ? 'Removed' : 'Updated';
  return `${past} a ${resource ?? 'record'}`;
}
