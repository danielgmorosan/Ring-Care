import type { AppConfig } from '../../../config/env.validation';
import type { EscalationContact } from '../temporal/types';
import { TwilioNotificationAdapter } from './twilio-notification.adapter';

const config = {
  twilioAccountSid: 'AC_test_sid',
  twilioAuthToken: 'secret_token',
  twilioFromNumber: '+351910000000',
  twilioApiBaseUrl: 'https://api.twilio.com',
} as unknown as AppConfig;

const daughter: EscalationContact = {
  id: 'c1',
  name: 'Ana',
  role: 'daughter',
  phone: '+351920000000',
  pushToken: null,
  priority: 1,
  quietHours: null,
};

function okResponse(): Response {
  return { ok: true, status: 201, text: async () => '', json: async () => ({}) } as Response;
}

describe('TwilioNotificationAdapter', () => {
  let adapter: TwilioNotificationAdapter;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    adapter = new TwilioNotificationAdapter(config);
    fetchMock = jest.fn().mockResolvedValue(okResponse());
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('sends an SMS as a Basic-authed form POST to the account Messages resource', async () => {
    await adapter.sendSms({ incidentId: 'i1', contact: daughter, message: 'Please check in.' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC_test_sid/Messages.json');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe(
      `Basic ${Buffer.from('AC_test_sid:secret_token').toString('base64')}`,
    );
    const body = new URLSearchParams(init.body as string);
    expect(body.get('To')).toBe('+351920000000');
    expect(body.get('From')).toBe('+351910000000');
    expect(body.get('Body')).toBe('Please check in.');
  });

  it('places a call to the Calls resource and reports not-answered (never assume pickup)', async () => {
    const result = await adapter.placeCall({
      incidentId: 'i1',
      contact: daughter,
      ringSeconds: 45,
    });

    expect(result).toEqual({ answered: false });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC_test_sid/Calls.json');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('To')).toBe('+351920000000');
    expect(body.get('Twiml')).toContain('Obrigada safety alert');
  });

  it('does not dial or throw when a contact has no phone number', async () => {
    const noPhone = { ...daughter, phone: null };
    await expect(
      adapter.sendSms({ incidentId: 'i1', contact: noPhone, message: 'hi' }),
    ).resolves.toBeUndefined();
    expect(
      await adapter.placeCall({ incidentId: 'i1', contact: noPhone, ringSeconds: 45 }),
    ).toEqual({ answered: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on a non-2xx Twilio response so the activity can retry delivery', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'auth failed',
    } as Response);

    await expect(
      adapter.sendSms({ incidentId: 'i1', contact: daughter, message: 'hi' }),
    ).rejects.toThrow(/Twilio Messages.json failed \(401\)/);
  });

  describe('with PUBLIC_BASE_URL (press 1 to confirm)', () => {
    const confirmConfig = {
      ...config,
      publicBaseUrl: 'https://obrigada.example',
      jwtSecret: 'jwt-secret',
      callbackSigningSecret: undefined,
    } as unknown as AppConfig;

    it('asks for a press 1, signs the callback link, and reports awaitsConfirmation', async () => {
      const confirming = new TwilioNotificationAdapter(confirmConfig);
      const result = await confirming.placeCall({
        incidentId: 'inc-1',
        contact: daughter,
        ringSeconds: 45,
        message: 'This is Obrigada. Someone was at the front door at 3:04.',
      });

      expect(result).toEqual({ answered: false, awaitsConfirmation: true });
      const body = new URLSearchParams(fetchMock.mock.calls[0]![1].body as string);
      const twiml = body.get('Twiml')!;
      expect(twiml).toContain('<Gather numDigits="1" timeout="10" method="POST" action="');
      expect(twiml).toContain(
        'This is Obrigada. Someone was at the front door at 3:04. Press 1 if you are handling this.',
      );
      const action = /action="([^"]+)"/.exec(twiml)![1]!.replace(/&amp;/g, '&');
      const url = new URL(action);
      expect(url.origin + url.pathname).toBe('https://obrigada.example/twilio/calls/confirm');
      expect(url.searchParams.get('incident')).toBe('inc-1');
      expect(url.searchParams.get('contact')).toBe('c1');
      expect(url.searchParams.get('token')).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(body.get('Timeout')).toBe('45');
    });

    it('keeps the generic falls text when no message is given', async () => {
      const confirming = new TwilioNotificationAdapter(confirmConfig);
      await confirming.placeCall({ incidentId: 'inc-1', contact: daughter, ringSeconds: 45 });
      const twiml = new URLSearchParams(fetchMock.mock.calls[0]![1].body as string).get('Twiml')!;
      expect(twiml).toContain('Obrigada safety alert');
      expect(twiml).toContain('Press 1 if you are handling this.');
    });

    it('without PUBLIC_BASE_URL a message is still spoken, one-way, and nothing is awaited', async () => {
      const result = await adapter.placeCall({
        incidentId: 'i1',
        contact: daughter,
        ringSeconds: 45,
        message: 'Tom & Jerry <at> the door',
      });
      expect(result).toEqual({ answered: false });
      const twiml = new URLSearchParams(fetchMock.mock.calls[0]![1].body as string).get('Twiml')!;
      expect(twiml).toBe(
        '<Response><Say voice="alice">Tom &amp; Jerry &lt;at&gt; the door</Say></Response>',
      );
    });
  });
});
