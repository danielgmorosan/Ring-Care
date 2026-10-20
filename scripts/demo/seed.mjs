// pnpm demo:seed: the Ferreira household, ready to film. Safe to run again and again.
//
//   pnpm demo:seed
//   pnpm demo:seed --sofia +351912345678 --miguel +351913456789 --rosa +351914567890
//
// Flags (or environment): --base (DEMO_BASE, default http://localhost:3000), --email
// (DEMO_EMAIL), --password (DEMO_PASSWORD), --family-name, --timezone, --sofia / --miguel /
// --rosa (DEMO_PHONE_SOFIA, DEMO_PHONE_MIGUEL, DEMO_PHONE_ROSA).
import {
  DemoError,
  backendEnv,
  baseUrl,
  client,
  expectOk,
  loadSession,
  log,
  parseFlags,
  readEnvText,
  ringSim,
  run,
  saveSession,
  writeEnvText,
} from './lib/common.mjs';
import { ensureEnv } from './lib/ensure-env.mjs';
import { setEnvValues } from './lib/envfile.mjs';
import { FICTIONAL_PHONES, isFictional, parsePhone } from './lib/phone.mjs';
import {
  SIM_CAMERA_ID,
  demoContacts,
  needsRestart,
  planCamera,
  planContacts,
  planMedications,
  planVisit,
} from './lib/plan.mjs';
import { lastLocal, localClock } from './lib/time.mjs';

const HELP = `Usage: pnpm demo:seed [--sofia +351...] [--miguel +351...] [--rosa +351...]
  [--email sofia@example.com] [--password demo-pass-123] [--base http://localhost:3000]
Phones may also come from DEMO_PHONE_SOFIA, DEMO_PHONE_MIGUEL, DEMO_PHONE_ROSA.`;

function options(flags) {
  const env = process.env;
  return {
    email: String(flags.email ?? env.DEMO_EMAIL ?? 'sofia@example.com'),
    password: String(flags.password ?? env.DEMO_PASSWORD ?? 'demo-pass-123'),
    familyName: String(flags['family-name'] ?? 'Ferreira'),
    timezone: String(flags.timezone ?? 'Europe/Lisbon'),
    phones: {
      sofia: flags.sofia ?? flags['phone-sofia'] ?? env.DEMO_PHONE_SOFIA,
      miguel: flags.miguel ?? flags['phone-miguel'] ?? env.DEMO_PHONE_MIGUEL,
      rosa: flags.rosa ?? flags['phone-rosa'] ?? env.DEMO_PHONE_ROSA,
    },
  };
}

/** Validate the phones before touching anything. Fictional numbers only without Twilio. */
function resolvePhones(raw, twilio) {
  const out = {};
  const errors = [];
  const missing = [];
  for (const [who, value] of Object.entries(raw)) {
    if (value === undefined || value === true || value === '') {
      missing.push(who);
      continue;
    }
    const p = parsePhone(value, `${who[0].toUpperCase()}${who.slice(1)}'s phone`);
    if (p.ok) out[who] = p.value;
    else errors.push(p.error);
  }
  if (errors.length) throw new DemoError(errors.join('\n       '));
  if (missing.length && twilio) {
    throw new DemoError(
      `Twilio is configured, so every contact needs a real phone. Missing: ${missing.join(', ')}. ` +
        'Pass --sofia +351... --miguel +351... --rosa +351... (verified numbers on a trial account).',
    );
  }
  for (const who of missing) out[who] = undefined;
  return { phones: out, missing };
}

async function signIn(api, opts) {
  const login = await api.post('/auth/login', { email: opts.email, password: opts.password });
  if (login.ok) {
    log.ok(`Logged in as ${opts.email}`);
    return login.body;
  }
  if (login.status !== 401) expectOk(login, 'Log in');
  const signup = await api.post('/auth/signup', {
    email: opts.email,
    password: opts.password,
    familyName: opts.familyName,
    timezone: opts.timezone,
  });
  if (signup.status === 409) {
    throw new DemoError(
      `${opts.email} exists with a different password. Pass --password, or pick another --email.`,
    );
  }
  const body = expectOk(signup, 'Sign up');
  log.ok(`Signed up ${opts.email} (family ${opts.familyName})`);
  return body;
}

