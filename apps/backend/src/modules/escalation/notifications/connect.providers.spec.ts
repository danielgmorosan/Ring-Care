import { ConnectClient } from '@aws-sdk/client-connect';
import { PinpointSMSVoiceV2Client } from '@aws-sdk/client-pinpoint-sms-voice-v2';
import { validateEnv } from '../../../config/env.validation';
import { appConfigFor } from '../../ai/testing/ai-test-helpers';
import { assertEuConnectRegion } from './connect.client';
import { createConnectClient, createSmsClient, selectComms } from './connect.providers';
import type { NotificationPort } from './notification.port';

const CONNECT = {
  CONNECT_INSTANCE_ID: '11111111-2222-4333-8444-555555555555',
  CONNECT_CONTACT_FLOW_ID: '66666666-7777-4888-9999-000000000000',
  CONNECT_SOURCE_PHONE_NUMBER: '+4930123456',
};
const TWILIO = {
  TWILIO_ACCOUNT_SID: 'AC1',
  TWILIO_AUTH_TOKEN: 'token',
  TWILIO_FROM_NUMBER: '+351910000000',
};

const adapters = {
  mock: { name: 'mock' } as unknown as NotificationPort,
  twilio: { name: 'twilio' } as unknown as NotificationPort,
  connect: { name: 'connect' } as unknown as NotificationPort,
};

// [case, env, expected provider]
const MATRIX: Array<[string, Record<string, string>, 'connect' | 'twilio' | 'mock']> = [
  ['nothing configured', {}, 'mock'],
  ['CALL_PROVIDER unset, Twilio configured (original behaviour)', TWILIO, 'twilio'],
  ['CALL_PROVIDER unset, only Connect configured: never auto-selected', CONNECT, 'mock'],
  ['CALL_PROVIDER unset, both configured: Twilio as today', { ...CONNECT, ...TWILIO }, 'twilio'],
  ['CALL_PROVIDER=connect, configured', { CALL_PROVIDER: 'connect', ...CONNECT }, 'connect'],
  [
    'CALL_PROVIDER=connect wins over Twilio',
    { CALL_PROVIDER: 'connect', ...CONNECT, ...TWILIO },
    'connect',
  ],
  [
    'CALL_PROVIDER=connect, flow id missing: falls back to Twilio',
    { CALL_PROVIDER: 'connect', ...CONNECT, CONNECT_CONTACT_FLOW_ID: '', ...TWILIO },
    'twilio',
  ],
  [
    'CALL_PROVIDER=connect, source number missing, no Twilio: mock',
    {
      CALL_PROVIDER: 'connect',
      CONNECT_INSTANCE_ID: CONNECT.CONNECT_INSTANCE_ID,
      CONNECT_CONTACT_FLOW_ID: CONNECT.CONNECT_CONTACT_FLOW_ID,
    },
    'mock',
  ],
  [
    'CALL_PROVIDER=twilio, configured',
    { CALL_PROVIDER: 'twilio', ...CONNECT, ...TWILIO },
    'twilio',
  ],
  ['CALL_PROVIDER=twilio, not configured', { CALL_PROVIDER: 'twilio', ...CONNECT }, 'mock'],
];

/** Empty strings stand for "unset" in the matrix. */
const clean = (env: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));

describe('call provider selection (decision 0014)', () => {
  it.each(MATRIX)('%s', (_case, env, expected) => {
    const config = appConfigFor(clean(env));
    expect(config.callProvider).toBe(expected);
    expect(selectComms(config, adapters)).toBe(adapters[expected]);
    // The Connect client exists exactly when Connect places the calls.
    const client = createConnectClient(config);
    if (expected === 'connect') expect(client).toBeInstanceOf(ConnectClient);
    else expect(client).toBeNull();
  });

  it('the SMS client exists only for Connect with an origination identity', () => {
    const withSms = appConfigFor({
      CALL_PROVIDER: 'connect',
      ...CONNECT,
      CONNECT_SMS_ORIGINATION: 'phone-abc',
    });
    expect(createSmsClient(withSms)).toBeInstanceOf(PinpointSMSVoiceV2Client);
    expect(createSmsClient(appConfigFor({ CALL_PROVIDER: 'connect', ...CONNECT }))).toBeNull();
    expect(
      createSmsClient(appConfigFor({ ...TWILIO, CONNECT_SMS_ORIGINATION: 'phone-abc' })),
    ).toBeNull();
  });

  it('defaults to Frankfurt', () => {
    expect(appConfigFor({}).connectRegion).toBe('eu-central-1');
  });
});

describe('Connect EU region guard (rule #6)', () => {
  it.each(['eu-central-1', 'eu-west-2', 'eu-south-2'])('accepts %s', (region) => {
    expect(() => assertEuConnectRegion(region)).not.toThrow();
    expect(
      createConnectClient(
        appConfigFor({ CALL_PROVIDER: 'connect', ...CONNECT, CONNECT_REGION: region }),
      ),
    ).toBeInstanceOf(ConnectClient);
  });

  it.each(['us-east-1', 'ap-southeast-2', 'il-central-1', 'europe-west1', 'eu'])(
    'refuses to boot with %s',
    (region) => {
      const config = appConfigFor({ CALL_PROVIDER: 'connect', ...CONNECT, CONNECT_REGION: region });
      expect(() => createConnectClient(config)).toThrow(/CONNECT_REGION must be an EU region/);
    },
  );

  it('refuses a non-EU region even before the rest of Connect is configured', () => {
    const config = appConfigFor({ CALL_PROVIDER: 'connect', CONNECT_REGION: 'us-west-2' });
    expect(() => createConnectClient(config)).toThrow(/EU region/);
  });

  it('does not care about CONNECT_REGION when Connect is not asked for', () => {
    expect(
      createConnectClient(appConfigFor({ ...CONNECT, CONNECT_REGION: 'us-east-1' })),
    ).toBeNull();
  });

  it('rejects a source number that is not E.164 at env validation', () => {
    expect(() => validateEnv({ CONNECT_SOURCE_PHONE_NUMBER: '030 123456' })).toThrow(
      /CONNECT_SOURCE_PHONE_NUMBER must be E.164/,
    );
    expect(() => validateEnv({ CALL_PROVIDER: 'vonage' })).toThrow(/CALL_PROVIDER/);
  });
});
