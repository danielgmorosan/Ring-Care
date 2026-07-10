import assert from 'node:assert/strict';
import { test } from 'node:test';
import { systemPrompt } from './prompt.js';

test('speaks the household language, and never Brazilian Portuguese', () => {
  const pt = systemPrompt('pt-PT');
  assert.match(pt, /European Portuguese/);
  assert.match(pt, /never Brazilian/i);
  const en = systemPrompt('en');
  assert.match(en, /Speak only in English/);
  assert.notEqual(pt, en);
});

test('is written for speech: forbids markdown, lists, symbols, emoji', () => {
  const p = systemPrompt('en');
  assert.match(p, /never use lists/i);
  assert.match(p, /do not use markdown/i);
  assert.match(p, /emoji/i);
  assert.match(p, /in words/i); // numbers/times spoken, not "3:30"
});

test('holds the hard safety boundary: it never overrides the emergency system', () => {
  for (const language of ['en', 'pt-PT'] as const) {
    const p = systemPrompt(language);
    assert.match(p, /not the emergency system/i);
    assert.match(p, /getting help/i);
    assert.match(p, /probably fine/i); // instructed to NEVER say this
  }
});

test('refuses medical advice and dosages', () => {
  const p = systemPrompt('en');
  assert.match(p, /not give medical advice/i);
  assert.match(p, /how much medicine/i);
});

test('gives concrete example lines in the household language', () => {
  assert.match(systemPrompt('pt-PT'), /Vou avisar a sua filha/);
  assert.match(systemPrompt('en'), /let your daughter know/);
});
