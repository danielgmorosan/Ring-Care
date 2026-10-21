// Idempotent seed planning. Given what the backend already has, decide what to create,
// update or keep, so `pnpm demo:seed` can run any number of times without duplicates.
// Pure: no network, no clock (now is passed in).

export const SIM_CAMERA_ID = 'ring-sim-front-door';
const HOUR = 3_600_000;

/** The demo household, from the video script. Phones are filled in by the caller. */
export function demoContacts(phones) {
  return [
    {
      name: 'Sofia',
      role: 'daughter',
      phone: phones.sofia,
      priority: 0,
      quietHours: { start: '22:00', end: '07:00', wakeForConfirmedFallOnly: true },
    },
    { name: 'Miguel', role: 'son', phone: phones.miguel, priority: 1, quietHours: null },
    { name: 'Rosa', role: 'neighbour', phone: phones.rosa, priority: 2, quietHours: null },
  ];
}

export const DEMO_MEDICATIONS = [
  { name: 'Vitamin D', dosage: '1000 IU', times: ['08:00'] },
  { name: 'Donepezil', dosage: '2.5 mg', times: ['08:00'] },
];

const same = (a, b) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

function sameQuietHours(a, b) {
  if (!a || !b) return !a && !b;
  return (
    a.start === b.start &&
    a.end === b.end &&
    Boolean(a.wakeForConfirmedFallOnly) === Boolean(b.wakeForConfirmedFallOnly)
  );
}

export const ELDER_RELATIONS = ['mother', 'father', 'grandmother', 'grandfather', 'other'];

/**
 * Household settings: timezone and the elder's display name and relation. Returns the
 * PATCH /me/family body for what differs (empty when nothing does). The name stays in the
 * family app; narration and Q&A only ever see roles.
 */
export function planFamily(family, desired) {
  const patch = {};
  if (desired.timezone !== undefined && family.timezone !== desired.timezone) {
    patch.timezone = desired.timezone;
  }
  if (desired.elderName !== undefined && (family.elderName ?? null) !== desired.elderName) {
    patch.elderName = desired.elderName;
  }
  if (
    desired.elderRelation !== undefined &&
    (family.elderRelation ?? null) !== desired.elderRelation
  ) {
    patch.elderRelation = desired.elderRelation;
  }
  return patch;
}

/** Contacts are matched by name. Changed fields are patched; nothing is deleted. */
export function planContacts(existing, desired) {
  return desired.map((want) => {
    const have = existing.find((c) => same(c.name, want.name));
    const body = {
      name: want.name,
      role: want.role,
      priority: want.priority,
      ...(want.phone ? { phone: want.phone } : {}),
      ...(want.quietHours ? { quietHours: want.quietHours } : {}),
    };
    if (!have) return { action: 'create', name: want.name, body };
    const patch = {};
    if (have.role !== want.role) patch.role = want.role;
    if (have.priority !== want.priority) patch.priority = want.priority;
    if (want.phone && have.phone !== want.phone) patch.phone = want.phone;
    if (!sameQuietHours(have.quietHours, want.quietHours)) patch.quietHours = want.quietHours;
    if (Object.keys(patch).length === 0) return { action: 'keep', name: want.name, id: have.id };
    return { action: 'update', name: want.name, id: have.id, body: patch };
  });
}

/**
 * Anna's expected visit: keep an Anna visit that is open now with at least an hour to
 * go, otherwise log a new one from now for three hours.
 */
export function planVisit(existing, nowMs, label = 'Anna') {
  const open = existing.find(
    (v) =>
      same(v.visitorLabel, label) &&
      Date.parse(v.startsAt) <= nowMs &&
      Date.parse(v.endsAt) >= nowMs + HOUR,
  );
  if (open) return { action: 'keep', id: open.id, visit: open };
  return {
    action: 'create',
    body: {
      visitorLabel: label,
      startsAt: new Date(nowMs).toISOString(),
      endsAt: new Date(nowMs + 3 * HOUR).toISOString(),
      notes: 'Carer visit',
    },
  };
}

/** Medications are matched by name and never edited (a Bee approval may have changed them). */
export function planMedications(existing, desired = DEMO_MEDICATIONS) {
  return desired.map((want) => {
    const have = existing.find((m) => same(m.name, want.name));
    return have
      ? { action: 'keep', name: want.name, id: have.id }
      : { action: 'create', name: want.name, body: want };
  });
}

/**
 * The front-door camera. No camera yet: send one simulated daytime event, which creates
 * it. Then make sure it is placed at the front door, which night exits and arrivals need.
 * A real (synced) camera is preferred over the simulator's when both exist.
 */
export function planCamera(cameras, simId = SIM_CAMERA_ID) {
  if (cameras.length === 0) return { action: 'simulate' };
  const cam =
    cameras.find((c) => c.placement === 'front_door') ??
    cameras.find((c) => c.ringDeviceId === simId) ??
    cameras[0];
  if (cam.placement === 'front_door') return { action: 'keep', id: cam.id, camera: cam };
  return { action: 'place', id: cam.id, camera: cam };
}

/**
 * Does the running backend need a restart to pick up RING_FAMILY_ID / BEE_FAMILY_ID?
 * `ringStatus` is GET /me/ring/status for this family: `webhooks` is true only when the
 * backend booted with RING_HMAC_SECRET and RING_FAMILY_ID equal to this family.
 */
export function needsRestart({ envChanged, ringStatus }) {
  if (envChanged) return true;
  return !(ringStatus && ringStatus.webhooks === true);
}
