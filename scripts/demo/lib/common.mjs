// Shared plumbing for the demo commands: paths, output, flags, the .env file, the HTTP
// client and the saved session. Plain Node 22 (fetch, node:*), so the same commands run in
// PowerShell, cmd and bash. Child processes are always `node <script>` or `docker`, never a
// shell, so nothing depends on shell syntax.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { envValues } from './envfile.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const BACKEND_DIR = path.join(ROOT, 'apps', 'backend');
export const ENV_PATH = path.join(BACKEND_DIR, '.env');
export const ENV_EXAMPLE_PATH = path.join(BACKEND_DIR, '.env.example');
export const SESSION_DIR = path.join(ROOT, '.demo');
export const SESSION_PATH = path.join(SESSION_DIR, 'session.json');
export const DEFAULT_BASE = 'http://localhost:3000';

/** Resolve a package the backend depends on (pg, @temporalio/client, ts-node, ...). */
export const backendRequire = createRequire(path.join(BACKEND_DIR, 'package.json'));

// ASCII markers: PowerShell 5 consoles do not always render check marks.
export const log = {
  ok: (m) => console.log(`  [ok] ${m}`),
  warn: (m) => console.log(`  [!!] ${m}`),
  info: (m) => console.log(`       ${m}`),
  step: (m) => console.log(`\n${m}`),
  fail: (m) => console.log(`  [xx] ${m}`),
};

export class DemoError extends Error {}

/** Run a command's main(); print DemoError messages without a stack trace. */
export function run(main) {
  main().then(
    (code) => {
      if (typeof code === 'number') process.exitCode = code;
    },
    (err) => {
      if (err instanceof DemoError) {
        log.fail(err.message);
      } else {
        console.error(err);
      }
      process.exitCode = 1;
    },
  );
}

/** `--key value`, `--key=value` and bare `--flag`; everything else is positional. */
export function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') continue;
    if (!a.startsWith('--')) {
      positional.push(a);
      continue;
    }
    const [key, inline] = a.slice(2).split(/=(.*)/s, 2);
    if (inline !== undefined) flags[key] = inline;
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) flags[key] = argv[++i];
    else flags[key] = true;
  }
  return { flags, positional };
}

export function readEnvText() {
  return existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : null;
}

export function writeEnvText(text) {
  writeFileSync(ENV_PATH, text);
}

/** The backend's .env values, with this shell's environment taking precedence (as Nest does). */
export function backendEnv() {
  const text = readEnvText();
  const fromFile = text ? envValues(text) : {};
  const out = { ...fromFile };
  const backendKey =
    /^(DATABASE_URL|REDIS_URL|TEMPORAL_|TWILIO_|CALL_PROVIDER$|CONNECT_|PUBLIC_BASE_URL|AI_PROVIDER|BEDROCK_|ANTHROPIC_|RING_|BEE_|VISIT_|MQTT_|DEVICE_|PORT$)/;
  for (const [key, value] of Object.entries(process.env)) {
    if (value && backendKey.test(key)) out[key] = value;
  }
  return out;
}

export function loadSession() {
  try {
    return JSON.parse(readFileSync(SESSION_PATH, 'utf8'));
  } catch {
    return null;
  }
}

export function saveSession(session) {
  mkdirSync(SESSION_DIR, { recursive: true });
  // Belt and braces next to the root .gitignore entry: this folder holds a login token.
  writeFileSync(path.join(SESSION_DIR, '.gitignore'), '*\n');
  writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2) + '\n');
}

export function baseUrl(flags, session) {
  const raw = flags.base ?? process.env.DEMO_BASE ?? session?.base ?? DEFAULT_BASE;
  return String(raw).replace(/\/+$/, '');
}

/** A tiny JSON client. Never throws on HTTP status; throws a friendly error when down. */
export function client(base, token) {
  async function call(method, route, body) {
    let res;
    try {
      res = await fetch(`${base}${route}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new DemoError(
        `The backend is not reachable at ${base} (${err.cause?.code ?? err.message}). ` +
          'Start it in its own terminal with: pnpm backend:dev',
      );
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, ok: res.ok, body: json };
  }
  return {
    base,
    token,
    get: (r) => call('GET', r),
    post: (r, b) => call('POST', r, b ?? {}),
    patch: (r, b) => call('PATCH', r, b),
  };
}

/** Throw a readable error for a non-2xx response. */
export function expectOk(res, what) {
  if (res.ok) return res.body;
  const msg = Array.isArray(res.body?.message) ? res.body.message.join('; ') : res.body?.message;
  throw new DemoError(`${what} failed: HTTP ${res.status}${msg ? ` (${msg})` : ''}`);
}

/**
 * The saved session's client, after checking the token still works. Commands other than
 * seed use this; seed is what creates the session.
 */
export async function sessionClient(flags) {
  const session = loadSession();
  const base = baseUrl(flags, session);
  if (!session?.token) {
    throw new DemoError('No demo session yet. Run: pnpm demo:seed');
  }
  const api = client(base, session.token);
  const me = await api.get('/auth/me');
  if (me.status === 401) {
    throw new DemoError('The saved session has expired. Run: pnpm demo:seed (it logs in again)');
  }
  expectOk(me, 'GET /auth/me');
  return { api, session, me: me.body };
}

/** Run a child process with inherited output. Resolves with the exit code. */
export function spawnInherit(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

/** Run a child process and capture its output. */
export function spawnCapture(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    } catch (err) {
      resolve({ code: -1, out: '', error: err });
      return;
    }
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', (error) => resolve({ code: -1, out, error }));
    child.on('exit', (code) => resolve({ code: code ?? 1, out }));
  });
}

/**
 * The Ring simulator (apps/backend/scripts/ring-sim.ts), run through ts-node exactly like
 * `pnpm --filter @obrigada/backend ring:sim`, but with TZ and the secret set in code so
 * nothing depends on `TZ=... cmd` (bash) versus `$env:TZ=...` (PowerShell).
 */
export async function ringSim(args, { timeZone, secret }) {
  const tsNode = backendRequire.resolve('ts-node/dist/bin.js');
  const output = await spawnCapture(
    process.execPath,
    [tsNode, '--transpile-only', path.join('scripts', 'ring-sim.ts'), ...args],
    { cwd: BACKEND_DIR, env: { ...process.env, TZ: timeZone, RING_HMAC_SECRET: secret } },
  );
  for (const line of output.out.trim().split(/\r?\n/)) if (line) log.info(`ring-sim: ${line}`);
  return output;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