/** POST /bee/webhook with no secret: 503 = Bee off in the running backend, 401 = on. */
async function beeEnabled(api) {
  const res = await api.post('/bee/webhook', {});
  return res.status !== 503;
}

async function seedCamera(api, env, timezone) {
  let cameras = expectOk(await api.get('/me/ring/cameras'), 'GET /me/ring/cameras');
  let plan = planCamera(cameras);
  if (plan.action === 'simulate') {
    log.info('No Ring camera yet: sending one signed daytime event through the simulator');
    const at = new Date(lastLocal(14, 0, timezone, Date.now())).toISOString();
    const sim = await ringSim(
      ['--scenario', 'daytime-motion', '--at', at, '--url', api.base, '--camera', SIM_CAMERA_ID],
      { timeZone: timezone, secret: env.RING_HMAC_SECRET },
    );
    if (sim.code !== 0) throw new DemoError('The Ring simulator failed (see above).');
    for (let i = 0; i < 10 && plan.action === 'simulate'; i++) {
      await new Promise((r) => setTimeout(r, 500));
      cameras = expectOk(await api.get('/me/ring/cameras'), 'GET /me/ring/cameras');
      plan = planCamera(cameras);
    }
    if (plan.action === 'simulate') throw new DemoError('The simulated event created no camera.');
  }
  if (plan.action === 'place') {
    expectOk(
      await api.patch(`/me/ring/cameras/${plan.id}`, { placement: 'front_door' }),
      'Set camera placement',
    );
    log.ok(`Ring camera ${plan.camera.ringDeviceId} placed at the front door`);
  } else {
    log.ok(`Ring camera ${plan.camera.ringDeviceId} is at the front door`);
  }
}

