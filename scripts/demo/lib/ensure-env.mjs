// Write the demo values into apps/backend/.env (used by demo:env and demo:up).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DemoError,
  ENV_EXAMPLE_PATH,
  ENV_PATH,
  ROOT,
  log,
  readEnvText,
  spawnCapture,
  writeEnvText,
} from './common.mjs';
import { buildDemoEnv } from './demo-env.mjs';

export async function ensureEnv({ quiet = false } = {}) {
  const existing = readEnvText();
  const haveCerts = existsSync(path.join(ROOT, 'certs', 'backend', 'ca.crt'));
  const result = buildDemoEnv({
    existing,
    example: readFileSync(ENV_EXAMPLE_PATH, 'utf8'),
    haveCerts,
  });
  if (result.created || result.added.length) writeEnvText(result.text);
  if (result.created) log.ok('Created apps/backend/.env from .env.example');
  for (const n of result.notes) log.info(n);
  for (const a of result.added) {
    const hint = !a.commented
      ? ''
      : a.key.endsWith('_FAMILY_ID')
        ? ' (commented out; pnpm demo:seed fills it in)'
        : ' (commented out; fill in to use)';
    log.info(`added ${a.key}${hint}`);
  }
  if (!result.created && result.added.length === 0 && !quiet) {
    log.ok('apps/backend/.env already has every demo value. Nothing changed.');
  }
  return result;
}

/** Refuse to go on if git would pick up the .env (it holds local secrets). */
export async function assertEnvIgnored() {
  const res = await spawnCapture('git', ['check-ignore', '-q', ENV_PATH], { cwd: ROOT });
  if (res.code === 0) return log.ok('apps/backend/.env is gitignored');
  if (res.code === 1) {
    throw new DemoError('apps/backend/.env is NOT gitignored. Add ".env" to .gitignore first.');
  }
  log.warn('Could not ask git whether .env is ignored (is git installed?). It must be.');
}
