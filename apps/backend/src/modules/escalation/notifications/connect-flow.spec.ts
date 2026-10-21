import { readFileSync } from 'fs';
import { join } from 'path';
import { CONFIRMED_REPLY, NO_INPUT_REPLY, PRESS_ONE_PROMPT } from './call-confirmation';
import { CONFIRMED_ATTRIBUTE } from './connect.client';

/**
 * The importable Amazon Connect flow (docs/hackathon/amazon-connect/obrigada-family-call.json)
 * against the flow language rules we could verify in the AWS docs, and against the backend:
 * it must read the attribute the adapter sends and set the one the poller reads.
 */
const FLOW_PATH = join(
  __dirname,
  '../../../../../../docs/hackathon/amazon-connect/obrigada-family-call.json',
);

interface Action {
  Identifier: string;
  Type: string;
  Parameters: Record<string, unknown>;
  Transitions: {
    NextAction?: string;
    Errors?: Array<{ NextAction: string; ErrorType: string }>;
    Conditions?: Array<{ NextAction: string; Condition: { Operator: string; Operands: string[] } }>;
  };
}
const flow = JSON.parse(readFileSync(FLOW_PATH, 'utf8')) as {
  Version: string;
  StartAction: string;
  Actions: Action[];
};
const byId = new Map(flow.Actions.map((a) => [a.Identifier, a]));
const ofType = (type: string) => flow.Actions.filter((a) => a.Type === type);

describe('Amazon Connect family call flow', () => {
  it('uses flow language 2019-10-30 and starts by setting the voice', () => {
    expect(flow.Version).toBe('2019-10-30');
    expect(byId.get(flow.StartAction)?.Type).toBe('UpdateContactTextToSpeechVoice');
  });

  it('has unique, valid identifiers and every transition resolves', () => {
    expect(byId.size).toBe(flow.Actions.length);
    for (const a of flow.Actions) {
      expect(a.Identifier.length).toBeLessThanOrEqual(50);
      expect(a.Identifier).not.toMatch(/[%:()\\/=$,;[\]{}]/);
      const t = a.Transitions;
      const targets = [
        t.NextAction,
        ...(t.Errors ?? []).map((e) => e.NextAction),
        ...(t.Conditions ?? []).map((c) => c.NextAction),
      ].filter(Boolean);
      for (const next of targets) expect(byId.has(next!)).toBe(true);
    }
    // Disconnect terminates: its Transitions must be an empty object.
    for (const d of ofType('DisconnectParticipant')) expect(d.Transitions).toEqual({});
  });

  it('reads the call text from the attribute the adapter sends', () => {
    const texts = ofType('MessageParticipant').map((a) => a.Parameters.Text);
    expect(texts.filter((t) => t === '$.Attributes.message')).toHaveLength(2);
  });

  it('asks for one DTMF key with the same prompt as the Twilio call, twice at most', () => {
    const asks = ofType('GetParticipantInput');
    expect(asks).toHaveLength(2);
    for (const ask of asks) {
      expect(ask.Parameters).toEqual({
        Text: PRESS_ONE_PROMPT,
        StoreInput: 'False',
        InputTimeLimitSeconds: '8',
      });
      // Without StoreInput, only Equals on a single static key is allowed.
      expect(ask.Transitions.Conditions).toEqual([
        {
          NextAction: 'set-confirmed',
          Condition: { Operator: 'Equals', Operands: ['1'] },
        },
      ]);
      expect((ask.Transitions.Errors ?? []).map((e) => e.ErrorType).sort()).toEqual([
        'InputTimeLimitExceeded',
        'NoMatchingCondition',
        'NoMatchingError',
      ]);
    }
  });

  it('a press 1 sets the attribute the poller reads, then thanks the caller', () => {
    const set = byId.get('set-confirmed')!;
    expect(set.Type).toBe('UpdateContactAttributes');
    expect(set.Parameters).toEqual({
      Attributes: { [CONFIRMED_ATTRIBUTE]: '1' },
      TargetContact: 'Current',
    });
    expect(byId.get(set.Transitions.NextAction!)!.Parameters.Text).toBe(CONFIRMED_REPLY);
  });

  it('no key after two tries says goodbye like the Twilio call', () => {
    const second = byId.get('ask-press-1-again')!;
    const goodbye = byId.get(second.Transitions.NextAction!)!;
    expect(goodbye.Parameters.Text).toBe(NO_INPUT_REPLY);
  });

  it('every spoken line keeps the brand voice: no em dashes, no shouting', () => {
    for (const a of ofType('MessageParticipant').concat(ofType('GetParticipantInput'))) {
      const text = String(a.Parameters.Text);
      expect(text).not.toMatch(/—|!!|[A-Z]{5,}/);
    }
  });
});
