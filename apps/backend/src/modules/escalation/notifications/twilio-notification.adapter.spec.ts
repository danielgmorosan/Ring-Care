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
});
