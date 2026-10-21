import { GetContactAttributesCommand } from '@aws-sdk/client-connect';
import { appConfigFor } from '../../ai/testing/ai-test-helpers';
import type { EscalationService } from '../escalation.service';
import { ConnectConfirmationPoller, type WatchCallInput } from './connect-confirmation.poller';
import type { ConnectSender } from './connect.client';

const INSTANCE = '11111111-2222-4333-8444-555555555555';
const INTERVAL = 3_000;

class StubConnect implements ConnectSender {
  readonly inputs: GetContactAttributesCommand['input'][] = [];
  attributes: Record<string, string> = {};
  fail: Error | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async send(command: unknown): Promise<any> {
    this.inputs.push((command as GetContactAttributesCommand).input);
    if (this.fail) throw this.fail;
    return { Attributes: { ...this.attributes } };
  }
}

function setup(opts: { running?: () => boolean; confirm?: jest.Mock } = {}) {
  let now = 0;
  const client = new StubConnect();
  const confirmByCall = opts.confirm ?? jest.fn().mockResolvedValue(undefined);
  const isEscalationRunning = jest.fn(async () => (opts.running ? opts.running() : true));
  const escalation = { confirmByCall, isEscalationRunning } as unknown as EscalationService;
  const config = appConfigFor({
    CALL_PROVIDER: 'connect',
    CONNECT_INSTANCE_ID: INSTANCE,
    CONNECT_CONTACT_FLOW_ID: 'flow-1',
    CONNECT_SOURCE_PHONE_NUMBER: '+4930123456',
  });
  const poller = new ConnectConfirmationPoller(client, config, escalation, {
    intervalMs: INTERVAL,
    graceSeconds: 30,
    now: () => now,
  });
  /** Advance the fake clock and timers by one poll and let its promises settle. */
  const poll = async (times = 1): Promise<void> => {
    for (let i = 0; i < times; i++) {
      now += INTERVAL;
      await jest.advanceTimersByTimeAsync(INTERVAL);
    }
  };
  return { poller, client, confirmByCall, isEscalationRunning, poll };
}

const watch: WatchCallInput = {
  incidentId: 'inc-1',
  contactId: 'contact-miguel',
  connectContactId: 'connect-contact-1',
  windowSeconds: 45,
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('ConnectConfirmationPoller', () => {
  it('polls GetContactAttributes for the contact every 3 seconds', async () => {
    const { poller, client, poll } = setup();
    poller.watch(watch);
    await poll(3);
    expect(client.inputs).toEqual([
      { InstanceId: INSTANCE, InitialContactId: 'connect-contact-1' },
      { InstanceId: INSTANCE, InitialContactId: 'connect-contact-1' },
      { InstanceId: INSTANCE, InitialContactId: 'connect-contact-1' },
    ]);
    expect(poller.isWatching('inc-1', 'contact-miguel')).toBe(true);
  });

  it('confirmed = "1" signals the workflow once, through the Twilio path, then stops', async () => {
    const { poller, client, confirmByCall, poll } = setup();
    poller.watch(watch);
    await poll(2);
    expect(confirmByCall).not.toHaveBeenCalled();
    client.attributes = { confirmed: '1' };
    await poll(5);
    expect(confirmByCall).toHaveBeenCalledTimes(1);
    expect(confirmByCall).toHaveBeenCalledWith('inc-1', 'contact-miguel', 'connect');
    expect(poller.activeCount).toBe(0);
    expect(client.inputs).toHaveLength(3);
  });

  it('any other value is not a confirmation', async () => {
    const { poller, client, confirmByCall, poll } = setup();
    client.attributes = { confirmed: '2', message: '1' };
    poller.watch(watch);
    await poll(4);
    expect(confirmByCall).not.toHaveBeenCalled();
  });

  it('stops at the end of the ack window plus the grace period, without confirming', async () => {
    const { poller, client, confirmByCall, poll } = setup();
    poller.watch(watch);
    // 45 s window + 30 s grace = 75 s = 25 polls; the 25th sees the deadline.
    await poll(24);
    expect(poller.activeCount).toBe(1);
    await poll(1);
    expect(poller.activeCount).toBe(0);
    const polled = client.inputs.length;
    await poll(5);
    expect(client.inputs.length).toBe(polled);
    expect(confirmByCall).not.toHaveBeenCalled();
  });

  it('stops when the workflow has ended', async () => {
    let running = true;
    const { poller, client, poll } = setup({ running: () => running });
    poller.watch(watch);
    await poll(1);
    running = false;
    await poll(1);
    expect(poller.activeCount).toBe(0);
    expect(client.inputs).toHaveLength(1);
  });

  it('AWS errors and throttling are logged by name only and polling carries on', async () => {
    const { poller, client, confirmByCall, poll } = setup();
    const warn = jest.spyOn(
      (poller as unknown as { logger: { warn: (m: string) => void } }).logger,
      'warn',
    );
    client.fail = Object.assign(new Error('contact +351910000001 not found'), {
      name: 'ResourceNotFoundException',
      $metadata: { httpStatusCode: 404 },
    });
    poller.watch(watch);
    await poll(2);
    client.fail = Object.assign(new Error('slow down'), {
      name: 'ThrottlingException',
      $metadata: { httpStatusCode: 429 },
    });
    await poll(1);
    const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('ResourceNotFoundException (404)');
    expect(logged).toContain('ThrottlingException (429)');
    expect(logged).not.toContain('+351');
    // After throttling the next poll waits twice as long, then it still confirms.
    client.fail = null;
    client.attributes = { confirmed: '1' };
    await poll(2);
    expect(confirmByCall).toHaveBeenCalledTimes(1);
    expect(poller.activeCount).toBe(0);
  });

  it('a confirmation the workflow can no longer take is logged, never thrown', async () => {
    const confirm = jest.fn().mockRejectedValue(new Error('workflow completed'));
    const { poller, client, poll } = setup({ confirm });
    client.attributes = { confirmed: '1' };
    poller.watch(watch);
    await poll(1);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(poller.activeCount).toBe(0);
  });

  it('a retried call for the same contact keeps one poller; a new contact id replaces it', async () => {
    const { poller, client, poll } = setup();
    poller.watch(watch);
    poller.watch(watch);
    await poll(1);
    expect(client.inputs).toHaveLength(1);
    poller.watch({ ...watch, connectContactId: 'connect-contact-2' });
    await poll(1);
    expect(poller.activeCount).toBe(1);
    expect(client.inputs.at(-1)).toEqual({
      InstanceId: INSTANCE,
      InitialContactId: 'connect-contact-2',
    });
  });

  it('shutdown clears every poller', async () => {
    const { poller, client, poll } = setup();
    poller.watch(watch);
    poller.watch({ ...watch, contactId: 'contact-sofia', connectContactId: 'c-3' });
    poller.onModuleDestroy();
    await poll(3);
    expect(poller.activeCount).toBe(0);
    expect(client.inputs).toEqual([]);
  });
});
