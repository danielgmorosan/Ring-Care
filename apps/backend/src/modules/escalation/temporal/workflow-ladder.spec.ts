/**
 * The escalation workflow's branching, run in plain jest against a small fake of the
 * Temporal workflow runtime (the real Temporal test server lives in
 * test/escalation.temporal-spec.ts and needs a downloadable server binary).
 *
 * The fake models what matters for the safety core:
 *  - activities are recorded to a history as they complete;
 *  - "killing the process" at any activity boundary abandons the run mid-flow;
 *  - "resuming" re-runs the workflow code from the start against that history, the way a
 *    fresh Temporal worker does: recorded activities return their recorded result without
 *    side effects, and any divergence between the code and the history fails the test
 *    (non-determinism). The rest then runs live.
 *  - timers are skipped (condition timeouts fire once nothing else can progress).
 *  - a signal can arrive mid-flow, right after a given contact's call is placed (a contact
 *    pressing 1 on that call). Like any signal in a real history it sits at the same
 *    point on replay, so a resumed worker sees it exactly where the original run did.
 */
import { InMemoryIncidentRepository } from '../in-memory-incident.repository';
import { createEscalationActivities } from './activities.impl';
import {
  ACK_SIGNAL,
  CAREGIVER_ACK_SIGNAL,
  CHECKIN_SIGNAL,
  CONTACT_CONFIRMED_SIGNAL,
  RESOLVE_SIGNAL,
  type EscalationActivities,
  type EscalationContact,
  type EscalationInput,
  type EscalationResult,
  type PlaceCallInput,
  type PlaceCallResult,
} from './types';
import { escalationWorkflow } from './workflows';
import type { NotificationPort } from '../notifications/notification.port';

interface HistoryEntry {
  name: string;
  args: string;
  result: unknown;
}

class FakeWorkflowRuntime {
  readonly history: HistoryEntry[] = [];
  private readonly handlers = new Map<string, (...args: unknown[]) => void>();
  private readonly queued: Array<{ name: string; args: unknown[] }> = [];
  private waiters: Array<{ fn: () => boolean; resolve: (fired: boolean) => void }> = [];
  private replayIndex = 0;
  killed = false;
  timersFired = 0;
  /** Signals delivered right after a given contact's placeCall completes (live or replay). */
  signalsAfterCall: Record<string, Signal[]> = {};

  constructor(
    private readonly acts: EscalationActivities,
    private readonly replay: HistoryEntry[] = [],
    /** Kill the process when this many activities have completed (live or replayed). */
    private readonly killAfter: number | null = null,
    /** On kill, run the next activity's side effect but lose its result (at-least-once). */
    private readonly killAfterSideEffect = false,
  ) {}

  get pendingTimers(): number {
    return this.waiters.length;
  }

  async call(name: string, args: unknown[]): Promise<unknown> {
    if (this.killed) return new Promise(() => undefined);
    const serialized = JSON.stringify(args);
    if (this.replayIndex < this.replay.length) {
      const recorded = this.replay[this.replayIndex++]!;
      if (recorded.name !== name || recorded.args !== serialized) {
        throw new Error(
          `Non-determinism at activity ${this.replayIndex}: history has ${recorded.name}` +
            `(${recorded.args}), code issued ${name}(${serialized})`,
        );
      }
      this.history.push(recorded);
      this.afterActivity(name, args);
      return recorded.result;
    }
    if (this.killAfter !== null && this.history.length >= this.killAfter) {
      this.killed = true;
      if (this.killAfterSideEffect) await this.invoke(name, args);
      return new Promise(() => undefined);
    }
    const result = await this.invoke(name, args);
    this.history.push({ name, args: serialized, result });
    this.afterActivity(name, args);
    return result;
  }

  private afterActivity(name: string, args: unknown[]): void {
    if (name !== 'placeCall') return;
    const contactId = (args[0] as PlaceCallInput).contact.id;
    for (const [signalName, ...signalArgs] of this.signalsAfterCall[contactId] ?? []) {
      this.signal(signalName, ...signalArgs);
    }
  }

