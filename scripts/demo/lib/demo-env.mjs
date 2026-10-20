// What `pnpm demo:env` writes. Kept apart from the command so the tests can build it.
import { randomBytes } from 'node:crypto';
import { commentOut, mergeEnv, replaceValueIf } from './envfile.mjs';

export const INSECURE_JWT_DEFAULT = 'dev-only-insecure-secret-change-in-prod';

/** A random local secret. Generated on the founder's machine, never in the repo. */
export function localSecret() {
  return `demo-${randomBytes(24).toString('base64url')}`;
}

/**
 * The demo values. Webhook secrets are random per machine: once the backend is behind a
 * public tunnel, a guessable secret would let anyone post a fake doorbell or Bee note.
 * Third-party credentials are commented placeholders only.
 */
export function demoEntries(secret = localSecret) {
  return [
    { key: 'JWT_SECRET', value: secret() },
    {
      key: 'DATABASE_URL',
      value: 'postgres://obrigada:obrigada@localhost:5433/obrigada',
      note: 'Matches docker-compose.yml (Postgres on host port 5433).',
    },
    { key: 'REDIS_URL', value: 'redis://localhost:6379' },
    { key: 'TEMPORAL_ADDRESS', value: 'localhost:7233' },
    {
      key: 'RING_HMAC_SECRET',
      value: secret(),
      note: 'Ring webhook signing secret. The simulator reads it from this file.',
    },
    {
      key: 'BEE_WEBHOOK_SECRET',
      value: secret(),
      note: 'Shared secret for bee stream -> POST /bee/webhook (16+ characters).',
    },
    {
      key: 'VISIT_ARRIVAL_GRACE_MINUTES',
      value: '2',
      note: 'Demo only: a no-show is reported 2 minutes after the visit starts, not 20.',
    },
    {
      key: 'RING_FAMILY_ID',
      value: '<written by pnpm demo:seed>',
      commented: true,
      note: 'RING_FAMILY_ID and BEE_FAMILY_ID are written by pnpm demo:seed.',
    },
    { key: 'BEE_FAMILY_ID', value: '<written by pnpm demo:seed>', commented: true },
    {
      key: 'AI_PROVIDER',
      value: 'bedrock',
      commented: true,
      note: 'Amazon Bedrock in Frankfurt (docs/hackathon/aws-bedrock.md). Unset = local mock.',
    },
    { key: 'BEDROCK_REGION', value: 'eu-central-1', commented: true },
    {
      key: 'BEDROCK_MODEL_ID',
      value: 'eu.<inference profile id from the Bedrock console>',
      commented: true,
    },
    {
      key: 'TWILIO_ACCOUNT_SID',
      value: 'AC<from the Twilio console>',
      commented: true,
      note: 'Real calls. Paste from the Twilio console; this file is gitignored, never commit it.',
    },
    { key: 'TWILIO_AUTH_TOKEN', value: '<from the Twilio console>', commented: true },
    { key: 'TWILIO_FROM_NUMBER', value: '+351<your Twilio number>', commented: true },
    {
      key: 'PUBLIC_BASE_URL',
      value: 'https://<your-tunnel-host>',
      commented: true,
      note: 'Press 1 on calls: the https host printed by cloudflared or ngrok. No path.',
    },
  ];
}

export const HEADER = 'Demo values added by pnpm demo:env. Local only: this file is gitignored.';

/**
 * Build the new .env text. `existing` is the current file or null. A fresh file starts
 * from .env.example: the insecure JWT default is replaced and, without dev certificates,
 * the MQTT and device CA lines are commented out (the backend reads those files at boot).
 */
export function buildDemoEnv({ existing, example, haveCerts, secret = localSecret }) {
  const notes = [];
  let text = existing;
  if (text === null) {
    text = example;
    const jwt = replaceValueIf(text, 'JWT_SECRET', INSECURE_JWT_DEFAULT, secret());
    text = jwt.text;
    if (jwt.replaced) notes.push('JWT_SECRET set to a random local value');
    if (!haveCerts) {
      const c = commentOut(
        text,
        ['MQTT_', 'DEVICE_CA_'],
        'Commented out by pnpm demo:env: no dev certificates in certs/ (scripts/gen-dev-certs.sh).',
      );
      text = c.text;
      if (c.commented.length) notes.push(`commented out ${c.commented.join(', ')} (no dev certs)`);
    }
  }
  const merged = mergeEnv(text, demoEntries(secret), HEADER);
  return { text: merged.text, added: merged.added, notes, created: existing === null };
}
