import { createHmac } from 'crypto';
import {
  CONFIRM_CALLBACK_PATH,
  GENERIC_CALL_MESSAGE,
  buildConfirmCallTwiml,
  buildConfirmReplyTwiml,
  buildConfirmUrl,
  buildOneWayCallTwiml,
  deriveCallbackKey,
  escapeXml,
  signConfirmToken,
  twilioSignature,
  verifyConfirmToken,
  verifyTwilioSignature,
} from './call-confirmation';

const key = deriveCallbackKey({ jwtSecret: 'jwt-secret' });

describe('call TwiML', () => {
  it('keeps the original one-way call text byte for byte', () => {
    expect(buildOneWayCallTwiml()).toBe(
      '<Response><Say voice="alice">This is an Obrigada safety alert. ' +
        'Please open your Obrigada app to check on your family member.</Say></Response>',
    );
  });

  it('wraps the message and the press-1 prompt in a Gather that posts to the signed link', () => {
    const twiml = buildConfirmCallTwiml({
      message: 'This is Obrigada. Someone was at the front door at 3:04.',
      actionUrl: 'https://obrigada.example/twilio/calls/confirm?incident=i1&contact=c1',
    });
    expect(twiml).toBe(
      '<Response>' +
        '<Gather numDigits="1" timeout="10" method="POST" ' +
        'action="https://obrigada.example/twilio/calls/confirm?incident=i1&amp;contact=c1">' +
        '<Say voice="alice">This is Obrigada. Someone was at the front door at 3:04. ' +
        'Press 1 if you are handling this.</Say>' +
        '</Gather>' +
        '<Say voice="alice">We did not hear a response. We will keep trying the family. Goodbye.</Say>' +
        '<Hangup/>' +
        '</Response>',
    );
  });

  it('XML-escapes the message so no text can inject TwiML', () => {
    const twiml = buildConfirmCallTwiml({
      message: `Tom & "Jerry" <Dial>112</Dial> it's`,
      actionUrl: 'https://x.example/a',
    });
    expect(twiml).toContain(
      'Tom &amp; &quot;Jerry&quot; &lt;Dial&gt;112&lt;/Dial&gt; it&apos;s Press 1',
    );
    expect(twiml).not.toContain('<Dial>');
    expect(escapeXml('a&b<c>"d\'')).toBe('a&amp;b&lt;c&gt;&quot;d&apos;');
  });

  it('replies calmly to each outcome, and hangs up unless confirmed', () => {
    expect(buildConfirmReplyTwiml('confirmed')).toBe(
      '<Response><Say voice="alice">Thank you. We have let the family know you are handling it.</Say></Response>',
    );
    expect(buildConfirmReplyTwiml('other_digit')).toContain('<Hangup/>');
    expect(buildConfirmReplyTwiml('no_input')).toContain('We did not hear a response.');
    expect(buildConfirmReplyTwiml('closed')).toContain('already closed');
  });

  it('keeps the brand voice in every spoken line', () => {
    const lines = [
      GENERIC_CALL_MESSAGE,
      buildConfirmCallTwiml({ message: 'm', actionUrl: 'https://x.example/' }),
      ...(['confirmed', 'other_digit', 'no_input', 'closed'] as const).map(buildConfirmReplyTwiml),
    ];
    for (const line of lines) {
      expect(line).not.toMatch(/[—–!]/);
      expect(line).not.toMatch(/EMERGENCY|URGENT|IMMEDIATE/);
    }
  });
});

describe('signed confirmation links', () => {
  const exp = 2_000_000_000;

  it('builds the callback URL with incident, contact, expiry and token', () => {
    const url = new URL(
      buildConfirmUrl({
        publicBaseUrl: 'https://obrigada.example/',
        key,
        incidentId: 'inc-1',
        contactId: 'miguel',
        exp,
      }),
    );
    expect(url.origin + url.pathname).toBe(`https://obrigada.example${CONFIRM_CALLBACK_PATH}`);
    expect(url.searchParams.get('incident')).toBe('inc-1');
    expect(url.searchParams.get('contact')).toBe('miguel');
    expect(url.searchParams.get('token')).toBe(signConfirmToken(key, 'inc-1', 'miguel', exp));
  });

  const good = {
    incidentId: 'inc-1',
    contactId: 'miguel',
    exp: String(exp),
    token: signConfirmToken(key, 'inc-1', 'miguel', exp),
  };

  it('accepts a link it signed', () => {
    expect(verifyConfirmToken(key, good, exp - 10)).toBe('ok');
  });

  it('rejects a token moved to another contact or incident', () => {
    expect(verifyConfirmToken(key, { ...good, contactId: 'sofia' }, exp - 10)).toBe(
      'bad_signature',
    );
    expect(verifyConfirmToken(key, { ...good, incidentId: 'inc-2' }, exp - 10)).toBe(
      'bad_signature',
    );
  });

  it('rejects a token signed with another key, a tampered expiry, or an expired link', () => {
    const other = deriveCallbackKey({
      jwtSecret: 'x',
      callbackSigningSecret: 'another-secret-123',
    });
    expect(verifyConfirmToken(other, good, exp - 10)).toBe('bad_signature');
    expect(verifyConfirmToken(key, { ...good, exp: String(exp + 3600) }, exp - 10)).toBe(
      'bad_signature',
    );
    expect(verifyConfirmToken(key, good, exp + 1)).toBe('expired');
  });

  it('rejects missing or malformed fields', () => {
    expect(verifyConfirmToken(key, { ...good, token: undefined }, 0)).toBe('malformed');
    expect(verifyConfirmToken(key, { ...good, exp: 'soon' }, 0)).toBe('malformed');
  });

  it('derives a different key from CALLBACK_SIGNING_SECRET than from JWT_SECRET', () => {
    const withSecret = deriveCallbackKey({
      jwtSecret: 'jwt-secret',
      callbackSigningSecret: 'callback-secret-123',
    });
    expect(withSecret.equals(key)).toBe(false);
    // Never the raw JWT secret itself.
    expect(key.equals(Buffer.from('jwt-secret'))).toBe(false);
  });
});

describe('X-Twilio-Signature', () => {
  const token = 'twilio-auth-token';
  const url = 'https://obrigada.example/twilio/calls/confirm?incident=i1&contact=c1&exp=1&token=t';
  const params = { Digits: '1', CallSid: 'CA123', AccountSid: 'AC1', From: '+351910000001' };

  it('is base64 HMAC-SHA1 of the URL plus the sorted key+value params', () => {
    const expected = createHmac('sha1', token)
      .update(`${url}AccountSidAC1CallSidCA123Digits1From+351910000001`)
      .digest('base64');
    expect(twilioSignature(token, url, params)).toBe(expected);
    expect(verifyTwilioSignature(token, url, params, expected)).toBe(true);
  });

  it('rejects a missing signature, a changed digit, a changed URL, or another token', () => {
    const sig = twilioSignature(token, url, params);
    expect(verifyTwilioSignature(token, url, params, undefined)).toBe(false);
    expect(verifyTwilioSignature(token, url, { ...params, Digits: '2' }, sig)).toBe(false);
    expect(verifyTwilioSignature(token, `${url}x`, params, sig)).toBe(false);
    expect(verifyTwilioSignature('other', url, params, sig)).toBe(false);
  });
});
