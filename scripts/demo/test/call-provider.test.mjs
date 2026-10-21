import assert from 'node:assert/strict';
import test from 'node:test';
import { callProviderOf } from '../lib/call-provider.mjs';

const CONNECT = {
  CONNECT_INSTANCE_ID: 'i-1',
  CONNECT_CONTACT_FLOW_ID: 'f-1',
  CONNECT_SOURCE_PHONE_NUMBER: '+4930123456',
};
const TWILIO = {
  TWILIO_ACCOUNT_SID: 'AC1',
  TWILIO_AUTH_TOKEN: 't',
  TWILIO_FROM_NUMBER: '+351910000000',
};

test('provider selection mirrors the backend', () => {
  const cases = [
    [{}, 'mock'],
    [TWILIO, 'twilio'],
    [CONNECT, 'mock'],
    [{ ...CONNECT, ...TWILIO }, 'twilio'],
    [{ CALL_PROVIDER: 'connect', ...CONNECT }, 'connect'],
    [{ CALL_PROVIDER: 'connect', ...CONNECT, ...TWILIO }, 'connect'],
    [{ CALL_PROVIDER: 'connect', ...TWILIO }, 'twilio'],
    [{ CALL_PROVIDER: 'twilio', ...CONNECT, ...TWILIO }, 'twilio'],
  ];
  for (const [env, expected] of cases) {
    assert.equal(callProviderOf(env).provider, expected, JSON.stringify(env));
  }
});

test('Connect: press 1 always, no tunnel needed; region defaults to Frankfurt', () => {
  const r = callProviderOf({ CALL_PROVIDER: 'connect', ...CONNECT });
  assert.equal(r.pressOne, true);
  assert.equal(r.region, 'eu-central-1');
  assert.deepEqual(r.problems, []);
  assert.equal(r.sms, 'none');
  assert.equal(callProviderOf({ CALL_PROVIDER: 'connect', ...CONNECT, ...TWILIO }).sms, 'twilio');
  assert.equal(
    callProviderOf({ CALL_PROVIDER: 'connect', ...CONNECT, CONNECT_SMS_ORIGINATION: 'p' }).sms,
    'aws',
  );
});

test('Twilio needs PUBLIC_BASE_URL for press 1', () => {
  assert.equal(callProviderOf(TWILIO).pressOne, false);
  assert.equal(callProviderOf({ ...TWILIO, PUBLIC_BASE_URL: 'https://x' }).pressOne, true);
});

test('names what is missing and what will stop the backend booting', () => {
  const partial = callProviderOf({ CALL_PROVIDER: 'connect', CONNECT_INSTANCE_ID: 'i' });
  assert.deepEqual(partial.missing, ['CONNECT_CONTACT_FLOW_ID', 'CONNECT_SOURCE_PHONE_NUMBER']);
  assert.match(partial.problems.join('\n'), /calls go through mock instead/);
  const us = callProviderOf({ CALL_PROVIDER: 'connect', ...CONNECT, CONNECT_REGION: 'us-east-1' });
  assert.match(us.problems.join('\n'), /not an EU region/);
  const bad = callProviderOf({ ...CONNECT, CONNECT_SOURCE_PHONE_NUMBER: '030 123' });
  assert.match(bad.problems.join('\n'), /E\.164/);
  assert.match(callProviderOf({ CALL_PROVIDER: 'vonage' }).problems.join('\n'), /not valid/);
  assert.match(callProviderOf({ CALL_PROVIDER: 'twilio' }).problems.join('\n'), /incomplete/);
});
