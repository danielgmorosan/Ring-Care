import { generateKeyPairSync } from 'crypto';
import type { AppConfig } from '../../../config/env.validation';
import type { ContactMessageInput, EscalationContact } from '../temporal/types';
import { buildCriticalAlertMessage, FcmPushAdapter } from './fcm-push.adapter';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const config = {
  fcmProjectId: 'obrigada-proj',
  fcmClientEmail: 'sa@obrigada-proj.iam.gserviceaccount.com',
  fcmPrivateKey: privateKey,
} as unknown as AppConfig;

const daughter: EscalationContact = {
  id: 'c1',
  name: 'Ana',
  role: 'daughter',
  phone: '+351920000000',
  pushToken: 'device-token-abc',
  priority: 1,
  quietHours: null,
};

function input(over: Partial<EscalationContact> = {}): ContactMessageInput {
  return { incidentId: 'i1', contact: { ...daughter, ...over }, message: 'A fall at home.' };
}

describe('buildCriticalAlertMessage', () => {
  it('marks the alert critical so it sounds through silent/DND on iOS and Android', () => {
    const msg = buildCriticalAlertMessage('tok', 'A fall at home.') as {
      message: {
        token: string;
        notification: { body: string };
        android: { priority: string };
        apns: { payload: { aps: { 'interruption-level': string; sound: { critical: number } } } };
      };
    };
    expect(msg.message.token).toBe('tok');
    expect(msg.message.android.priority).toBe('HIGH');
    expect(msg.message.apns.payload.aps['interruption-level']).toBe('critical');
    expect(msg.message.apns.payload.aps.sound.critical).toBe(1);
    expect(msg.message.notification.body).toBe('A fall at home.');
  });
});

describe('FcmPushAdapter', () => {
  let adapter: FcmPushAdapter;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    adapter = new FcmPushAdapter(config);
    fetchMock = jest.fn().mockImplementation((url: string) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ access_token: 'ya29.test', expires_in: 3600 }),
        } as Response);
      }
      return Promise.resolve({ ok: true, text: async () => '' } as Response);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('gets an access token, then sends the critical alert to the device', async () => {
    await adapter.pushCriticalAlert(input());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]!;
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token');
    expect(tokenInit.body).toContain(
      'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer',
    );

    const [sendUrl, sendInit] = fetchMock.mock.calls[1]!;
    expect(sendUrl).toBe('https://fcm.googleapis.com/v1/projects/obrigada-proj/messages:send');
    expect(sendInit.headers.authorization).toBe('Bearer ya29.test');
    const sent = JSON.parse(sendInit.body as string);
    expect(sent.message.token).toBe('device-token-abc');
  });

  it('reuses the cached access token across sends', async () => {
    await adapter.pushCriticalAlert(input());
    await adapter.pushCriticalAlert(input());
    // 1 token exchange + 2 sends = 3, not 4 (token cached).
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('sends to a raw device token (caregiver app device)', async () => {
    await adapter.pushToDevice({ incidentId: 'i1', token: 'raw-device-token', message: 'A fall.' });

    const [, sendInit] = fetchMock.mock.calls[1]!;
    const sent = JSON.parse(sendInit.body as string);
    expect(sent.message.token).toBe('raw-device-token');
    expect(sent.message.apns.payload.aps['interruption-level']).toBe('critical');
  });

  it('does nothing when the contact has no device token', async () => {
    await adapter.pushCriticalAlert(input({ pushToken: null }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when FCM rejects the send, so the activity retries', async () => {
    fetchMock.mockImplementation((url: string) =>
      url === 'https://oauth2.googleapis.com/token'
        ? Promise.resolve({ ok: true, json: async () => ({ access_token: 't', expires_in: 3600 }) })
        : Promise.resolve({ ok: false, status: 404, text: async () => 'not found' }),
    );
    await expect(adapter.pushCriticalAlert(input())).rejects.toThrow(/FCM send failed \(404\)/);
  });
});
