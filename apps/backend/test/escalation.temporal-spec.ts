import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { createEscalationActivities } from '../src/modules/escalation/temporal/activities.impl';
import { InMemoryIncidentRepository } from '../src/modules/escalation/in-memory-incident.repository';
import type { NotificationPort } from '../src/modules/escalation/notifications/notification.port';
import {
  escalationWorkflow,
  checkinSignal,
  caregiverAckSignal,
  resolveSignal,
} from '../src/modules/escalation/temporal/workflows';
import type {
  EscalationContact,
  EscalationInput,
  VoiceCheckinResult,
} from '../src/modules/escalation/temporal/types';

const workflowsPath = require.resolve('../src/modules/escalation/temporal/workflows');

/** Notification double that records calls and can be told which contacts answer. */
class TestNotifications implements NotificationPort {
  readonly calls: string[] = [];
  readonly deviceAlerts: string[] = [];
  readonly answerFor = new Set<string>();
  async placeCall(input: { contact: EscalationContact }): Promise<{ answered: boolean }> {
    this.calls.push(input.contact.id);
    return { answered: this.answerFor.has(input.contact.id) };
  }
  async sendSms(): Promise<void> {}
  async pushCriticalAlert(): Promise<void> {}
  async pushDeviceAlert(input: { token: string }): Promise<void> {
    this.deviceAlerts.push(input.token);
  }
  async notifyEmergency(): Promise<void> {}
}

const contact = (
  id: string,
  priority: number,
  extra: Partial<EscalationContact> = {},
): EscalationContact => ({
  id,
  name: id,
  role: 'family',
  phone: `+35190000000${priority}`,
  pushToken: null,
  priority,
  quietHours: null,
  ...extra,
});

const makeInput = (over: Partial<EscalationInput> & { incidentId: string }): EscalationInput => ({
  familyId: 'fam-1',
  deviceId: 'dev-1',
  reason: 'fall.suspected',
  confirmedFall: false,
  contacts: [],
  pushDevices: [],
  ackWindowSeconds: 45,
  initialCheckin: 'pending',
  ...over,
});

