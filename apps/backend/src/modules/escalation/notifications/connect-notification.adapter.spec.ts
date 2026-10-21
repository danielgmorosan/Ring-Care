import {
  StartOutboundVoiceContactCommand,
  type StartOutboundVoiceContactCommandOutput,
} from '@aws-sdk/client-connect';
import { SendTextMessageCommand } from '@aws-sdk/client-pinpoint-sms-voice-v2';
import { appConfigFor } from '../../ai/testing/ai-test-helpers';
import type { EscalationContact, PlaceCallInput } from '../temporal/types';
import { GENERIC_CALL_MESSAGE, PRESS_ONE_PROMPT, buildConfirmCallTwiml } from './call-confirmation';
import type { ConnectConfirmationPoller } from './connect-confirmation.poller';
import { ConnectNotificationAdapter } from './connect-notification.adapter';
import type { ConnectSender, SmsSender } from './connect.client';
import { speechSafe } from './connect.client';
import type { NotificationPort } from './notification.port';

const CONNECT_ENV = {
  CALL_PROVIDER: 'connect',
  CONNECT_INSTANCE_ID: '11111111-2222-4333-8444-555555555555',
  CONNECT_CONTACT_FLOW_ID: '66666666-7777-4888-9999-000000000000',
  CONNECT_SOURCE_PHONE_NUMBER: '+4930123456',
};

const miguel: EscalationContact = {
  id: 'contact-miguel',
  name: 'Miguel',
  role: 'son',
  phone: '+351910000001',
  pushToken: null,
  priority: 1,
  quietHours: null,
};

const DOOR_CALL = 'This is Obrigada. Maria went out the front door at 3:04.';