run(async () => {
  const { flags } = parseFlags(process.argv.slice(2));
  if (flags.help) {
    console.log(HELP);
    return;
  }
  const opts = options(flags);
  console.log('Obrigada demo: seed the Ferreira household');
  await ensureEnv({ quiet: true });
  const env = backendEnv();
  const twilio = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER);
  const { phones, missing } = resolvePhones(opts.phones, twilio);

  const base = baseUrl(flags, loadSession());
  let api = client(base);
  expectOk(await api.get('/health/live'), 'GET /health/live');

  log.step('1. Caregiver account');
  const auth = await signIn(api, opts);
  const familyId = auth.family.id;
  saveSession({
    base,
    email: opts.email,
    token: auth.token,
    familyId,
    savedAt: new Date().toISOString(),
  });
  log.ok('Session saved to .demo/session.json (gitignored)');
  api = client(base, auth.token);

  const family = expectOk(await api.get('/me/family'), 'GET /me/family');
  if (family.timezone !== opts.timezone) {
    expectOk(await api.patch('/me/family', { timezone: opts.timezone }), 'Set timezone');
    log.ok(`Household timezone set to ${opts.timezone} (was ${family.timezone})`);
  } else {
    log.ok(`Household timezone is ${opts.timezone}`);
  }

  log.step('2. Link Ring and Bee to this family in apps/backend/.env');
  const envUpdate = setEnvValues(readEnvText(), {
    RING_FAMILY_ID: familyId,
    BEE_FAMILY_ID: familyId,
  });
  if (envUpdate.changed.length) {
    writeEnvText(envUpdate.text);
    for (const c of envUpdate.changed)
      log.ok(`${c.key}=${c.to}${c.from ? ` (was ${c.from})` : ''}`);
  } else {
    log.ok(`RING_FAMILY_ID and BEE_FAMILY_ID already point at ${familyId}`);
  }

  log.step('3. Contacts (called in priority order)');
  const fictional = Object.fromEntries(
    Object.entries(phones).map(([k, v]) => [k, v ?? FICTIONAL_PHONES[k]]),
  );
  const existingContacts = expectOk(await api.get('/me/contacts'), 'GET /me/contacts');
  // Never replace a real number with a fictional one on a re-run without phones.
  const wanted = demoContacts(fictional).map((c) => {
    const have = existingContacts.find((e) => e.name.toLowerCase() === c.name.toLowerCase());
    if (have?.phone && !isFictional(have.phone) && isFictional(c.phone))
      return { ...c, phone: undefined };
    return c;
  });
  for (const step of planContacts(existingContacts, wanted)) {
    if (step.action === 'create') {
      const c = expectOk(await api.post('/me/contacts', step.body), `Add ${step.name}`);
      log.ok(`Added ${c.name} (${c.role}, priority ${c.priority}, ${c.phone ?? 'no phone'})`);
    } else if (step.action === 'update') {
      expectOk(await api.patch(`/me/contacts/${step.id}`, step.body), `Update ${step.name}`);
      log.ok(`Updated ${step.name}: ${Object.keys(step.body).join(', ')}`);
    } else {
      log.ok(`${step.name} is already set up`);
    }
  }
  const fictionalNow = expectOk(await api.get('/me/contacts'), 'GET /me/contacts')
    .filter((c) => isFictional(c.phone))
    .map((c) => c.name);
  if (missing.length && fictionalNow.length) {
    log.warn(
      `${fictionalNow.join(', ')}: fictional +44 7700 900xxx numbers (reserved for drama; ` +
        'the mock dials no one). Real calls: pass --sofia/--miguel/--rosa.',
    );
  }

  log.step("4. Anna's expected visit");
  const visitPlan = planVisit(expectOk(await api.get('/me/visits'), 'GET /me/visits'), Date.now());
  if (visitPlan.action === 'create') {
    const v = expectOk(await api.post('/me/visits', visitPlan.body), 'Log the visit');
    log.ok(
      `Anna expected ${localClock(Date.parse(v.startsAt), opts.timezone)}` +
        `-${localClock(Date.parse(v.endsAt), opts.timezone)} (${opts.timezone})`,
    );
    const grace = env.VISIT_ARRIVAL_GRACE_MINUTES ?? '20';
    log.info(
      `Film carer-arrival within ${grace} minutes, or the app also shows "Anna hasn't ` +
        'arrived yet" for this visit (that is the no-show working).',
    );
  } else {
    log.ok(
      `Anna's visit is open until ${localClock(Date.parse(visitPlan.visit.endsAt), opts.timezone)}`,
    );
  }
  // The night exit is stamped at the most recent 03:04; check that one and the next.
  const last = lastLocal(3, 4, opts.timezone, Date.now());
  const v = visitPlan.visit ?? visitPlan.body;
  const covers = (t) => Date.parse(v.startsAt) - 15 * 60_000 <= t && Date.parse(v.endsAt) >= t;
  if (covers(last) || covers(last + 86_400_000)) {
    log.warn(
      'This visit window covers 03:04: a night exit would count as the visit, not an alarm.',
    );
  }

  log.step('5. Medications');
  const meds = expectOk(await api.get('/me/medications'), 'GET /me/medications');
  for (const step of planMedications(meds)) {
    if (step.action === 'create') {
      expectOk(await api.post('/me/medications', step.body), `Add ${step.name}`);
      log.ok(`Added ${step.name} ${step.body.dosage} at ${step.body.times.join(', ')}`);
    } else {
      log.ok(`${step.name} is already on the plan`);
    }
  }

  log.step('6. Ring camera at the front door');
  const ringStatus = expectOk(await api.get('/me/ring/status'), 'GET /me/ring/status');
  const bee = await beeEnabled(api);
  if (needsRestart({ envChanged: envUpdate.changed.length > 0, ringStatus }) || !bee) {
    log.warn('The running backend has not loaded RING_FAMILY_ID / BEE_FAMILY_ID yet.');
    log.step('Restart the backend so it reads them:');
    log.info('In the backend terminal press Ctrl+C (answer Y if asked), then: pnpm backend:dev');
    log.info('When it says "Obrigada backend listening", run this again: pnpm demo:seed');
    log.info('(The second run only adds what is missing: the Ring camera.)');
    return 0;
  }
  log.ok(`Ring webhooks are on for this family (mode ${ringStatus.mode})`);
  await seedCamera(api, env, opts.timezone);

  log.step('Seeded. Open the family app and log in:');
  log.info(
    `${opts.email} / ${opts.password === 'demo-pass-123' ? 'demo-pass-123' : '(your --password)'}`,
  );
  log.info('Then film: pnpm demo:scene night-exit');
  log.info('Health summary any time: pnpm demo:check');
  return 0;
});
