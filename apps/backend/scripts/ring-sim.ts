/**
 * Ring webhook simulator (decision 0011). Posts webhooks to the local backend signed
 * exactly like Ring (X-Signature: sha256=<hex HMAC-SHA256 of the raw body>) and labelled
 * X-Obrigada-Simulator: 1, so the UI can show them as simulated. Labels and ids only:
 * like real Ring traffic, nothing here carries a picture.
 *
 *   pnpm --filter @obrigada/backend ring:sim --scenario night-exit
 *   pnpm --filter @obrigada/backend ring:sim --scenario carer-arrival --camera ring-dev-front-1
 *
 * Options: --scenario <night-exit|carer-arrival|carer-no-show|daytime-motion>
 *          --url (default http://localhost:3000)  --secret (default $RING_HMAC_SECRET)
 *          --camera <Ring device id> (default ring-sim-front-door)  --at <ISO time>
 * Local times (03:04, 14:00) use this machine's time zone; set TZ to match the household,
 * e.g. TZ=Europe/Lisbon.
 */
import { randomUUID } from 'node:crypto';
import { signRingBody } from '../src/modules/ring/ring-signature';

const SCENARIOS = ['night-exit', 'carer-arrival', 'carer-no-show', 'daytime-motion'] as const;
type Scenario = (typeof SCENARIOS)[number];

interface Options {
  scenario: Scenario;
  url: string;
  secret: string;
  camera: string;
  at: string | null;
}

function usage(message?: string): never {
  if (message) console.error(`ring-sim: ${message}\n`);
  console.error(
    `Usage: ring:sim --scenario <${SCENARIOS.join('|')}> [--url URL] [--secret S] [--camera ID] [--at ISO]`,
  );
  process.exit(2);
}

function parseArgs(argv: string[]): Options {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') continue;
    if (!a.startsWith('--')) usage(`unexpected argument ${a}`);
    const [key, inline] = a.slice(2).split('=', 2) as [string, string | undefined];
    const value = inline ?? argv[++i];
    if (value === undefined) usage(`--${key} needs a value`);
    args[key] = value;
  }
  const scenario = args.scenario as Scenario | undefined;
  if (!scenario || !SCENARIOS.includes(scenario)) usage('pick a --scenario');
  const secret = args.secret ?? process.env.RING_HMAC_SECRET;
  if (!secret && scenario !== 'carer-no-show') usage('set --secret or RING_HMAC_SECRET');
  if (args.at && Number.isNaN(Date.parse(args.at))) usage('--at must be an ISO time');
  return {
    scenario,
    url: (args.url ?? 'http://localhost:3000').replace(/\/$/, ''),
    secret: secret ?? '',
    camera: args.camera ?? 'ring-sim-front-door',
    at: args.at ? new Date(args.at).toISOString() : null,
  };
}

/** The most recent past moment at hh:mm local time (today, or yesterday if still ahead). */
function lastLocal(hh: number, mm: number): string {
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1);
  return d.toISOString();
}

/** A Ring-style JSON:API notification, the same shape as fixtures/motion-human.jsonapi.json. */
function ringEvent(type: string, camera: string, occurredAt: string, subType?: string) {
  return {
    data: {
      id: `sim-${randomUUID()}`,
      type,
      attributes: { ...(subType ? { sub_type: subType } : {}), timestamp: occurredAt },
      relationships: { device: { data: { id: camera, type: 'devices' } } },
    },
  };
}

async function post(opts: Options, event: unknown): Promise<void> {
  const raw = JSON.stringify(event);
  const res = await fetch(`${opts.url}/ring/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-signature': signRingBody(raw, opts.secret),
      'x-obrigada-simulator': '1',
    },
    body: raw,
  });
  const text = await res.text();
  console.log(`POST /ring/webhook -> ${res.status} ${text}`);
  if (!res.ok) process.exitCode = 1;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  switch (opts.scenario) {
    case 'night-exit': {
      const at = opts.at ?? lastLocal(3, 4);
      console.log(`Front-door person detected at ${at} on camera ${opts.camera}.`);
      console.log('For a night-door alert the camera placement must be front_door.');
      await post(opts, ringEvent('motion_detected', opts.camera, at, 'human'));
      break;
    }
    case 'carer-arrival': {
      const at = opts.at ?? new Date().toISOString();
      console.log(`Doorbell pressed at ${at} on camera ${opts.camera}.`);
      console.log('Log an expected visit covering this time to see it count as an arrival.');
      await post(opts, ringEvent('button_press', opts.camera, at));
      break;
    }
    case 'carer-no-show':
      console.log('Nothing is sent: a no-show is the absence of a doorbell.');
      console.log('1. Log an expected visit that starts now (POST /me/visits).');
      console.log('2. Wait VISIT_ARRIVAL_GRACE_MINUTES (default 20, lower it for a demo).');
      console.log('3. The family gets a visit.no_show alert.');
      break;
    case 'daytime-motion': {
      const at = opts.at ?? lastLocal(14, 0);
      console.log(`Front-door person detected at ${at} (daytime; no night alert expected).`);
      await post(opts, ringEvent('motion_detected', opts.camera, at, 'human'));
      break;
    }
  }
}

main().catch((err: unknown) => {
  console.error(`ring-sim: ${(err as Error).message}`);
  console.error('Is the backend running, with RING_HMAC_SECRET and RING_FAMILY_ID set?');
  process.exit(1);
});
