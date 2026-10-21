import { GetContactAttributesCommand } from '@aws-sdk/client-connect';
import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { AppConfig } from '../../../config/env.validation';
import { EscalationService } from '../escalation.service';
import {
  CONFIRMED_ATTRIBUTE,
  CONNECT_CLIENT,
  awsErrorSummary,
  describeAwsError,
  type ConnectSender,
} from './connect.client';

/** How often the poller asks Connect whether the contact pressed 1. */
export const CONNECT_POLL_INTERVAL_MS = 3_000;
/**
 * Extra time after the ack window during which a late press 1 still counts. The window
 * starts when the call is requested, but ringing, answering and hearing the message take
 * time; the workflow accepts a late press from an earlier contact while later ones ring.
 */
export const CONNECT_CONFIRM_GRACE_SECONDS = 30;

export const POLLER_TIMING = Symbol('CONNECT_POLLER_TIMING');
export interface PollerTiming {
  intervalMs: number;
  graceSeconds: number;
  now: () => number;
}

export interface WatchCallInput {
  incidentId: string;
  contactId: string;
  /** The ContactId StartOutboundVoiceContact returned. */
  connectContactId: string;
  /** The ack window the workflow waits for this contact. */
  windowSeconds: number;
}

export type StopReason = 'confirmed' | 'timeout' | 'workflow_ended' | 'replaced' | 'shutdown';

interface ActiveCall extends WatchCallInput {
  key: string;
  deadline: number;
  timer: NodeJS.Timeout | null;
}

/**
 * Press 1 for Amazon Connect calls (decision 0014), without a public callback URL. The
 * contact flow stores the key press as the contact attribute `confirmed` = "1"; this
 * polls GetContactAttributes for each active call and, on a confirmation, signals the
 * workflow through the same path as Twilio's callback (EscalationService.confirmByCall),
 * so the trail records the same `call_answered` { via: 'press_1' } step.
 *
 * State is an in-memory registry, deliberately: if the backend restarts mid-call the
 * confirmation is simply not heard and the workflow's own timer moves the ladder on, the
 * same safe default as a contact who never pressed anything. Every failure (throttling,
 * a missing contact, bad credentials) is logged by AWS error name only and polling carries
 * on until the deadline. Nothing here can stop or skip a step of the ladder.
 */
@Injectable()
export class ConnectConfirmationPoller implements OnModuleDestroy {
  private readonly logger = new Logger(ConnectConfirmationPoller.name);
  private readonly active = new Map<string, ActiveCall>();
  private readonly timing: PollerTiming;

  constructor(
    @Inject(CONNECT_CLIENT) private readonly client: ConnectSender | null,
    private readonly config: AppConfig,
    private readonly escalation: EscalationService,
    @Optional() @Inject(POLLER_TIMING) timing?: Partial<PollerTiming>,
  ) {
    this.timing = {
      intervalMs: timing?.intervalMs ?? CONNECT_POLL_INTERVAL_MS,
      graceSeconds: timing?.graceSeconds ?? CONNECT_CONFIRM_GRACE_SECONDS,
      now: timing?.now ?? Date.now,
    };
  }

  /** Start polling one call. A retried call for the same incident and contact replaces it. */
  watch(input: WatchCallInput): void {
    if (!this.client) {
      this.logger.warn(`No Connect client; cannot listen for press 1 on ${input.incidentId}`);
      return;
    }
    const key = `${input.incidentId}:${input.contactId}`;
    const existing = this.active.get(key);
    if (existing?.connectContactId === input.connectContactId) return;
    if (existing) this.stop(key, 'replaced');
    const deadline =
      this.timing.now() + (Math.max(0, input.windowSeconds) + this.timing.graceSeconds) * 1000;
    this.active.set(key, { ...input, key, deadline, timer: null });
    this.schedule(key, this.timing.intervalMs);
  }

  /** How many calls are being polled (for tests and health). */
  get activeCount(): number {
    return this.active.size;
  }

  isWatching(incidentId: string, contactId: string): boolean {
    return this.active.has(`${incidentId}:${contactId}`);
  }

  onModuleDestroy(): void {
    for (const key of [...this.active.keys()]) this.stop(key, 'shutdown');
  }

  private schedule(key: string, delayMs: number): void {
    const call = this.active.get(key);
    if (!call) return;
    call.timer = setTimeout(() => void this.tick(key), delayMs);
    call.timer.unref?.();
  }

  private stop(key: string, reason: StopReason): void {
    const call = this.active.get(key);
    if (!call) return;
    if (call.timer) clearTimeout(call.timer);
    this.active.delete(key);
    this.logger.log(
      `Stopped listening for press 1 on incident ${call.incidentId}, contact ${call.contactId} (${reason})`,
    );
  }

  /** One poll. Never throws: every outcome either reschedules or stops. */
  private async tick(key: string): Promise<void> {
    const call = this.active.get(key);
    if (!call) return;
    call.timer = null;
    if (this.timing.now() >= call.deadline) return this.stop(key, 'timeout');

    if (!(await this.escalation.isEscalationRunning(call.incidentId))) {
      return this.stop(key, 'workflow_ended');
    }

    let confirmed = false;
    let delay = this.timing.intervalMs;
    try {
      const out = await this.client!.send(
        new GetContactAttributesCommand({
          InstanceId: this.config.connectInstanceId,
          InitialContactId: call.connectContactId,
        }),
      );
      confirmed = out.Attributes?.[CONFIRMED_ATTRIBUTE] === '1';
    } catch (err) {
      const { name } = awsErrorSummary(err);
      // Back off a little when Connect asks us to; anything else just tries again.
      if (name === 'ThrottlingException' || name === 'TooManyRequestsException') delay *= 2;
      this.logger.warn(
        `GetContactAttributes failed for incident ${call.incidentId}: ${describeAwsError(err)}`,
      );
    }
    if (!this.active.has(key)) return; // stopped while we waited

    if (!confirmed) return this.schedule(key, delay);

    // Stop first, so a confirmation can only ever be delivered once.
    this.stop(key, 'confirmed');
    try {
      await this.escalation.confirmByCall(call.incidentId, call.contactId, 'connect');
    } catch (error) {
      // The incident is unknown or its workflow already finished: nothing to stop.
      const message = error instanceof Error ? error.name : 'Error';
      this.logger.warn(`Press 1 for incident ${call.incidentId} not delivered: ${message}`);
    }
  }
}
