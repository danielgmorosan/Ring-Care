// pnpm demo:scene <night-exit|carer-arrival|carer-no-show|bee-note|ask|reset|status>
//
// Runs one scene of the video against the seeded household (pnpm demo:seed first), then
// says what the family app should show and follows the incident on GET /me/incidents.
// Time zones are handled in code: the household's zone comes from the backend.
import {
  DemoError,
  backendEnv,
  client,
  expectOk,
  log,
  parseFlags,
  ringSim,
  run,
  sessionClient,
  sleep,
} from './lib/common.mjs';
import { planCamera } from './lib/plan.mjs';
import { localClock, nowNight } from './lib/time.mjs';

const SCENES = [
  'night-exit',
  'carer-arrival',
  'carer-no-show',
  'bee-note',
  'ask',
  'reset',
  'status',
];
const HELP = `Usage: pnpm demo:scene <${SCENES.join('|')}>
  night-exit     Ring sees someone at the front door at 03:04: the family ladder starts
  carer-arrival  Anna rings the doorbell inside her expected visit
  carer-no-show  logs a visit Anna will miss and waits for the "hasn't arrived" alert
                 (--no-wait to return at once)
  bee-note       Sofia's Bee voice note after the GP visit (mock Bee: a demo-* id)
  ask            "How was Mom today?" (--question "..." for another)
  reset          gives every open incident an all-clear so the next take starts clean
  status         the latest incidents and alerts`;

const TERMINAL_LABEL = {
  active: 'still running',
  stood_down: 'stood down (all clear)',
  acknowledged: 'acknowledged (someone is handling it)',
  family_alerted: 'family alerted (everyone texted; no emergency call)',
  emergency_notified: 'emergency step reached',
};

function stepLine(s, tz) {
  const at = s.occurredAt ? localClock(Date.parse(s.occurredAt), tz) : '--:--';
  const who = s.contactName ? ` ${s.contactName}` : '';
  return `${at}  ${s.kind}${who}`;
}

async function incidents(api) {
  return expectOk(await api.get('/me/incidents'), 'GET /me/incidents');
}

async function alerts(api) {
  return expectOk(await api.get('/me/alerts'), 'GET /me/alerts');
}

/** Print the latest incidents and their outcome. */
async function printIncidentStatus(api, tz, limit = 3) {
  const list = await incidents(api);
  log.step('Incidents (GET /me/incidents, newest first):');
  if (list.length === 0) return log.info('none');
  for (const i of list.slice(0, limit)) {
    log.info(
      `${localClock(Date.parse(i.openedAt), tz)}  ${i.label}: ${TERMINAL_LABEL[i.outcome] ?? i.outcome}` +
        ` (${i.stepCount} steps)`,
    );
  }
}

/** Follow one incident's steps until it ends or the timeout passes. */
async function follow(api, id, tz, timeoutMs) {
  const seen = new Set();
  const deadline = Date.now() + timeoutMs;
  let detail;
  while (Date.now() < deadline) {
    detail = expectOk(await api.get(`/me/incidents/${id}`), 'GET /me/incidents/:id');
    for (const s of detail.steps) {
      if (seen.has(s.seq)) continue;
      seen.add(s.seq);
      log.info(stepLine(s, tz));
    }
    if (detail.outcome !== 'active') break;
    await sleep(1500);
  }
  return detail;
}

/** Wait for an incident that was not there before. */
async function newIncident(api, beforeIds, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = (await incidents(api)).find((i) => !beforeIds.has(i.id));
    if (found) return found;
    await sleep(1000);
  }
  return null;
}

async function context(flags) {
  const { api } = await sessionClient(flags);
  const family = expectOk(await api.get('/me/family'), 'GET /me/family');
  return { api, tz: family.timezone, env: backendEnv() };
}

async function requireRing(api) {
  const status = expectOk(await api.get('/me/ring/status'), 'GET /me/ring/status');
  if (!status.webhooks) {
    throw new DemoError(
      'Ring webhooks are off for this family in the running backend. Run pnpm demo:seed ' +
        'and restart the backend when it asks.',
    );
  }
  const cam = planCamera(status.cameras);
  if (cam.action !== 'keep') {
    throw new DemoError('No front-door camera yet. Run pnpm demo:seed (it creates and places it).');
  }
  return cam.camera;
}

