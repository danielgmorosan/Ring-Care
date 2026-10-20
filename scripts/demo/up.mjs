// pnpm demo:up: check prerequisites, start Postgres, Redis and Temporal in Docker, wait
// for them, run migrations. It does not start the backend: run `pnpm backend:dev` in its
// own terminal so its log stays visible.
//
// Dev-only escape hatch: DEMO_EXTERNAL_SERVICES=1 (or --external) skips Docker and Compose
// and uses whatever DATABASE_URL / TEMPORAL_ADDRESS in apps/backend/.env point at. For
// machines without Docker (CI sandboxes); not for the live run.
import {
  BACKEND_DIR,
  DEFAULT_BASE,
  DemoError,
  ROOT,
  backendEnv,
  backendRequire,
  log,
  parseFlags,
  run,
  spawnCapture,
  spawnInherit,
} from './lib/common.mjs';
import { assertEnvIgnored, ensureEnv } from './lib/ensure-env.mjs';
import { hostPort, pgPing, tcpOpen, temporalPing, waitFor } from './lib/probes.mjs';

const SERVICES = [
  { name: 'postgres', container: 'obrigada-postgres', port: 5433, label: 'Postgres' },
  { name: 'redis', container: 'obrigada-redis', port: 6379, label: 'Redis' },
  { name: 'temporal', container: 'obrigada-temporal', port: 7233, label: 'Temporal' },
];

function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) {
    throw new DemoError(
      `Node ${process.versions.node} is too old. Install Node 22 LTS ` +
        '(Windows: winget install OpenJS.NodeJS.LTS), open a new terminal, try again.',
    );
  }
  log.ok(`Node ${process.versions.node}`);
  const agent = process.env.npm_config_user_agent ?? '';
  const pnpm = /pnpm\/(\d+)/.exec(agent);
  if (pnpm && Number(pnpm[1]) < 10) log.warn(`pnpm ${pnpm[1]} found; this repo expects pnpm 10.`);
}

async function checkDocker() {
  const res = await spawnCapture('docker', ['info', '--format', '{{.ServerVersion}}']);
  if (res.error?.code === 'ENOENT') {
    throw new DemoError(
      'Docker is not installed or not on PATH. Install Docker Desktop, start it, ' +
        'then open a new terminal.',
    );
  }
  if (res.code !== 0) {
    throw new DemoError(
      'Docker is installed but not running. Start Docker Desktop and wait until it says ' +
        '"Engine running", then run pnpm demo:up again.',
    );
  }
  log.ok(`Docker engine ${res.out.trim()}`);
}

async function runningContainers() {
  const res = await spawnCapture('docker', ['ps', '--format', '{{.Names}}']);
  return new Set(res.code === 0 ? res.out.split(/\r?\n/).map((s) => s.trim()) : []);
}

async function checkPorts({ external }) {
  const busy = [];
  if (!external) {
    const ours = await runningContainers();
    for (const s of SERVICES) {
      if (!(await tcpOpen('127.0.0.1', s.port))) continue;
      if (ours.has(s.container)) log.ok(`${s.label} is already running (port ${s.port})`);
      else busy.push(`${s.port} (${s.label})`);
    }
  }
  if (await tcpOpen('127.0.0.1', 3000)) {
    const live = await fetch(`${DEFAULT_BASE}/health/live`, { signal: AbortSignal.timeout(2000) })
      .then((r) => r.ok)
      .catch(() => false);
    if (live) log.warn('The backend is already running on port 3000. Restart it after this.');
    else busy.push('3000 (backend)');
  }
  if (busy.length) {
    throw new DemoError(
      `Port ${busy.join(', ')} is taken by another program. Close it ` +
        '(PowerShell: Get-NetTCPConnection -LocalPort <port> | Select OwningProcess, then ' +
        'Stop-Process -Id <pid>) and run pnpm demo:up again.',
    );
  }
  if (!external) log.ok('Ports 3000, 5433, 6379 and 7233 are free or ours');
}

async function waitPostgres(url) {
  if (!url) throw new DemoError('DATABASE_URL is not set in apps/backend/.env');
  process.stdout.write('       waiting for Postgres');
  const res = await waitFor(async () => {
    process.stdout.write('.');
    return pgPing(url);
  });
  process.stdout.write('\n');
  if (!res.ok) {
    throw new DemoError(
      `Postgres did not answer at ${url.replace(/:[^:@/]+@/, ':***@')} ` +
        `(${res.error?.message ?? 'timeout'}). Check: docker compose logs postgres`,
    );
  }
  log.ok('Postgres is accepting queries');
}

async function waitTemporal(address, { external }) {
  if (!address) {
    log.warn(
      'TEMPORAL_ADDRESS is not set: no escalation engine. A night exit falls back to a ' +
        'family alert with no calls.',
    );
    return;
  }
  process.stdout.write('       waiting for Temporal');
  const res = await waitFor(async () => {
    process.stdout.write('.');
    return temporalPing(address);
  });
  process.stdout.write('\n');
  if (res.ok) return log.ok(`Temporal is serving at ${address}`);
  const hint = external ? '' : ' Check: docker compose logs temporal';
  throw new DemoError(
    `Temporal did not answer at ${address}. The backend will not boot while ` +
      `TEMPORAL_ADDRESS points at it.${hint}`,
  );
}

async function migrate(url) {
  const bin = backendRequire.resolve('node-pg-migrate/bin/node-pg-migrate');
  const code = await spawnInherit(process.execPath, [bin, 'up', '--no-verbose'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: url },
  });
  if (code !== 0) throw new DemoError('Migrations failed (see the output above).');
  log.ok('Database migrated');
}

run(async () => {
  const { flags } = parseFlags(process.argv.slice(2));
  const external = Boolean(flags.external) || process.env.DEMO_EXTERNAL_SERVICES === '1';
  console.log('Obrigada demo: bring the stack up');

  log.step('1. Prerequisites');
  checkNode();
  await ensureEnv({ quiet: true });
  await assertEnvIgnored();
  if (external) {
    log.warn('DEMO_EXTERNAL_SERVICES=1: skipping Docker. Dev-only; not for the live run.');
  } else {
    await checkDocker();
  }
  await checkPorts({ external });

  const env = backendEnv();
  if (!external) {
    log.step('2. docker compose up -d postgres redis temporal');
    const code = await spawnInherit(
      'docker',
      ['compose', 'up', '-d', ...SERVICES.map((s) => s.name)],
      { cwd: ROOT },
    );
    if (code !== 0) throw new DemoError('docker compose failed (see the output above).');
  } else {
    log.step('2. Using external services from apps/backend/.env');
  }

  log.step('3. Waiting for the services');
  await waitPostgres(env.DATABASE_URL);
  await waitTemporal(env.TEMPORAL_ADDRESS, { external });
  if (env.REDIS_URL) {
    const { host, port } = hostPort(new URL(env.REDIS_URL).host, 6379);
    if (await tcpOpen(host === 'localhost' ? '127.0.0.1' : host, port)) log.ok('Redis is up');
    else log.warn(`Redis is not answering at ${env.REDIS_URL}; /health/ready will say so.`);
  }

  log.step('4. Migrations');
  await migrate(env.DATABASE_URL);

  log.step('Next, in a NEW terminal (keep it open, it shows the backend log):');
  log.info('pnpm backend:dev');
  log.info('Wait for "Obrigada backend listening", then back here:');
  log.info('pnpm demo:seed');
});
