import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  demoContacts,
  needsRestart,
  planCamera,
  planContacts,
  planMedications,
  planVisit,
} from '../lib/plan.mjs';
import { lastLocal, localClock, nowNight } from '../lib/time.mjs';

const phones = { sofia: '+351910000001', miguel: '+351910000002', rosa: '+351910000003' };
const asStored = (c, i) => ({ id: `c${i}`, pushToken: null, ...c, phone: c.phone ?? null });

test("first run creates Sofia, Miguel and Rosa in priority order with Sofia's quiet hours", () => {
  const plan = planContacts([], demoContacts(phones));
  assert.deepEqual(
    plan.map((p) => [p.action, p.name, p.body.priority]),
    [
      ['create', 'Sofia', 0],
      ['create', 'Miguel', 1],
      ['create', 'Rosa', 2],
    ],
  );
  assert.deepEqual(plan[0].body.quietHours, {
    start: '22:00',
    end: '07:00',
    wakeForConfirmedFallOnly: true,
  });
  assert.equal(plan[1].body.quietHours, undefined);
});

test('a second run with the same data changes nothing', () => {
  const existing = demoContacts(phones).map(asStored);
  assert.deepEqual(
    planContacts(existing, demoContacts(phones)).map((p) => p.action),
    ['keep', 'keep', 'keep'],
  );
});

test('only what changed is patched; names match case-insensitively', () => {
  const existing = demoContacts(phones).map(asStored);
  existing[0] = {
    ...existing[0],
    name: 'sofia',
    quietHours: { start: '22:00', end: '07:00', wakeForConfirmedFallOnly: false },
  };
  existing[2] = { ...existing[2], priority: 5 };
  const plan = planContacts(existing, demoContacts({ ...phones, miguel: '+351919999999' }));
  assert.deepEqual(
    plan.map((p) => [p.action, p.body ?? null]),
    [
      ['update', { quietHours: { start: '22:00', end: '07:00', wakeForConfirmedFallOnly: true } }],
      ['update', { phone: '+351919999999' }],
      ['update', { priority: 2 }],
    ],
  );
});

test('a missing desired phone never clears a stored one', () => {
  const existing = demoContacts(phones).map(asStored);
  const plan = planContacts(existing, demoContacts({}));
  assert.deepEqual(
    plan.map((p) => p.action),
    ['keep', 'keep', 'keep'],
  );
});

const NOW = Date.parse('2026-10-21T10:00:00Z');

test('visit: keep an open Anna window with an hour to go, else log now + 3 h', () => {
  const open = {
    id: 'v1',
    visitorLabel: 'Anna',
    startsAt: '2026-10-21T09:30:00Z',
    endsAt: '2026-10-21T12:00:00Z',
  };
  assert.deepEqual(planVisit([open], NOW).action, 'keep');
  const endingSoon = { ...open, endsAt: '2026-10-21T10:30:00Z' };
  const fresh = planVisit([endingSoon, { ...open, visitorLabel: 'Plumber' }], NOW);
  assert.equal(fresh.action, 'create');
  assert.equal(fresh.body.startsAt, '2026-10-21T10:00:00.000Z');
  assert.equal(fresh.body.endsAt, '2026-10-21T13:00:00.000Z');
});

test('medications are created once and never edited', () => {
  assert.deepEqual(
    planMedications([]).map((p) => [p.action, p.body.name, p.body.dosage, p.body.times]),
    [
      ['create', 'Vitamin D', '1000 IU', ['08:00']],
      ['create', 'Donepezil', '2.5 mg', ['08:00']],
    ],
  );
  const existing = [{ id: 'm1', name: 'donepezil', dosage: '5 mg', times: ['20:00'] }];
  assert.deepEqual(
    planMedications(existing).map((p) => p.action),
    ['create', 'keep'],
  );
});

test('camera: simulate when none, place when not at the front door, keep otherwise', () => {
  assert.deepEqual(planCamera([]), { action: 'simulate' });
  const sim = { id: 'k1', ringDeviceId: 'ring-sim-front-door', placement: 'other' };
  assert.equal(planCamera([sim]).action, 'place');
  assert.equal(planCamera([sim]).id, 'k1');
  const real = { id: 'k2', ringDeviceId: 'abc', placement: 'front_door' };
  assert.equal(planCamera([sim, real]).id, 'k2');
  assert.equal(planCamera([real]).action, 'keep');
});

test('restart needed when .env changed or the backend does not have this family linked', () => {
  assert.equal(needsRestart({ envChanged: true, ringStatus: { webhooks: true } }), true);
  assert.equal(
    needsRestart({ envChanged: false, ringStatus: { mode: 'off', webhooks: false } }),
    true,
  );
  assert.equal(
    needsRestart({ envChanged: false, ringStatus: { mode: 'off', webhooks: true } }),
    false,
  );
});

test('household time: the last 03:04 in Lisbon, summer and winter, from any machine zone', () => {
  // 21 Oct 2026 is WEST (UTC+1): 03:04 Lisbon = 02:04Z.
  assert.equal(
    new Date(lastLocal(3, 4, 'Europe/Lisbon', NOW)).toISOString(),
    '2026-10-21T02:04:00.000Z',
  );
  // Before 03:04 local, it is yesterday's.
  const early = Date.parse('2026-10-21T01:00:00Z');
  assert.equal(
    new Date(lastLocal(3, 4, 'Europe/Lisbon', early)).toISOString(),
    '2026-10-20T02:04:00.000Z',
  );
  // December is WET (UTC+0).
  assert.equal(
    new Date(lastLocal(3, 4, 'Europe/Lisbon', Date.parse('2026-12-01T12:00:00Z'))).toISOString(),
    '2026-12-01T03:04:00.000Z',
  );
  assert.equal(
    new Date(lastLocal(14, 0, 'Europe/Lisbon', NOW)).toISOString(),
    '2026-10-20T13:00:00.000Z',
  );
  const n = nowNight('Europe/Lisbon', Date.parse('2026-10-21T10:00:17.250Z'));
  assert.equal(new Date(n).toISOString(), '2026-10-21T02:04:17.250Z');
  assert.equal(localClock(n, 'Europe/Lisbon'), '03:04');
});