/** Records every command; replies come from `reply`. */
class StubConnect implements ConnectSender {
  readonly commands: unknown[] = [];
  reply: (command: unknown) => Promise<unknown> = async () => ({ ContactId: 'connect-contact-1' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async send(command: unknown): Promise<any> {
    this.commands.push(command);
    return this.reply(command);
  }
}

class StubSms implements SmsSender {
  readonly commands: SendTextMessageCommand[] = [];
  fail: Error | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async send(command: SendTextMessageCommand): Promise<any> {
    this.commands.push(command);
    if (this.fail) throw this.fail;
    return { MessageId: 'm-1' };
  }
}

function awsError(name: string, status: number, message = 'details with +351910000001'): Error {
  return Object.assign(new Error(message), { name, $metadata: { httpStatusCode: status } });
}

function setup(opts: { env?: Record<string, string>; fallback?: boolean; sms?: boolean } = {}) {
  const config = appConfigFor({ ...CONNECT_ENV, ...(opts.env ?? {}) });
  const client = new StubConnect();
  const sms = new StubSms();
  const poller = { watch: jest.fn() } as unknown as ConnectConfirmationPoller & {
    watch: jest.Mock;
  };
  const fallback = opts.fallback
    ? ({
        placeCall: jest.fn().mockResolvedValue({ answered: false, awaitsConfirmation: true }),
        sendSms: jest.fn().mockResolvedValue(undefined),
      } as unknown as NotificationPort & { placeCall: jest.Mock; sendSms: jest.Mock })
    : null;
  const adapter = new ConnectNotificationAdapter(
    client,
    opts.sms ? sms : null,
    config,
    poller,
    fallback,
  );
  return { adapter, client, sms, poller, fallback };
}

const call = (over: Partial<PlaceCallInput> = {}): PlaceCallInput => ({
  incidentId: 'inc-1',
  contact: miguel,
  ringSeconds: 45,
  message: DOOR_CALL,
  ...over,
});

describe('ConnectNotificationAdapter.placeCall', () => {
  it('starts an outbound voice contact into the flow with the call text as an attribute', async () => {
    const { adapter, client } = setup();
    const result = await adapter.placeCall(call());

    expect(result).toEqual({ answered: false, awaitsConfirmation: true });
    expect(client.commands).toHaveLength(1);
    const command = client.commands[0] as StartOutboundVoiceContactCommand;
    expect(command).toBeInstanceOf(StartOutboundVoiceContactCommand);
    expect(command.input).toEqual({
      InstanceId: CONNECT_ENV.CONNECT_INSTANCE_ID,
      ContactFlowId: CONNECT_ENV.CONNECT_CONTACT_FLOW_ID,
      SourcePhoneNumber: CONNECT_ENV.CONNECT_SOURCE_PHONE_NUMBER,
      DestinationPhoneNumber: '+351910000001',
      ClientToken: 'inc-1:contact-miguel',
      RingTimeoutInSeconds: 45,
      Attributes: { message: DOOR_CALL, incidentId: 'inc-1', contactId: 'contact-miguel' },
    });
  });

  it('adds no name, role or phone beyond what the call text already says', async () => {
    const { adapter, client } = setup();
    await adapter.placeCall(call());
    const input = (client.commands[0] as StartOutboundVoiceContactCommand).input;
    expect(Object.keys(input.Attributes!).sort()).toEqual(['contactId', 'incidentId', 'message']);
    const attributes = JSON.stringify(input.Attributes);
    expect(attributes).not.toContain('Miguel');
    expect(attributes).not.toContain('son');
    expect(attributes).not.toContain('+351');
    // No CCP-visible name or description either.
    expect(input).not.toHaveProperty('Name');
    expect(input).not.toHaveProperty('Description');
  });

  it('speaks exactly what the Twilio call speaks: the same message, then the same prompt in the flow', async () => {
    const { adapter, client } = setup();
    await adapter.placeCall(call({ message: undefined }));
    const input = (client.commands[0] as StartOutboundVoiceContactCommand).input;
    expect(input.Attributes!.message).toBe(GENERIC_CALL_MESSAGE);
    // Twilio reads `${message} ${PRESS_ONE_PROMPT}`; the flow plays the message, then the prompt.
    expect(
      buildConfirmCallTwiml({ message: GENERIC_CALL_MESSAGE, actionUrl: 'https://x' }),
    ).toContain(`${GENERIC_CALL_MESSAGE} ${PRESS_ONE_PROMPT}`);
  });

  it('makes the call text safe for a speech prompt', async () => {
    const { adapter, client } = setup();
    await adapter.placeCall(call({ message: 'Door <speak> & "hall"\n at 3:04.' }));
    const input = (client.commands[0] as StartOutboundVoiceContactCommand).input;
    expect(input.Attributes!.message).toBe('Door speak and hall at 3:04.');
    expect(speechSafe('x'.repeat(2000)).length).toBeLessThanOrEqual(900);
  });

  it('clamps the ring timeout to the 15 to 60 seconds Connect accepts', async () => {
    const { adapter } = setup();
    expect(adapter.callRequest(call({ ringSeconds: 1 })).RingTimeoutInSeconds).toBe(15);
    expect(adapter.callRequest(call({ ringSeconds: 300 })).RingTimeoutInSeconds).toBe(60);
  });

  it('starts listening for press 1 on the returned contact for the ack window', async () => {
    const { adapter, poller } = setup();
    await adapter.placeCall(call());
    expect(poller.watch).toHaveBeenCalledWith({
      incidentId: 'inc-1',
      contactId: 'contact-miguel',
      connectContactId: 'connect-contact-1',
      windowSeconds: 45,
    });
  });

  it('a contact without a phone is not dialled', async () => {
    const { adapter, client, poller } = setup();
    expect(await adapter.placeCall(call({ contact: { ...miguel, phone: null } }))).toEqual({
      answered: false,
    });
    expect(client.commands).toEqual([]);
    expect(poller.watch).not.toHaveBeenCalled();
  });

  it.each([
    ['DestinationNotAllowedException', 403],
    ['ThrottlingException', 429],
    ['AccessDeniedException', 403],
    ['InternalServiceException', 500],
  ])(
    '%s never crashes the ladder: no confirmation is awaited and it moves on',
    async (name, status) => {
      const { adapter, client, poller } = setup();
      const errors = jest.spyOn(
        (adapter as unknown as { logger: { error: (m: string) => void } }).logger,
        'error',
      );
      client.reply = async () => {
        throw awsError(name, status);
      };
      await expect(adapter.placeCall(call())).resolves.toEqual({ answered: false });
      expect(poller.watch).not.toHaveBeenCalled();
      // Logged by AWS error name and status only: never the phone number in the message.
      const logged = errors.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).toContain(`${name} (${status})`);
      expect(logged).not.toContain('+351');
    },
  );

  it('falls back to Twilio when it is configured and Connect cannot place the call', async () => {
    const { adapter, client, fallback, poller } = setup({ fallback: true });
    client.reply = async () => {
      throw awsError('DestinationNotAllowedException', 403);
    };
    await expect(adapter.placeCall(call())).resolves.toEqual({
      answered: false,
      awaitsConfirmation: true,
    });
    expect(fallback!.placeCall).toHaveBeenCalledWith(call());
    expect(poller.watch).not.toHaveBeenCalled();
  });

  it('a reply without a ContactId is treated as a failed call', async () => {
    const { adapter, client, poller } = setup();
    client.reply = async () => ({}) as StartOutboundVoiceContactCommandOutput;
    await expect(adapter.placeCall(call())).resolves.toEqual({ answered: false });
    expect(poller.watch).not.toHaveBeenCalled();
  });
});

describe('ConnectNotificationAdapter.sendSms', () => {
  const sms = { incidentId: 'inc-1', contact: miguel, message: 'Nobody has confirmed yet.' };

  it('sends through AWS End User Messaging SMS when an origination identity is set', async () => {
    const t = setup({ env: { CONNECT_SMS_ORIGINATION: 'phone-abc' }, sms: true });
    await t.adapter.sendSms(sms);
    expect(t.sms.commands).toHaveLength(1);
    expect(t.sms.commands[0]!.input).toEqual({
      DestinationPhoneNumber: '+351910000001',
      OriginationIdentity: 'phone-abc',
      MessageBody: 'Nobody has confirmed yet.',
      MessageType: 'TRANSACTIONAL',
    });
  });

  it('without an origination identity, uses Twilio when configured', async () => {
    const t = setup({ fallback: true });
    await t.adapter.sendSms(sms);
    expect(t.fallback!.sendSms).toHaveBeenCalledWith(sms);
  });

  it('without either, skips the text (logged) and never fails the ladder', async () => {
    const t = setup();
    await expect(t.adapter.sendSms(sms)).resolves.toBeUndefined();
    expect(t.sms.commands).toEqual([]);
  });

  it('an AWS SMS failure is logged, then tries Twilio if it can, and never throws', async () => {
    const withFallback = setup({
      env: { CONNECT_SMS_ORIGINATION: 'phone-abc' },
      sms: true,
      fallback: true,
    });
    withFallback.sms.fail = awsError('ThrottlingException', 429);
    await expect(withFallback.adapter.sendSms(sms)).resolves.toBeUndefined();
    expect(withFallback.fallback!.sendSms).toHaveBeenCalledWith(sms);

    const alone = setup({ env: { CONNECT_SMS_ORIGINATION: 'phone-abc' }, sms: true });
    alone.sms.fail = awsError('ValidationException', 400);
    await expect(alone.adapter.sendSms(sms)).resolves.toBeUndefined();
  });
});
