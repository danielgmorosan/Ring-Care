import type { INestApplication } from '@nestjs/common';
import type { NotificationPort } from '../src/modules/escalation/notifications/notification.port';

/**
 * Amazon Connect as the call provider (decision 0014), through the real app wiring: the
 * env selects Connect, the escalation ladder's NotificationPort dials through
 * StartOutboundVoiceContact (stubbed: no AWS from CI) and the press-1 poller starts; a
 * non-EU CONNECT_REGION refuses to boot (rule #6).
 */
const CONNECT_ENV = {
  CALL_PROVIDER: 'connect',
  CONNECT_INSTANCE_ID: '11111111-2222-4333-8444-555555555555',
  CONNECT_CONTACT_FLOW_ID: '66666666-7777-4888-9999-000000000000',
  CONNECT_SOURCE_PHONE_NUMBER: '+4930123456',
};

/** Load AppModule fresh, with `env` in process.env, so ConfigModule validates it. */
async function compileWith(env: Record<string, string>, stub?: unknown) {
  Object.assign(process.env, env);
  let modules!: {
    Test: typeof import('@nestjs/testing').Test;
    AppModule: typeof import('../src/app.module').AppModule;
    CONNECT_CLIENT: symbol;
    NOTIFICATION_PORT: symbol;
  };
  await jest.isolateModulesAsync(async () => {
    const [testing, app, client, port] = await Promise.all([
      import('@nestjs/testing'),
      import('../src/app.module'),
      import('../src/modules/escalation/notifications/connect.client'),
      import('../src/modules/escalation/notifications/notification.port'),
    ]);
    modules = {
      Test: testing.Test,
      AppModule: app.AppModule,
      CONNECT_CLIENT: client.CONNECT_CLIENT,
      NOTIFICATION_PORT: port.NOTIFICATION_PORT,
    };
  });
  let builder = modules.Test.createTestingModule({ imports: [modules.AppModule] });
  if (stub) builder = builder.overrideProvider(modules.CONNECT_CLIENT).useValue(stub);
  return { moduleRef: await builder.compile(), NOTIFICATION_PORT: modules.NOTIFICATION_PORT };
}

describe('Amazon Connect calls (e2e)', () => {
  const original = { ...process.env };
  let app: INestApplication | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
    process.env = { ...original };
  });

  it('CALL_PROVIDER=connect routes family calls through StartOutboundVoiceContact', async () => {
    const sent: Array<{ constructor: { name: string }; input: Record<string, unknown> }> = [];
    const stub = {
      send: async (command: (typeof sent)[number]) => {
        sent.push(command);
        return command.constructor.name === 'StartOutboundVoiceContactCommand'
          ? { ContactId: 'connect-contact-1' }
          : { Attributes: {} };
      },
    };
    const { moduleRef, NOTIFICATION_PORT } = await compileWith(CONNECT_ENV, stub);
    app = moduleRef.createNestApplication();
    await app.init();

    const port = app.get<NotificationPort>(NOTIFICATION_PORT);
    const result = await port.placeCall({
      incidentId: 'inc-e2e',
      contact: {
        id: 'contact-1',
        name: 'Miguel',
        role: 'son',
        phone: '+351910000001',
        pushToken: null,
        priority: 1,
        quietHours: null,
      },
      ringSeconds: 45,
    });

    expect(result).toEqual({ answered: false, awaitsConfirmation: true });
    expect(sent[0]!.constructor.name).toBe('StartOutboundVoiceContactCommand');
    expect(sent[0]!.input).toMatchObject({
      InstanceId: CONNECT_ENV.CONNECT_INSTANCE_ID,
      ContactFlowId: CONNECT_ENV.CONNECT_CONTACT_FLOW_ID,
      DestinationPhoneNumber: '+351910000001',
      Attributes: { incidentId: 'inc-e2e', contactId: 'contact-1' },
    });
  });

  it('refuses to boot with a non-EU CONNECT_REGION', async () => {
    await expect(compileWith({ ...CONNECT_ENV, CONNECT_REGION: 'us-east-1' })).rejects.toThrow(
      /CONNECT_REGION must be an EU region/,
    );
  });
});