async function ensureOpenVisit(api, tz) {
  const now = Date.now();
  const visits = expectOk(await api.get('/me/visits'), 'GET /me/visits');
  const open = visits.find(
    (v) =>
      v.visitorLabel === 'Anna' &&
      Date.parse(v.startsAt) - 15 * 60_000 <= now &&
      Date.parse(v.endsAt) >= now,
  );
  if (open) return open;
  const v = expectOk(
    await api.post('/me/visits', {
      visitorLabel: 'Anna',
      startsAt: new Date(now).toISOString(),
      endsAt: new Date(now + 3 * 3_600_000).toISOString(),
      notes: 'Carer visit',
    }),
    'Log the visit',
  );
  log.ok(`Logged Anna's visit ${localClock(now, tz)}-${localClock(Date.parse(v.endsAt), tz)}`);
  return v;
}

const scenes = {
  async 'night-exit'(flags) {
    const { api, tz, env } = await context(flags);
    if (!env.RING_HMAC_SECRET)
      throw new DemoError('RING_HMAC_SECRET is missing. Run pnpm demo:env');
    const camera = await requireRing(api);
    const before = await incidents(api);
    const running = before.find((i) => i.outcome === 'active');
    if (running) {
      log.warn(
        `An incident is still running (${running.label}). This event joins it instead of ` +
          'starting a new take. Run pnpm demo:scene reset first for a clean take.',
      );
    }
    const alertsBefore = new Set((await alerts(api)).map((a) => a.id));
    const at = new Date(nowNight(tz, Date.now())).toISOString();
    log.step(`Scene A: someone at the front door at ${localClock(Date.parse(at), tz)} (${tz})`);
    const sim = await ringSim(
      ['--scenario', 'night-exit', '--at', at, '--url', api.base, '--camera', camera.ringDeviceId],
      { timeZone: tz, secret: env.RING_HMAC_SECRET },
    );
    if (sim.code !== 0) throw new DemoError('The Ring simulator failed (see above).');

    const engine = Boolean(env.TEMPORAL_ADDRESS);
    const inc = running
      ? null
      : await newIncident(api, new Set(before.map((i) => i.id)), engine ? 10_000 : 4_000);
    if (inc) {
      log.ok(`Incident opened: ${inc.label}. Following the ladder:`);
      const detail = await follow(api, inc.id, tz, Number(flags.follow ?? 30) * 1000);
      if (detail.outcome === 'active') {
        log.info(
          'Still running: with Twilio and PUBLIC_BASE_URL each call waits 45 s for press 1.',
        );
        log.info('Follow it with: pnpm demo:scene status');
      }
    } else if (!running) {
      const fresh = (await alerts(api)).find(
        (a) => !alertsBefore.has(a.id) && a.kind === 'door.night_activity',
      );
      log.warn('No incident and no calls: the escalation engine (Temporal) is not running.');
      if (fresh) {
        log.info(`Obrigada fell back to a family alert instead: "${fresh.message}"`);
      } else {
        log.info(
          'No new alert either: a night door alert in the last 10 minutes already covers it.',
        );
      }
      log.info(
        engine
          ? 'TEMPORAL_ADDRESS is set but the backend could not start a workflow. Run pnpm demo:up, restart the backend.'
          : 'TEMPORAL_ADDRESS is not set. Fine for a dry run; for the live run use pnpm demo:up.',
      );
    }

    log.step('The family app should show:');
    if (inc || running) {
      log.info(
        'Timeline: "Front door at night", "Seen by Ring at the front door", each call, the outcome chip.',
      );
      log.info(
        'Calls: Sofia, then Miguel, then Rosa. Real phones ring only with Twilio configured.',
      );
    } else {
      log.info('Alerts: the night door alert above. The Timeline has no incident (no engine).');
    }
    log.info('Home > Open Ring: the activity row says Night door and Simulated.');
    await printIncidentStatus(api, tz);
  },

  async 'carer-arrival'(flags) {
    const { api, tz, env } = await context(flags);
    if (!env.RING_HMAC_SECRET)
      throw new DemoError('RING_HMAC_SECRET is missing. Run pnpm demo:env');
    const camera = await requireRing(api);
    await ensureOpenVisit(api, tz);
    const before = new Set(
      expectOk(await api.get('/me/visits/arrivals'), 'GET arrivals').map((a) => a.id),
    );
    log.step('Scene C: Anna rings the doorbell');
    const sim = await ringSim(
      ['--scenario', 'carer-arrival', '--url', api.base, '--camera', camera.ringDeviceId],
      { timeZone: tz, secret: env.RING_HMAC_SECRET },
    );
    if (sim.code !== 0) throw new DemoError('The Ring simulator failed (see above).');
    let arrival = null;
    for (let i = 0; i < 10 && !arrival; i++) {
      await sleep(600);
      arrival = expectOk(await api.get('/me/visits/arrivals'), 'GET arrivals').find(
        (a) => !before.has(a.id),
      );
    }
    if (arrival) log.ok(`Recorded: "${arrival.text}"`);
    else
      log.warn(
        'No new arrival. A visit already has its arrival, or the press fell outside every window.',
      );
    log.step('The family app should show:');
    log.info('Home > Open Ring: the doorbell row labelled Visit arrival.');
    log.info('No incident: activity during an expected visit never opens one.');
    await printIncidentStatus(api, tz);
  },

  async 'carer-no-show'(flags) {
    const { api, tz, env } = await context(flags);
    await requireRing(api);
    const now = Date.now();
    const visit = expectOk(
      await api.post('/me/visits', {
        visitorLabel: 'Anna',
        startsAt: new Date(now).toISOString(),
        endsAt: new Date(now + 3_600_000).toISOString(),
      }),
      'Log the visit',
    );
    const grace = Number(env.VISIT_ARRIVAL_GRACE_MINUTES ?? 20);
    log.step(`Scene C: Anna is expected at ${localClock(now, tz)} and will not come`);
    log.ok(
      `Visit logged. The alert is due ${grace} min after the start; the sweep runs every minute.`,
    );
    log.info("Send no doorbell now: it would count as this visit's arrival.");
    if (flags['no-wait']) {
      log.info('Not waiting (--no-wait). Check later with: pnpm demo:scene status');
    } else {
      process.stdout.write(`       waiting up to ${grace + 2} minutes`);
      const deadline = Date.now() + (grace + 2) * 60_000;
      let alert = null;
      while (!alert && Date.now() < deadline) {
        await sleep(10_000);
        process.stdout.write('.');
        alert = (await alerts(api)).find((a) => a.kind === 'visit.no_show' && a.ref === visit.id);
      }
      process.stdout.write('\n');
      if (alert) log.ok(`Alert: "${alert.message}"`);
      else
        log.warn('No alert yet. Is the backend running with RING_FAMILY_ID set? (pnpm demo:check)');
    }
    log.step('The family app should show:');
    log.info('Alerts: "Visit didn\'t happen" with the words above.');
    await printIncidentStatus(api, tz);
  },

  async 'bee-note'(flags) {
    const { api, tz, env } = await context(flags);
    if (!env.BEE_WEBHOOK_SECRET)
      throw new DemoError('BEE_WEBHOOK_SECRET is missing. Run pnpm demo:env');
    const before = new Set(
      expectOk(await api.get('/me/care/proposals?status=pending'), 'GET proposals').map(
        (p) => p.id,
      ),
    );
    const id = String(flags.id ?? `demo-${Date.now()}`);
    log.step(`Scene D: Sofia's Bee note after the GP visit (conversation ${id})`);
    // Anonymous, like `bee stream`: the controller prefers an Authorization header over
    // ?secret=, so the caregiver's JWT must not ride along.
    const res = await client(api.base).post(
      `/bee/webhook?secret=${encodeURIComponent(env.BEE_WEBHOOK_SECRET)}`,
      {
        event: 'new-conversation',
        data: { conversation: { id } },
      },
    );
    if (res.status === 503) {
      throw new DemoError(
        'Bee is off in the running backend. Run pnpm demo:seed and restart when it asks.',
      );
    }
    expectOk(res, 'POST /bee/webhook');
    log.ok(`POST /bee/webhook -> ${res.status}`);
    if (!env.BEE_API_TOKEN)
      log.info('Mock Bee (no BEE_API_TOKEN): demo-* ids return the GP-visit note.');
    let proposal = null;
    for (let i = 0; i < 20 && !proposal; i++) {
      await sleep(1000);
      proposal = expectOk(await api.get('/me/care/proposals?status=pending'), 'GET proposals').find(
        (p) => !before.has(p.id),
      );
    }
    if (!proposal) {
      log.warn('No proposal yet. Check the backend log for the Bee fetch or extraction.');
    } else {
      log.ok(`Proposal: ${proposal.summary}`);
      for (const item of proposal.items) log.info(`- ${item.kind}: ${item.title}`);
    }
    log.step('The family app should show:');
    log.info('Care tab: the proposals inbox with these items. Approve all, or pick some.');
    log.info('Nothing changes in the care plan until Sofia approves.');
    await printIncidentStatus(api, tz);
  },

  async ask(flags) {
    const { api, tz, env } = await context(flags);
    const question = String(flags.question ?? 'How was Mom today?');
    log.step(`Scene E: "${question}"`);
    const res = expectOk(await api.post('/me/ask', { question }), 'POST /me/ask');
    console.log(`\n${res.answer}\n`);
    const provider = env.AI_PROVIDER ?? (env.ANTHROPIC_API_KEY ? 'anthropic' : 'mock');
    if (provider === 'mock' || (provider === 'bedrock' && !env.BEDROCK_MODEL_ID)) {
      log.info(
        'Written by the local mock (it starts "Here is what I can tell you from the record").',
      );
      log.info('Do not caption it as Bedrock. See docs/hackathon/aws-bedrock.md.');
    } else {
      log.info(
        `AI provider: ${provider}. The backend log shows the call (bedrock converse ok ...).`,
      );
    }
    log.step('The family app should show:');
    log.info('Home: "A question about the home", Ask, then the same answer.');
    await printIncidentStatus(api, tz);
  },

  async reset(flags) {
    const { api, tz, env } = await context(flags);
    const open = (await incidents(api)).filter((i) => i.outcome === 'active');
    log.step('Reset: an all-clear for every open incident');
    if (open.length === 0) log.ok('No open incidents. The next take starts clean.');
    for (const i of open) {
      const ack = await api.post(`/incidents/${i.id}/acknowledge`);
      if (ack.status === 503) {
        throw new DemoError('The escalation engine is not running, so there is no ladder to stop.');
      }
      expectOk(ack, `Acknowledge ${i.id}`);
      expectOk(await api.post(`/incidents/${i.id}/resolve`), `Resolve ${i.id}`);
      const detail = await follow(api, i.id, tz, 15_000);
      if (detail.outcome === 'active')
        log.warn(`${i.label} is still closing; run reset again in a moment.`);
      else log.ok(`${i.label}: ${TERMINAL_LABEL[detail.outcome] ?? detail.outcome}`);
    }
    log.info('Nothing is deleted: incidents are append-only, the all-clear is on the trail.');
    if (!env.TEMPORAL_ADDRESS) {
      log.info('No engine: a night door alert de-duplicates for 10 minutes; wait that out.');
    }
    await printIncidentStatus(api, tz);
  },

  async status(flags) {
    const { api, tz } = await context(flags);
    await printIncidentStatus(api, tz, 5);
    const list = await alerts(api);
    log.step('Alerts (GET /me/alerts, newest first):');
    if (list.length === 0) log.info('none');
    for (const a of list.slice(0, 5))
      log.info(`${localClock(Date.parse(a.at), tz)}  ${a.kind}: ${a.message}`);
  },
};

run(async () => {
  const { flags, positional } = parseFlags(process.argv.slice(2));
  const name = positional[0];
  if (!name || flags.help || !scenes[name]) {
    console.log(HELP);
    return name && !flags.help ? 2 : 0;
  }
  await scenes[name](flags);
});
