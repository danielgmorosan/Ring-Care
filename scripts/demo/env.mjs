// pnpm demo:env: create or top up apps/backend/.env with the demo values.
// Never changes a value that is already there (commented-out keys count as "there").
import { ENV_PATH, log, run } from './lib/common.mjs';
import { assertEnvIgnored, ensureEnv } from './lib/ensure-env.mjs';

run(async () => {
  console.log('Obrigada demo: backend environment');
  await ensureEnv();
  await assertEnvIgnored();
  log.info(`File: ${ENV_PATH}`);
  log.info('Real Twilio, Bedrock and Bee credentials go in by hand. Never commit this file.');
  log.step('Next: pnpm demo:up');
});
