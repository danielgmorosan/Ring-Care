import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FICTIONAL_PHONES, isFictional, parsePhone } from '../lib/phone.mjs';

test('accepts E.164 and normalises what people type', () => {
  assert.deepEqual(parsePhone('+351912345678'), { ok: true, value: '+351912345678' });
  assert.equal(parsePhone(' +351 912 345 678 ').value, '+351912345678');
  assert.equal(parsePhone('00351-912-345-678').value, '+351912345678');
  assert.equal(parsePhone('+44 (0)7700.900001').value, '+447700900001'); // trunk (0) dropped
  assert.equal(parsePhone('+44 7700 900001').value, '+447700900001');
});

test('rejects numbers without a country code, too short, too long or with letters', () => {
  for (const bad of [
    '912345678',
    '+0351912345678',
    '+12345',
    '+3519123456789012',
    '+351 91X 345 678',
    '',
  ]) {
    const r = parsePhone(bad, "Sofia's phone");
    assert.equal(r.ok, false, bad);
    assert.match(r.error, /Sofia's phone/);
  }
  assert.match(parsePhone('912345678').error, /\+351912345678/);
  // What PowerShell passes for an unquoted +351...: digits only. Say how to quote it.
  assert.match(parsePhone('351912345678').error, /PowerShell, quote it/);
  assert.doesNotMatch(parsePhone('+351 91X').error, /PowerShell/);
});

test('fictional numbers are valid E.164 and recognised', () => {
  for (const p of Object.values(FICTIONAL_PHONES)) {
    assert.equal(parsePhone(p).ok, true);
    assert.equal(isFictional(p), true);
  }
  assert.equal(isFictional('+351912345678'), false);
});