  private invoke(name: string, args: unknown[]): Promise<unknown> {
    const fn = (this.acts as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[
      name
    ]!;
    return fn(...args);
  }

  condition(fn: () => boolean): Promise<boolean> {
    if (fn()) return Promise.resolve(true);
    return new Promise((resolve) => this.waiters.push({ fn, resolve }));
  }

  setHandler(name: string, handler: (...args: unknown[]) => void): void {
    this.handlers.set(name, handler);
    for (const signal of this.queued.filter((q) => q.name === name)) handler(...signal.args);
  }

  signal(name: string, ...args: unknown[]): void {
    const handler = this.handlers.get(name);
    if (handler) handler(...args);
    else this.queued.push({ name, args });
    this.recheck();
  }

  private recheck(): void {
    const still: typeof this.waiters = [];
    for (const w of this.waiters) {
      if (w.fn()) w.resolve(true);
      else still.push(w);
    }
    this.waiters = still;
  }

  /** Time skipping: every pending condition times out. */
  fireTimers(): void {
    const waiters = this.waiters;
    this.waiters = [];
    this.timersFired += waiters.length;
    for (const w of waiters) w.resolve(false);
  }
}

const mockHolder: { rt: FakeWorkflowRuntime | null } = { rt: null };

jest.mock('@temporalio/workflow', () => ({
  defineSignal: (name: string) => name,
  setHandler: (name: string, handler: (...args: unknown[]) => void) =>
    mockHolder.rt!.setHandler(name, handler),
  proxyActivities: () =>
    new Proxy(
      {},
      {
        get:
          (_target, prop: string) =>
          (...args: unknown[]) =>
            mockHolder.rt!.call(prop, args),
      },
    ),
  condition: (fn: () => boolean) => mockHolder.rt!.condition(fn),
}));

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** Notification double: records every side effect, answers for chosen contacts. */
class RecordingNotifications implements NotificationPort {
  readonly calls: string[] = [];
  readonly sms: Array<{ to: string; message: string }> = [];
  readonly contactPushes: string[] = [];
  readonly deviceAlerts: Array<{ token: string; message: string }> = [];
  readonly emergencies: string[] = [];
  constructor(private readonly answerFor: Set<string> = new Set()) {}
  async placeCall(input: { contact: EscalationContact }): Promise<{ answered: boolean }> {
    this.calls.push(input.contact.id);
    return { answered: this.answerFor.has(input.contact.id) };
  }
  async sendSms(input: { contact: EscalationContact; message: string }): Promise<void> {
    this.sms.push({ to: input.contact.id, message: input.message });
  }
  async pushCriticalAlert(input: { contact: EscalationContact }): Promise<void> {
    this.contactPushes.push(input.contact.id);
  }
  async pushDeviceAlert(input: { token: string; message: string }): Promise<void> {
    this.deviceAlerts.push({ token: input.token, message: input.message });
  }
  async notifyEmergency(input: { summary: string }): Promise<void> {
    this.emergencies.push(input.summary);
  }
}

/**
 * Notification double for Twilio with callbacks: every call asks for a press-1 and reports
 * `awaitsConfirmation`, so the workflow waits the ack window per contact.
 */
class ConfirmingNotifications extends RecordingNotifications {
  readonly spoken: Array<string | undefined> = [];
  override async placeCall(input: PlaceCallInput): Promise<PlaceCallResult> {
    await super.placeCall(input);
    this.spoken.push(input.message);
    return { answered: false, awaitsConfirmation: true };
  }
}

type Signal = [name: string, ...args: unknown[]];

interface RunOptions {
  signals?: Signal[];
  /** Signals that arrive right after the named contact's call is placed. */
  signalsAfterCall?: Record<string, Signal[]>;
  replay?: HistoryEntry[];
  killAfter?: number | null;
  killAfterSideEffect?: boolean;
}

interface RunResult {
  result: EscalationResult | null;
  killed: boolean;
  history: HistoryEntry[];
  /** How many condition timeouts fired (each is a window that ran out). */
  timersFired: number;
}

/** Drive one worker "process" until the workflow finishes or the process is killed. */
async function runProcess(
  input: EscalationInput,
  incidents: InMemoryIncidentRepository,
  notifications: NotificationPort,
  options: RunOptions = {},
): Promise<RunResult> {
  const rt = new FakeWorkflowRuntime(
    createEscalationActivities({ incidents, notifications }),
    options.replay ?? [],
    options.killAfter ?? null,
    options.killAfterSideEffect ?? false,
  );
  rt.signalsAfterCall = options.signalsAfterCall ?? {};
  mockHolder.rt = rt;
  // Signals already in the history (delivered with the start) arrive on every run.
  for (const [name, ...args] of options.signals ?? []) rt.signal(name, ...args);

  let result: EscalationResult | null = null;
  let error: unknown = null;
  let settled = false;
  void escalationWorkflow(input).then(
    (r) => {
      result = r;
      settled = true;
    },
    (e: unknown) => {
      error = e;
      settled = true;
    },
  );
  for (let i = 0; i < 500; i++) {
    await flush();
    if (settled) break;
    if (rt.killed) {
      return { result: null, killed: true, history: rt.history, timersFired: rt.timersFired };
    }
    if (rt.pendingTimers > 0) rt.fireTimers();
  }
  if (error) throw error;
  if (!settled) throw new Error('workflow did not settle');
  return { result, killed: false, history: rt.history, timersFired: rt.timersFired };
}

const contact = (
  id: string,
  priority: number,
  extra: Partial<EscalationContact> = {},
): EscalationContact => ({
  id,
  name: id,
  role: 'family',
  phone: `+35191000000${priority}`,
  pushToken: null,
  priority,
  quietHours: null,
  ...extra,
});

const fallInput = (over: Partial<EscalationInput> = {}): EscalationInput => ({
  incidentId: 'inc-fall',
  familyId: 'fam-1',
  deviceId: 'dev-1',
  reason: 'fall.suspected',
  confirmedFall: false,
  contacts: [contact('c1', 0), contact('c2', 1)],
  pushDevices: ['tokA'],
  ackWindowSeconds: 45,
  initialCheckin: 'silence',
  ...over,
});

const DOOR_DEVICE = "Someone was at the front door at 3:04. We're calling sofia now.";
const DOOR_UNANSWERED =
  "Someone was at the front door at 3:04. We haven't reached anyone by phone yet. Please check on home.";

const DOOR_CALL = 'This is Obrigada. Someone was at the front door at 3:04.';

const doorInput = (over: Partial<EscalationInput> = {}): EscalationInput => ({
  incidentId: 'inc-door',
  familyId: 'fam-1',
  deviceId: null,
  reason: 'door.night_activity',
  confirmedFall: false,
  contacts: [contact('sofia', 0), contact('miguel', 1)],
  pushDevices: ['tokA'],
  ackWindowSeconds: 45,
  initialCheckin: 'pending',
  messages: { device: DOOR_DEVICE, unanswered: DOOR_UNANSWERED },
  ...over,
});

async function steps(incidents: InMemoryIncidentRepository, incidentId: string) {
  return (await incidents.listSteps(incidentId)).map((s) => ({ kind: s.kind, detail: s.detail }));
}

describe('escalation workflow: fall path is unchanged', () => {
  it('stands down when the elder says they are fine', async () => {
    const incidents = new InMemoryIncidentRepository();
    const n = new RecordingNotifications();
    const { result } = await runProcess(fallInput({ initialCheckin: 'i_am_fine' }), incidents, n);

    expect(result!.outcome).toBe('stood_down');
    expect(await steps(incidents, 'inc-fall')).toEqual([
      { kind: 'incident_opened', detail: { reason: 'fall.suspected', confirmedFall: false } },
      { kind: 'voice_checkin_result', detail: { result: 'i_am_fine' } },
      { kind: 'stood_down', detail: { reason: 'voice_checkin_ok' } },
    ]);
    expect(n.calls).toEqual([]);
    expect(n.deviceAlerts).toEqual([]);
  });

  it('climbs to emergency services with the original texts and trail', async () => {
    const incidents = new InMemoryIncidentRepository();
    const n = new RecordingNotifications();
    const { result } = await runProcess(fallInput(), incidents, n);

    expect(result).toEqual({
      outcome: 'emergency_notified',
      acknowledgedByContactId: null,
      steps: 10,
    });
    expect((await steps(incidents, 'inc-fall')).map((s) => s.kind)).toEqual([
      'incident_opened',
      'voice_checkin_result',
      'push_sent',
      'call_placed',
      'call_no_answer',
      'call_placed',
      'call_no_answer',
      'sms_sent',
      'sms_sent',
      'emergency_notified',
    ]);
    expect((await steps(incidents, 'inc-fall'))[0]!.detail).toEqual({
      reason: 'fall.suspected',
      confirmedFall: false,
    });
    expect(n.deviceAlerts).toEqual([
      { token: 'tokA', message: 'Obrigada needs you: a possible fall suspected at home.' },
    ]);
    expect(n.sms.map((s) => s.message)).toEqual([
      'Obrigada needs you: a possible fall suspected at home has gone unanswered.',
      'Obrigada needs you: a possible fall suspected at home has gone unanswered.',
    ]);
    expect(n.emergencies).toEqual(['fall.suspected']);
  });

  it('a pending check-in that never arrives is treated as silence', async () => {
    const incidents = new InMemoryIncidentRepository();
    const n = new RecordingNotifications(new Set(['c1']));
    const { result } = await runProcess(fallInput({ initialCheckin: 'pending' }), incidents, n);

    expect(result!.outcome).toBe('acknowledged');
    expect((await steps(incidents, 'inc-fall'))[1]).toEqual({
      kind: 'voice_checkin_result',
      detail: { result: 'silence' },
    });
  });

  it('a check-in signal of i_am_fine stands a pending fall down', async () => {
    const incidents = new InMemoryIncidentRepository();
    const n = new RecordingNotifications();
    const { result } = await runProcess(fallInput({ initialCheckin: 'pending' }), incidents, n, {
      signals: [[CHECKIN_SIGNAL, 'i_am_fine']],
    });
    expect(result!.outcome).toBe('stood_down');
  });
});

describe('escalation workflow: door.night_activity (family only, decision 0011)', () => {
  it('Sofia does not answer, Miguel does: the ladder ends with Miguel', async () => {
    const incidents = new InMemoryIncidentRepository();
    const n = new RecordingNotifications(new Set(['miguel']));
    const { result } = await runProcess(doorInput(), incidents, n);

    expect(result).toEqual({
      outcome: 'acknowledged',
      acknowledgedByContactId: 'miguel',
      steps: 6,
    });
    expect(await steps(incidents, 'inc-door')).toEqual([
      {
        kind: 'incident_opened',
        detail: {
          reason: 'door.night_activity',
          confirmedFall: false,
          voiceCheckin: false,
          emergencyServices: false,
        },
      },
      { kind: 'push_sent', detail: { device: true } },
      { kind: 'call_placed', detail: { phone: '+351910000000' } },
      { kind: 'call_no_answer', detail: {} },
      { kind: 'call_placed', detail: { phone: '+351910000001' } },
      { kind: 'call_answered', detail: {} },
    ]);
    expect(n.calls).toEqual(['sofia', 'miguel']);
    expect(n.deviceAlerts).toEqual([{ token: 'tokA', message: DOOR_DEVICE }]);
  });

  it('skips the voice check-in gate: no wait, no check-in step, no stand-down by check-in', async () => {
    const incidents = new InMemoryIncidentRepository();
    const n = new RecordingNotifications(new Set(['sofia']));
    const { result } = await runProcess(doorInput({ initialCheckin: 'i_am_fine' }), incidents, n, {
      signals: [[CHECKIN_SIGNAL, 'i_am_fine']],
    });

    expect(result!.outcome).toBe('acknowledged');
    const kinds = (await steps(incidents, 'inc-door')).map((s) => s.kind);
    expect(kinds).not.toContain('voice_checkin_result');
    expect(kinds).not.toContain('stood_down');
    expect(n.calls).toEqual(['sofia']);
  });

  it('nobody answers: everyone is texted and pushed, and emergency services are NEVER called', async () => {
    const incidents = new InMemoryIncidentRepository();
    const n = new RecordingNotifications();
    const input = doorInput({
      contacts: [contact('sofia', 0, { pushToken: 'p-sofia' }), contact('miguel', 1)],
    });
    const { result } = await runProcess(input, incidents, n);

    expect(result).toEqual({ outcome: 'family_alerted', acknowledgedByContactId: null, steps: 10 });
    expect((await steps(incidents, 'inc-door')).map((s) => s.kind)).toEqual([
      'incident_opened',
      'push_sent',
      'call_placed',
      'call_no_answer',
      'call_placed',
      'call_no_answer',
      'sms_sent',
      'push_sent',
      'sms_sent',
      'family_alerted',
    ]);
    expect(n.sms).toEqual([
      { to: 'sofia', message: DOOR_UNANSWERED },
      { to: 'miguel', message: DOOR_UNANSWERED },
    ]);
    expect(n.contactPushes).toEqual(['sofia']);
    expect(n.emergencies).toEqual([]);
  });

  it('a caregiver acknowledgement that lapses re-escalates to the family, never to 112', async () => {
    const incidents = new InMemoryIncidentRepository();
    const n = new RecordingNotifications();
    const { result } = await runProcess(doorInput(), incidents, n, {
      signals: [[CAREGIVER_ACK_SIGNAL, 'user-sofia']],
    });

    expect(result!.outcome).toBe('family_alerted');
    const kinds = (await steps(incidents, 'inc-door')).map((s) => s.kind);
    expect(kinds).toEqual([
      'incident_opened',
      'push_sent',
      'caregiver_acknowledged',
      'acknowledgement_lapsed',
      'sms_sent',
      'sms_sent',
      'family_alerted',
    ]);
    expect(n.calls).toEqual([]); // the app acknowledgement held the phone tree
    expect(n.emergencies).toEqual([]);
  });

  it('a caregiver acknowledgement with an all-clear stands the door incident down', async () => {
    const incidents = new InMemoryIncidentRepository();
    const n = new RecordingNotifications();
    const { result } = await runProcess(doorInput(), incidents, n, {
      signals: [[CAREGIVER_ACK_SIGNAL, 'user-sofia'], [RESOLVE_SIGNAL]],
    });
    expect(result!.outcome).toBe('stood_down');
    expect(n.emergencies).toEqual([]);
  });

  it('an out-of-band contact acknowledgement stops the phone tree', async () => {
    const incidents = new InMemoryIncidentRepository();
    const n = new RecordingNotifications();
    const { result } = await runProcess(doorInput(), incidents, n, {
      signals: [[ACK_SIGNAL, 'miguel']],
    });
    expect(result).toMatchObject({ outcome: 'acknowledged', acknowledgedByContactId: 'miguel' });
    expect(n.calls).toEqual([]);
  });

  it('wakes contacts through quiet hours: a parent leaving at night is urgent', async () => {
    const incidents = new InMemoryIncidentRepository();
    const n = new RecordingNotifications(new Set(['miguel']));
    const input = doorInput({
      contacts: [
        contact('sofia', 0, {
          quietHours: { start: '00:00', end: '23:59', wakeForConfirmedFallOnly: true },
        }),
        contact('miguel', 1),
      ],
    });
    const { result } = await runProcess(input, incidents, n);
    expect(result!.outcome).toBe('acknowledged');
    expect(n.calls).toEqual(['sofia', 'miguel']);
    expect((await steps(incidents, 'inc-door')).map((s) => s.kind)).not.toContain(
      'quiet_hours_skipped',
    );
  });

  it('a door incident started with the full fall flags still never reaches 112', async () => {
    // The rule set comes from the reason, not from caller-supplied flags.
    const incidents = new InMemoryIncidentRepository();
    const n = new RecordingNotifications();
    const { result } = await runProcess(
      doorInput({ confirmedFall: true, initialCheckin: 'distress' }),
      incidents,
      n,
    );
    expect(result!.outcome).toBe('family_alerted');
    expect(n.emergencies).toEqual([]);
  });
});

describe('escalation workflow: killing the process mid-flow and resuming', () => {
  /**
   * Kill the worker after every possible number of completed activities, then start a fresh
   * worker that replays the history and carries on. The incident must finish with exactly
   * the trail of an uninterrupted run: nothing dropped, nothing duplicated, same outcome.
   */
  async function killAndResumeEverywhere(
    makeInput: () => EscalationInput,
    answerFor: string[],
    signals: Signal[],
    killAfterSideEffect: boolean,
    expected: { outcome: EscalationResult['outcome']; emergency: boolean },
    extra: {
      /** Builds the notification double; default answers for `answerFor`. */
      notifications?: () => RecordingNotifications;
      signalsAfterCall?: Record<string, Signal[]>;
    } = {},
  ): Promise<void> {
    const makeNotifications =
      extra.notifications ?? (() => new RecordingNotifications(new Set(answerFor)));
    const signalsAfterCall = extra.signalsAfterCall ?? {};
    const baseline = new InMemoryIncidentRepository();
    const baseNotifications = makeNotifications();
    const uninterrupted = await runProcess(makeInput(), baseline, baseNotifications, {
      signals,
      signalsAfterCall,
    });
    expect(uninterrupted.result!.outcome).toBe(expected.outcome);
    expect(baseNotifications.emergencies.length).toBe(expected.emergency ? 1 : 0);
    const expectedSteps = await steps(baseline, makeInput().incidentId);
    const total = uninterrupted.history.length;
    expect(total).toBeGreaterThan(3);

    for (let killAfter = 0; killAfter < total; killAfter++) {
      const incidents = new InMemoryIncidentRepository(); // the durable store (Postgres)
      const first = makeNotifications();
      const crashed = await runProcess(makeInput(), incidents, first, {
        signals,
        signalsAfterCall,
        killAfter,
        killAfterSideEffect,
      });
      expect(crashed.killed).toBe(true);

      const second = makeNotifications();
      const resumed = await runProcess(makeInput(), incidents, second, {
        signals,
        signalsAfterCall,
        replay: crashed.history,
      });

      expect(resumed.killed).toBe(false);
      expect(resumed.result).toEqual(uninterrupted.result);
      expect(await steps(incidents, makeInput().incidentId)).toEqual(expectedSteps);
      // Help is summoned exactly when the rules say so: never for the door (decision 0011).
      const emergencies = first.emergencies.length + second.emergencies.length;
      if (expected.emergency) expect(emergencies).toBeGreaterThanOrEqual(1);
      else expect(emergencies).toBe(0);
    }
  }

  it('door.night_activity, Miguel answers: resumes from every activity boundary', async () => {
    await killAndResumeEverywhere(() => doorInput(), ['miguel'], [], false, {
      outcome: 'acknowledged',
      emergency: false,
    });
  });

  it('door.night_activity, nobody answers: resumes and still never calls 112', async () => {
    await killAndResumeEverywhere(() => doorInput(), [], [], false, {
      outcome: 'family_alerted',
      emergency: false,
    });
  });

  it('door.night_activity: a crash after a side effect but before its result is recorded', async () => {
    // At-least-once: the resumed worker repeats the activity; the trail stays exact
    // because recordStep is idempotent on (incidentId, seq).
    await killAndResumeEverywhere(() => doorInput(), [], [], true, {
      outcome: 'family_alerted',
      emergency: false,
    });
  });

  it('door.night_activity, waiting on a caregiver all-clear: resumes and re-escalates', async () => {
    await killAndResumeEverywhere(
      () => doorInput(),
      [],
      [[CAREGIVER_ACK_SIGNAL, 'user-1']],
      false,
      {
        outcome: 'family_alerted',
        emergency: false,
      },
    );
  });

  it('fall path: resumes from every activity boundary to emergency services', async () => {
    await killAndResumeEverywhere(() => fallInput(), [], [], false, {
      outcome: 'emergency_notified',
      emergency: true,
    });
  });

  it('door.night_activity, press 1: resumes through the ack-window wait, Miguel confirms', async () => {
    await killAndResumeEverywhere(
      () => doorInput({ messages: { ...doorInput().messages, call: DOOR_CALL } }),
      [],
      [],
      false,
      { outcome: 'acknowledged', emergency: false },
      {
        notifications: () => new ConfirmingNotifications(),
        signalsAfterCall: { miguel: [[CONTACT_CONFIRMED_SIGNAL, 'miguel']] },
      },
    );
  });

  it('door.night_activity, press 1 never comes: resumes through every wait to family_alerted', async () => {
    await killAndResumeEverywhere(
      () => doorInput(),
      [],
      [],
      true,
      {
        outcome: 'family_alerted',
        emergency: false,
      },
      { notifications: () => new ConfirmingNotifications() },
    );
  });

  it('fall path, press 1 from the second contact: resumes and never calls 112', async () => {
    await killAndResumeEverywhere(
      () => fallInput(),
      [],
      [],
      false,
      { outcome: 'acknowledged', emergency: false },
      {
        notifications: () => new ConfirmingNotifications(),
        signalsAfterCall: { c2: [[CONTACT_CONFIRMED_SIGNAL, 'c2']] },
      },
    );
  });

  it('replaying a door history against fall rules is caught as non-determinism', async () => {
    const incidents = new InMemoryIncidentRepository();
    const door = await runProcess(doorInput(), incidents, new RecordingNotifications());
    await expect(
      runProcess(
        fallInput({ incidentId: 'inc-door' }),
        new InMemoryIncidentRepository(),
        new RecordingNotifications(),
        { replay: door.history },
      ),
    ).rejects.toThrow(/Non-determinism/);
  });
});

describe('escalation workflow: press 1 to confirm on family calls (0003 follow-up)', () => {
  const hero = (over: Partial<EscalationInput> = {}): EscalationInput =>
    doorInput({
      messages: { device: DOOR_DEVICE, unanswered: DOOR_UNANSWERED, call: DOOR_CALL },
      ...over,
    });

  it('hero scene: Sofia does not confirm, the window runs out, Miguel presses 1 and the ladder stops', async () => {
    const incidents = new InMemoryIncidentRepository();
    const n = new ConfirmingNotifications();
    const run = await runProcess(hero(), incidents, n, {
      signalsAfterCall: { miguel: [[CONTACT_CONFIRMED_SIGNAL, 'miguel']] },
    });

    expect(run.result).toEqual({
      outcome: 'acknowledged',
      acknowledgedByContactId: 'miguel',
      steps: 6,
    });
    expect((await steps(incidents, 'inc-door')).slice(2)).toEqual([
      { kind: 'call_placed', detail: { phone: '+351910000000' } },
      { kind: 'call_no_answer', detail: {} },
      { kind: 'call_placed', detail: { phone: '+351910000001' } },
      { kind: 'call_answered', detail: { via: 'press_1' } },
    ]);
    const trail = await incidents.listSteps('inc-door');
    expect(trail[5]).toMatchObject({ kind: 'call_answered', detail: { via: 'press_1' } });
    // Sofia's window ran out (one timer); Miguel's confirmation ended his wait early.
    expect(run.timersFired).toBe(1);
    expect(n.calls).toEqual(['sofia', 'miguel']);
    // The call speaks the deterministic door text, not "We're calling Sofia now".
    expect(n.spoken).toEqual([DOOR_CALL, DOOR_CALL]);
    expect(n.sms).toEqual([]);
    expect(n.emergencies).toEqual([]);
  });

  it('waits the ack window for each contact, then moves on and texts everyone when nobody confirms', async () => {
    const incidents = new InMemoryIncidentRepository();
    const n = new ConfirmingNotifications();
    const run = await runProcess(hero(), incidents, n);

    expect(run.result!.outcome).toBe('family_alerted');
    expect(run.timersFired).toBe(2); // one full window per contact before moving on
    expect((await steps(incidents, 'inc-door')).map((s) => s.kind)).toEqual([
      'incident_opened',
      'push_sent',
      'call_placed',
      'call_no_answer',
      'call_placed',
      'call_no_answer',
      'sms_sent',
      'sms_sent',
      'family_alerted',
    ]);
    expect(n.emergencies).toEqual([]);
  });

  it('a press 1 from the first contact stops the tree before anyone else is rung', async () => {
    const incidents = new InMemoryIncidentRepository();
    const n = new ConfirmingNotifications();
    const run = await runProcess(hero(), incidents, n, {
      signalsAfterCall: { sofia: [[CONTACT_CONFIRMED_SIGNAL, 'sofia']] },
    });
    expect(run.result).toMatchObject({ outcome: 'acknowledged', acknowledgedByContactId: 'sofia' });
    expect(run.timersFired).toBe(0);
    expect(n.calls).toEqual(['sofia']);
  });

  it('a caregiver app acknowledgement during the wait holds the tree (0008), then lapses', async () => {
    const incidents = new InMemoryIncidentRepository();
    const n = new ConfirmingNotifications();
    const run = await runProcess(hero(), incidents, n, {
      signalsAfterCall: { sofia: [[CAREGIVER_ACK_SIGNAL, 'user-sofia']] },
    });

    expect(run.result!.outcome).toBe('family_alerted');
    expect(n.calls).toEqual(['sofia']); // Miguel is never rung
    expect(run.timersFired).toBe(1); // only the all-clear window ran out, not Sofia's
    expect((await steps(incidents, 'inc-door')).map((s) => s.kind)).toEqual([
      'incident_opened',
      'push_sent',
      'call_placed',
      'call_no_answer',
      'caregiver_acknowledged',
      'acknowledgement_lapsed',
      'sms_sent',
      'sms_sent',
      'family_alerted',
    ]);
  });

  it('a caregiver app acknowledgement during the wait, then an all-clear, stands down', async () => {
    const incidents = new InMemoryIncidentRepository();
    const n = new ConfirmingNotifications();
    const run = await runProcess(hero(), incidents, n, {
      signalsAfterCall: { sofia: [[CAREGIVER_ACK_SIGNAL, 'user-sofia'], [RESOLVE_SIGNAL]] },
    });
    expect(run.result!.outcome).toBe('stood_down');
    expect(n.calls).toEqual(['sofia']);
  });

  it('a late press 1 from Sofia while Miguel rings still ends the ladder, credited to Sofia', async () => {
    const incidents = new InMemoryIncidentRepository();
    const n = new ConfirmingNotifications();
    const run = await runProcess(hero(), incidents, n, {
      signalsAfterCall: { miguel: [[CONTACT_CONFIRMED_SIGNAL, 'sofia']] },
    });
    expect(run.result).toMatchObject({ outcome: 'acknowledged', acknowledgedByContactId: 'sofia' });
    const trail = await incidents.listSteps('inc-door');
    expect(trail.at(-1)).toMatchObject({ kind: 'call_answered', detail: { via: 'press_1' } });
    expect((await steps(incidents, 'inc-door')).map((s) => s.kind)).not.toContain('sms_sent');
  });

  it('ignores a confirmation from a contact the ladder has not called', async () => {
    const incidents = new InMemoryIncidentRepository();
    const n = new ConfirmingNotifications();
    const run = await runProcess(hero(), incidents, n, {
      // Delivered before any call is placed: nobody has been asked yet.
      signals: [[CONTACT_CONFIRMED_SIGNAL, 'miguel']],
    });
    expect(run.result!.outcome).toBe('family_alerted');
    expect(n.calls).toEqual(['sofia', 'miguel']);
  });

  it('fall: press 1 from the second contact stops before SMS and 112', async () => {
    const incidents = new InMemoryIncidentRepository();
    const n = new ConfirmingNotifications();
    const run = await runProcess(fallInput(), incidents, n, {
      signalsAfterCall: { c2: [[CONTACT_CONFIRMED_SIGNAL, 'c2']] },
    });
    expect(run.result).toMatchObject({ outcome: 'acknowledged', acknowledgedByContactId: 'c2' });
    // Falls keep the voice check-in gate and the generic call text.
    const kinds = (await steps(incidents, 'inc-fall')).map((s) => s.kind);
    expect(kinds.slice(0, 2)).toEqual(['incident_opened', 'voice_checkin_result']);
    expect(n.spoken).toEqual([undefined, undefined]);
    expect(n.emergencies).toEqual([]);
  });

  it('fall: nobody confirms, so the ladder still reaches 112 after every window', async () => {
    const incidents = new InMemoryIncidentRepository();
    const n = new ConfirmingNotifications();
    const run = await runProcess(fallInput(), incidents, n);
    expect(run.result!.outcome).toBe('emergency_notified');
    expect(n.emergencies).toEqual(['fall.suspected']);
  });

  it('without awaitsConfirmation the ladder does not wait at all (mock, Twilio without callbacks)', async () => {
    const incidents = new InMemoryIncidentRepository();
    const run = await runProcess(hero(), incidents, new RecordingNotifications());
    expect(run.timersFired).toBe(0);
    expect(run.result!.outcome).toBe('family_alerted');
  });
});

describe('escalation workflow: quiet hours are household-local', () => {
  // Quiet 22:00 to 07:00; an unconfirmed fall respects it.
  const sleepy = contact('c1', 0, {
    quietHours: { start: '22:00', end: '07:00', wakeForConfirmedFallOnly: true },
  });
  const run = async (nowIso: string, timeZone?: string): Promise<string[]> => {
    jest.useFakeTimers({
      now: new Date(nowIso),
      doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'],
    });
    try {
      const incidents = new InMemoryIncidentRepository();
      await runProcess(
        fallInput({ contacts: [sleepy, contact('c2', 1)], ...(timeZone ? { timeZone } : {}) }),
        incidents,
        new RecordingNotifications(),
      );
      return (await steps(incidents, 'inc-fall')).map((s) => s.kind);
    } finally {
      jest.useRealTimers();
    }
  };

  it('06:30 UTC is 07:30 in Lisbon (summer): Sofia is awake and is called', async () => {
    const kinds = await run('2026-07-15T06:30:00.000Z', 'Europe/Lisbon');
    expect(kinds).not.toContain('quiet_hours_skipped');
  });

  it('the same instant read as UTC (no timezone, old incidents) is still quiet', async () => {
    const kinds = await run('2026-07-15T06:30:00.000Z');
    expect(kinds).toContain('quiet_hours_skipped');
  });

  it('14:00 UTC is 23:00 in Tokyo: inside quiet hours there, so the contact is skipped', async () => {
    expect(await run('2026-07-15T14:00:00.000Z', 'Asia/Tokyo')).toContain('quiet_hours_skipped');
    expect(await run('2026-07-15T14:00:00.000Z', 'UTC')).not.toContain('quiet_hours_skipped');
  });

  it('an unknown timezone falls back to UTC rather than failing the ladder', async () => {
    expect(await run('2026-07-15T06:30:00.000Z', 'Mars/Olympus')).toContain('quiet_hours_skipped');
  });

  it('a confirmed fall still wakes a contact who opted in, whatever the zone', async () => {
    jest.useFakeTimers({
      now: new Date('2026-07-15T14:00:00.000Z'),
      doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'],
    });
    try {
      const incidents = new InMemoryIncidentRepository();
      await runProcess(
        fallInput({ contacts: [sleepy], timeZone: 'Asia/Tokyo', confirmedFall: true }),
        incidents,
        new RecordingNotifications(),
      );
      expect((await steps(incidents, 'inc-fall')).map((s) => s.kind)).not.toContain(
        'quiet_hours_skipped',
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
