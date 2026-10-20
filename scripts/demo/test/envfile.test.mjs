import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDemoEnv, INSECURE_JWT_DEFAULT } from '../lib/demo-env.mjs';
import { envValues, mergeEnv, parseEnv, setEnvValues } from '../lib/envfile.mjs';

const fixed = () => 'demo-fixed-secret-0123456789';

test('parseEnv sees active and commented keys; active wins', () => {
  const keys = parseEnv('A=1\n# B=2\n#C=3\n# just a comment\nexport D="four"\n# A=old\n');
  assert.equal(keys.get('A').value, '1');
  assert.equal(keys.get('A').commented, false);
  assert.equal(keys.get('B').commented, true);
  assert.equal(keys.get('C').commented, true);
  assert.equal(keys.get('D').value, 'four');
  assert.equal(keys.has('just'), false);
});

test('envValues strips quotes and inline comments, ignores commented keys', () => {
  assert.deepEqual(envValues("A='x y'\nB=z # note\n# C=1\nD=a#b\n"), {
    A: 'x y',
    B: 'z',
    D: 'a#b',
  });
});

test('mergeEnv never overwrites an existing value, active or commented', () => {
  const text = 'RING_HMAC_SECRET=mine\n# AI_PROVIDER=anthropic\n';
  const { text: out, added } = mergeEnv(
    text,
    [
      { key: 'RING_HMAC_SECRET', value: 'theirs' },
      { key: 'AI_PROVIDER', value: 'bedrock', commented: true },
      { key: 'VISIT_ARRIVAL_GRACE_MINUTES', value: '2', note: 'demo' },
    ],
    'header',
  );
  assert.deepEqual(added, [{ key: 'VISIT_ARRIVAL_GRACE_MINUTES', commented: false }]);
  assert.match(out, /^RING_HMAC_SECRET=mine$/m);
  assert.doesNotMatch(out, /theirs/);
  assert.match(out, /^# AI_PROVIDER=anthropic$/m);
  assert.match(out, /# header\n# demo\nVISIT_ARRIVAL_GRACE_MINUTES=2\n$/);
});

test('mergeEnv is a no-op the second time', () => {
  const entries = [
    { key: 'A', value: '1' },
    { key: 'B', value: '2', commented: true },
  ];
  const once = mergeEnv('', entries).text;
  const twice = mergeEnv(once, entries);
  assert.equal(twice.text, once);
  assert.deepEqual(twice.added, []);
});

test('mergeEnv keeps Windows line endings', () => {
  const { text } = mergeEnv('A=1\r\n', [{ key: 'B', value: '2' }]);
  assert.equal(text, 'A=1\r\n\r\nB=2\r\n');
});

test('setEnvValues rewrites in place, switches on a commented key, appends a missing one', () => {
  const text = 'RING_FAMILY_ID=old\n# BEE_FAMILY_ID=<seed>\nX=1\n';
  const r = setEnvValues(text, { RING_FAMILY_ID: 'new', BEE_FAMILY_ID: 'new', OTHER: 'v' });
  assert.equal(r.text, 'RING_FAMILY_ID=new\nBEE_FAMILY_ID=new\nX=1\nOTHER=v\n');
  assert.deepEqual(
    r.changed.map((c) => [c.key, c.from]),
    [
      ['RING_FAMILY_ID', 'old'],
      ['BEE_FAMILY_ID', null],
      ['OTHER', null],
    ],
  );
  assert.deepEqual(setEnvValues(r.text, { RING_FAMILY_ID: 'new' }).changed, []);
});

const EXAMPLE = [
  'JWT_SECRET=' + INSECURE_JWT_DEFAULT,
  'DATABASE_URL=postgres://obrigada:obrigada@localhost:5433/obrigada',
  'MQTT_URL=mqtts://localhost:8883',
  'MQTT_CA_PATH=../../certs/backend/ca.crt',
  'DEVICE_CA_KEY_PATH=../../certs/ca/ca.key',
  'TEMPORAL_ADDRESS=localhost:7233',
  '',
].join('\n');

test('a fresh demo .env: random JWT, no MQTT without certs, demo values, placeholders commented', () => {
  const r = buildDemoEnv({ existing: null, example: EXAMPLE, haveCerts: false, secret: fixed });
  const v = envValues(r.text);
  assert.equal(r.created, true);
  assert.equal(v.JWT_SECRET, fixed());
  assert.equal(v.MQTT_URL, undefined);
  assert.equal(v.DEVICE_CA_KEY_PATH, undefined);
  assert.equal(v.DATABASE_URL, 'postgres://obrigada:obrigada@localhost:5433/obrigada');
  assert.equal(v.TEMPORAL_ADDRESS, 'localhost:7233');
  assert.equal(v.REDIS_URL, 'redis://localhost:6379');
  assert.equal(v.VISIT_ARRIVAL_GRACE_MINUTES, '2');
  assert.ok(v.RING_HMAC_SECRET && v.BEE_WEBHOOK_SECRET.length >= 16);
  for (const k of [
    'AI_PROVIDER',
    'BEDROCK_MODEL_ID',
    'TWILIO_AUTH_TOKEN',
    'PUBLIC_BASE_URL',
    'RING_FAMILY_ID',
  ]) {
    assert.equal(v[k], undefined, `${k} must stay commented`);
    assert.match(r.text, new RegExp(`^# ${k}=`, 'm'));
  }
  assert.match(r.text, /^# AI_PROVIDER=bedrock$/m);
});

test('an existing .env keeps every value, including MQTT and its own JWT secret', () => {
  const existing =
    'JWT_SECRET=' + INSECURE_JWT_DEFAULT + '\nMQTT_URL=mqtts://x:8883\nRING_HMAC_SECRET=keep-me\n';
  const r = buildDemoEnv({ existing, example: EXAMPLE, haveCerts: false, secret: fixed });
  const v = envValues(r.text);
  assert.equal(r.created, false);
  assert.equal(v.JWT_SECRET, INSECURE_JWT_DEFAULT);
  assert.equal(v.MQTT_URL, 'mqtts://x:8883');
  assert.equal(v.RING_HMAC_SECRET, 'keep-me');
  assert.ok(r.text.startsWith(existing));
  assert.ok(!r.added.some((a) => a.key === 'RING_HMAC_SECRET' || a.key === 'JWT_SECRET'));
});

test('with dev certs a fresh .env keeps MQTT on', () => {
  const r = buildDemoEnv({ existing: null, example: EXAMPLE, haveCerts: true, secret: fixed });
  assert.equal(envValues(r.text).MQTT_URL, 'mqtts://localhost:8883');
});
