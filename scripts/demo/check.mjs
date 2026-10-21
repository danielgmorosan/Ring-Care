// pnpm demo:check: one screen that says whether the live run will work, and what to
// fix if not. Read-only (the one POST is an unauthenticated probe that changes nothing).
import {
  backendEnv,
  baseUrl,
  client,
  loadSession,
  log,
  parseFlags,
  readEnvText,
  run,
} from './lib/common.mjs';
import { isFictional } from './lib/phone.mjs';
import { planCamera } from './lib/plan.mjs';
import { hostPort, pgPing, temporalPing } from './lib/probes.mjs';

let problems = 0;
/** Fine for a dry run, needed for the live run (real phones ringing). */
const liveGaps = [];
const bad = (m) => {
  problems++;
  log.fail(m);
};

run(async () => {
  const { flags } = parseFlags(process.argv.slice(2));
  const session = loadSession();
  const base = baseUrl(flags, session);
  console.log(`Obrigada demo: health check (${base})`);
  if (readEnvText() === null) {
    bad('apps/backend/.env is missing. Run: pnpm demo:env');
    return 1;
  }
  const env = backendEnv();

  log.step('Backend');
  const anon = client(base);
  let ready = null;
  try {
    ready = await anon.get('/health/ready');
  } catch (err) {
    bad(`${err.message}`);
  }
  if (ready) {
    const info = { ...(ready.body?.info ?? {}), ...(ready.body?.error ?? {}) };
    if (ready.ok) log.ok('Backend ready (GET /health/ready)');
    else bad(`Backend not ready: HTTP ${ready.status}`);
    for (const [name, s] of Object.entries(info)) {
      const state = s.configured === false ? 'not configured' : s.status;
      const line = `${name}: ${state}${s.message ? ` (${s.message})` : ''}`;
      if (s.status === 'up') log.info(line);
      else bad(line);
    }
  }

  log.step('Postgres');
  if (!env.DATABASE_URL) {
    bad('DATABASE_URL is not set: the family would vanish on every restart. Run pnpm demo:env');
  } else {
    await pgPing(env.DATABASE_URL).then(
      () => log.ok('Postgres answers SELECT 1'),
      (e) => bad(`Postgres: ${e.message}. Run pnpm demo:up`),
    );
  }

  log.step('Escalation engine (Temporal)');
  if (!env.TEMPORAL_ADDRESS) {
    liveGaps.push('Temporal (pnpm demo:up)');
    log.warn(
      'Not configured (TEMPORAL_ADDRESS unset). No calls: a night exit falls back to a ' +
        'family alert. Fine for a dry run, not for the live run.',
    );
  } else {
    const { host, port } = hostPort(env.TEMPORAL_ADDRESS, 7233);
    await temporalPing(`${host}:${port}`).then(
      () => log.ok(`Temporal serving at ${env.TEMPORAL_ADDRESS}`),
      (e) => bad(`Temporal at ${env.TEMPORAL_ADDRESS}: ${e.message}. Run pnpm demo:up`),
    );
  }

  log.step('Calls (Twilio)');
  const twilio = env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER;
  if (twilio) log.ok(`Twilio configured, calling from ${env.TWILIO_FROM_NUMBER}`);
  else {
    liveGaps.push('Twilio credentials in apps/backend/.env');
    log.warn('Twilio not configured: the mock logs each call and text; no phone rings.');
  }
  if (env.PUBLIC_BASE_URL) {
    log.info(`PUBLIC_BASE_URL=${env.PUBLIC_BASE_URL}`);
    const live = await fetch(`${env.PUBLIC_BASE_URL.replace(/\/+$/, '')}/health/live`, {
      signal: AbortSignal.timeout(8000),
    })
      .then((r) => r.ok)
      .catch(() => false);
    if (live) log.ok('Reachable through the tunnel from this PC (Twilio needs it from outside).');
    else bad('Not reachable. Is cloudflared/ngrok still running with that exact host?');
    log.info('A new tunnel host means: update PUBLIC_BASE_URL and restart the backend.');
  } else if (twilio) {
    log.warn('PUBLIC_BASE_URL unset: calls are one-way, no press 1. See windows-quickstart.md.');
  }

  log.step('AI provider');
  const provider = env.AI_PROVIDER ?? (env.ANTHROPIC_API_KEY ? 'anthropic' : 'mock');
  if (provider === 'bedrock') {
    if (!env.BEDROCK_MODEL_ID)
      bad('AI_PROVIDER=bedrock but BEDROCK_MODEL_ID is unset (falls back to mock).');
    else log.ok(`Bedrock ${env.BEDROCK_MODEL_ID} in ${env.BEDROCK_REGION ?? 'eu-central-1'}`);
    if (!process.env.AWS_PROFILE && !process.env.AWS_ACCESS_KEY_ID) {
      log.warn('No AWS_PROFILE or AWS_ACCESS_KEY_ID in this shell; the backend shell needs them.');
    }
  } else {
    log.info(
      `${provider}${provider === 'mock' ? ' (deterministic local mock; do not caption as Bedrock)' : ''}`,
    );
  }

  log.step('Family');
  if (!session?.token) {
    bad('Not seeded yet. Run: pnpm demo:seed');
    return 1;
  }
  const api = client(base, session.token);
  const me = await api.get('/auth/me').catch(() => null);
  if (!me?.ok) {
    bad('The saved session no longer works. Run: pnpm demo:seed');
    return 1;
  }
  log.ok(
    `Signed in as ${me.body.user.email}, family ${me.body.family.name} (${me.body.family.id})`,
  );
  if (env.RING_FAMILY_ID !== me.body.family.id)
    bad('RING_FAMILY_ID in .env is not this family. Run pnpm demo:seed');
  const [family, contacts, visits, meds] = await Promise.all(
    ['/me/family', '/me/contacts', '/me/visits', '/me/medications'].map((r) => api.get(r)),
  );
  log.info(
    `timezone ${family.body.timezone}, check-in language ${family.body.checkinLanguage}, ` +
      `looking after ${family.body.elderName ?? '(no name set)'}` +
      (family.body.elderRelation ? ` (${family.body.elderRelation})` : ''),
  );
  const names = contacts.body.map(
    (c) =>
      `${c.name}${c.phone ? (isFictional(c.phone) ? ' (fictional phone)' : '') : ' (no phone)'}`,
  );
  if (contacts.body.length >= 3) log.ok(`Contacts: ${names.join(', ')}`);
  else bad(`Only ${contacts.body.length} contacts. Run pnpm demo:seed`);
  if (twilio && contacts.body.some((c) => !c.phone || isFictional(c.phone))) {
    bad(
      'Twilio is on but a contact has no real phone. pnpm demo:seed --sofia +351... --miguel ... --rosa ...',
    );
  }
  const now = Date.now();
  const open = visits.body.filter(
    (v) => Date.parse(v.startsAt) <= now && Date.parse(v.endsAt) >= now,
  );
  log.info(
    `Visits open now: ${open.map((v) => v.visitorLabel).join(', ') || 'none'}; medications: ${meds.body.map((m) => m.name).join(', ')}`,
  );

  log.step('Ring');
  const ring = await api.get('/me/ring/status');
  if (ring.ok) {
    log.info(
      `mode ${ring.body.mode}${ring.body.mode === 'off' ? ' (no Ring API token; the signed simulator still works)' : ''}`,
    );
    if (ring.body.webhooks) log.ok('Webhooks on for this family');
    else bad('Webhooks off for this family: restart the backend after pnpm demo:seed');
    const cam = planCamera(ring.body.cameras);
    if (cam.action === 'keep') log.ok(`Front-door camera: ${cam.camera.ringDeviceId}`);
    else bad('No camera at the front door. Run pnpm demo:seed');
  }

  log.step('Bee');
  const beeProbe = await anon.post('/bee/webhook', {}).catch(() => null);
  if (beeProbe?.status === 503)
    bad('Bee is off in the running backend. Restart after pnpm demo:seed');
  else if (beeProbe) {
    log.ok(
      `Bee webhook on (${env.BEE_API_TOKEN ? 'real Bee API' : 'mock Bee: demo-* ids return the GP note'})`,
    );
    log.info(
      `bee stream webhook: ${base}/bee/webhook?secret=<BEE_WEBHOOK_SECRET from apps/backend/.env>`,
    );
  }

  if (problems > 0) log.step(`${problems} thing(s) to fix above.`);
  else if (liveGaps.length) {
    log.step(`No errors: ready for a dry run. For phones to ring, add: ${liveGaps.join('; ')}.`);
  } else log.step('All set for the live run.');
  return problems === 0 ? 0 : 1;
});
