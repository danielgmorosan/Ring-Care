// pnpm demo:env: create or top up apps/backend/.env with the demo values.
// Never changes a value that is already there (commented-out keys count as "there").
import { callProviderOf } from './lib/call-provider.mjs';
import { ENV_PATH, backendEnv, log, run } from './lib/common.mjs';
import { assertEnvIgnored, ensureEnv } from './lib/ensure-env.mjs';

run(async () => {
  console.log('Obrigada demo: backend environment');
  await ensureEnv();
  await assertEnvIgnored();
  log.info(`File: ${ENV_PATH}`);
  log.info(
    'Real Connect or Twilio, Bedrock and Bee settings go in by hand. Never commit this file.',
  );
  const calls = callProviderOf(backendEnv());
  log.info(`Calls: ${calls.provider}${calls.provider === 'mock' ? ' (no phone rings)' : ''}`);
  for (const p of calls.problems) log.warn(p);
  log.step('Next: pnpm demo:up');
});