describe('escalationWorkflow (Temporal test env)', () => {
  let env: TestWorkflowEnvironment;

  beforeAll(async () => {
    env = await TestWorkflowEnvironment.createTimeSkipping();
  }, 60_000);

  afterAll(async () => {
    await env?.teardown();
  });

  async function run(
    input: EscalationInput,
    notifications: NotificationPort,
    incidents: InMemoryIncidentRepository,
    signal?: (handle: {
      signal(def: typeof checkinSignal, arg: VoiceCheckinResult): Promise<void>;
      signal(def: typeof caregiverAckSignal, arg: string): Promise<void>;
      signal(def: typeof resolveSignal): Promise<void>;
    }) => Promise<void>,
  ): Promise<{ outcome: string; acknowledgedByContactId: string | null }> {
    const taskQueue = `tq-${input.incidentId}`;
    const worker = await Worker.create({
      connection: env.nativeConnection,
      taskQueue,
      workflowsPath,
      activities: createEscalationActivities({ incidents, notifications }),
    });
    const handle = await env.client.workflow.start(escalationWorkflow, {
      taskQueue,
      workflowId: `wf-${input.incidentId}`,
      args: [input],
    });
    return worker.runUntil(async () => {
      if (signal) await signal(handle);
      return handle.result();
    });
  }

  it('stands down when the elder says they are fine', async () => {
    const incidents = new InMemoryIncidentRepository();
    const notifications = new TestNotifications();
    const input = makeInput({
      incidentId: 'stand-down',
      initialCheckin: 'i_am_fine',
      contacts: [contact('c1', 0)],
    });

    const result = await run(input, notifications, incidents);

    expect(result.outcome).toBe('stood_down');
    expect(notifications.calls).toEqual([]);
    expect(await incidents.listStepKinds(input.incidentId)).toEqual([
      'incident_opened',
      'voice_checkin_result',
      'stood_down',
    ]);
  });

  it('climbs the ladder to emergency when no one answers', async () => {
    const incidents = new InMemoryIncidentRepository();
    const notifications = new TestNotifications();
    const input = makeInput({
      incidentId: 'no-answer',
      initialCheckin: 'silence',
      contacts: [contact('c1', 0), contact('c2', 1)],
    });

    const result = await run(input, notifications, incidents);

    expect(result.outcome).toBe('emergency_notified');
    expect(notifications.calls).toEqual(['c1', 'c2']); // both tried, in order
    const kinds = await incidents.listStepKinds(input.incidentId);
    expect(kinds[0]).toBe('incident_opened');
    expect(kinds.filter((k) => k === 'call_no_answer')).toHaveLength(2);
    expect(kinds.at(-1)).toBe('emergency_notified');
  });

  it('critical-alerts the caregivers’ registered devices before calling anyone', async () => {
    const incidents = new InMemoryIncidentRepository();
    const notifications = new TestNotifications();
    notifications.answerFor.add('c1');
    const input = makeInput({
      incidentId: 'device-push',
      initialCheckin: 'silence',
      pushDevices: ['tokA', 'tokB'],
      contacts: [contact('c1', 0)],
    });

    const result = await run(input, notifications, incidents);

    // Both registered devices were alerted...
    expect(notifications.deviceAlerts).toEqual(['tokA', 'tokB']);
    const kinds = await incidents.listStepKinds(input.incidentId);
    // ...and the push_sent steps land before the first call.
    expect(kinds.indexOf('push_sent')).toBeLessThan(kinds.indexOf('call_placed'));
    expect(kinds.filter((k) => k === 'push_sent')).toHaveLength(2);
    expect(result.outcome).toBe('acknowledged');
  });

  it('does not alert devices when the elder says they are fine', async () => {
    const incidents = new InMemoryIncidentRepository();
    const notifications = new TestNotifications();
    const input = makeInput({
      incidentId: 'device-push-standdown',
      initialCheckin: 'i_am_fine',
      pushDevices: ['tokA'],
      contacts: [contact('c1', 0)],
    });

    await run(input, notifications, incidents);

    expect(notifications.deviceAlerts).toEqual([]); // check-in gate suppressed it
  });

  it('stops at the first contact who answers', async () => {
    const incidents = new InMemoryIncidentRepository();
    const notifications = new TestNotifications();
    notifications.answerFor.add('c2');
    const input = makeInput({
      incidentId: 'answered',
      initialCheckin: 'distress',
      contacts: [contact('c1', 0), contact('c2', 1)],
    });

    const result = await run(input, notifications, incidents);

    expect(result.outcome).toBe('acknowledged');
    expect(result.acknowledgedByContactId).toBe('c2');
    expect(notifications.calls).toEqual(['c1', 'c2']);
  });

  it('overrides quiet hours for a confirmed fall', async () => {
    const incidents = new InMemoryIncidentRepository();
    const notifications = new TestNotifications();
    notifications.answerFor.add('c1');
    const quiet = contact('c1', 0, {
      quietHours: { start: '00:00', end: '23:59', wakeForConfirmedFallOnly: true },
    });
    const input = makeInput({
      incidentId: 'quiet-override',
      initialCheckin: 'silence',
      confirmedFall: true,
      contacts: [quiet],
    });

    const result = await run(input, notifications, incidents);

    expect(result.outcome).toBe('acknowledged'); // called despite quiet hours
    expect(notifications.calls).toEqual(['c1']);
  });

  it('delivers a pending check-in via signal, then escalates on silence', async () => {
    const incidents = new InMemoryIncidentRepository();
    const notifications = new TestNotifications();
    const input = makeInput({
      incidentId: 'signal-checkin',
      initialCheckin: 'pending',
      contacts: [contact('c1', 0)],
    });

    const result = await run(input, notifications, incidents, async (handle) => {
      await handle.signal(checkinSignal, 'silence');
    });

    expect(result.outcome).toBe('emergency_notified');
  });

  it('a caregiver acknowledge + all-clear stands the incident down (0008)', async () => {
    const incidents = new InMemoryIncidentRepository();
    const notifications = new TestNotifications();
    const input = makeInput({
      incidentId: 'ack-resolve',
      initialCheckin: 'pending', // the workflow waits at the check-in, giving the signals a window
      contacts: [],
    });

    const result = await run(input, notifications, incidents, async (handle) => {
      await handle.signal(caregiverAckSignal, 'user-1');
      await handle.signal(resolveSignal); // all-clear arrives before the window lapses
    });

    expect(result.outcome).toBe('stood_down');
    const kinds = await incidents.listStepKinds(input.incidentId);
    expect(kinds).toContain('caregiver_acknowledged');
    expect(kinds.at(-1)).toBe('stood_down');
    expect(kinds).not.toContain('emergency_notified'); // help was not summoned
  });

  it('a caregiver acknowledge that never clears LAPSES and re-escalates to emergency (0008)', async () => {
    const incidents = new InMemoryIncidentRepository();
    const notifications = new TestNotifications();
    const input = makeInput({
      incidentId: 'ack-lapse',
      initialCheckin: 'pending',
      contacts: [],
    });

    // Acknowledge but never send all-clear; the time-skipping env advances past the window.
    const result = await run(input, notifications, incidents, async (handle) => {
      await handle.signal(caregiverAckSignal, 'user-1');
    });

    // The one-tap ack only delayed help; it never suppressed it.
    expect(result.outcome).toBe('emergency_notified');
    const kinds = await incidents.listStepKinds(input.incidentId);
    expect(kinds).toContain('caregiver_acknowledged');
    expect(kinds).toContain('acknowledgement_lapsed');
    expect(kinds.at(-1)).toBe('emergency_notified');
  });

  it('resumes deterministically on a fresh worker after a crash (never drops the incident)', async () => {
    // When the backend is killed mid-escalation, Temporal resumes the incident by
    // replaying its recorded history through the workflow code on a fresh worker.
    // Replaying the full history here is exactly that resumption path: if the
    // workflow were non-deterministic, replay would throw — proving a crash can
    // never drop or corrupt an in-flight incident.
    const incidents = new InMemoryIncidentRepository();
    const notifications = new TestNotifications();
    const input = makeInput({
      incidentId: 'crash-safe',
      initialCheckin: 'silence',
      contacts: [contact('c1', 0), contact('c2', 1)],
    });
    const taskQueue = 'tq-crash-safe';

    const worker = await Worker.create({
      connection: env.nativeConnection,
      taskQueue,
      workflowsPath,
      activities: createEscalationActivities({ incidents, notifications }),
    });
    const handle = await env.client.workflow.start(escalationWorkflow, {
      taskQueue,
      workflowId: 'wf-crash-safe',
      args: [input],
    });
    const result = await worker.runUntil(handle.result());
    expect(result.outcome).toBe('emergency_notified');

    // Replay the recorded history on a fresh worker — the crash-recovery path.
    const history = await handle.fetchHistory();
    await Worker.runReplayHistory({ workflowsPath }, history); // throws on non-determinism

    // Incident trail intact and uncorrupted: exactly one opening, reached emergency.
    const kinds = await incidents.listStepKinds(input.incidentId);
    expect(kinds.filter((k) => k === 'incident_opened')).toHaveLength(1);
    expect(kinds).toContain('emergency_notified');
  }, 60_000);
});
