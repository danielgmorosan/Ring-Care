import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Client } from '@temporalio/client';
import { v4 as uuidv4 } from 'uuid';
import { AppConfig } from '../../config/env.validation';
import { PushTokensService } from '../push/push-tokens.service';
import { CONTACT_REPOSITORY, type ContactRepository } from './contact.repository';
import { INCIDENT_REPOSITORY, type IncidentRepository } from './incident.repository';
import { TEMPORAL_CLIENT } from './temporal/temporal.tokens';
import type { EscalationInput, EscalationResult, VoiceCheckinResult } from './temporal/types';
import {
  ackSignal,
  caregiverAckSignal,
  checkinSignal,
  escalationWorkflow,
  resolveSignal,
} from './temporal/workflows';

export interface StartEscalationParams {
  familyId: string;
  deviceId: string;
  reason: string;
  triggeringEventId?: string | null;
  confirmedFall?: boolean;
  initialCheckin?: VoiceCheckinResult;
  ackWindowSeconds?: number;
}

/** Default ring time per contact ("call the daughter, wait 45s, call the son"). */
const DEFAULT_ACK_WINDOW_SECONDS = 45;

/**
 * Opens incidents and drives the durable escalation workflow. The workflow — not
 * this service, and never an LLM — decides whether help is summoned.
 */
@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);

  constructor(
    private readonly config: AppConfig,
    @Inject(TEMPORAL_CLIENT) private readonly client: Client | null,
    @Inject(INCIDENT_REPOSITORY) private readonly incidents: IncidentRepository,
    @Inject(CONTACT_REPOSITORY) private readonly contacts: ContactRepository,
    private readonly pushTokens: PushTokensService,
  ) {}

  private workflowId(incidentId: string): string {
    return `incident-${incidentId}`;
  }

  private requireClient(): Client {
    if (!this.client) {
      throw new ServiceUnavailableException('Escalation engine is not configured');
    }
    return this.client;
  }

  async startEscalation(params: StartEscalationParams): Promise<{ incidentId: string }> {
    const client = this.requireClient();
    const incidentId = uuidv4();

    await this.incidents.open({
      id: incidentId,
      familyId: params.familyId,
      deviceId: params.deviceId,
      triggeringEventId: params.triggeringEventId ?? null,
      reason: params.reason,
      openedAt: new Date().toISOString(),
    });

    const input: EscalationInput = {
      incidentId,
      familyId: params.familyId,
      deviceId: params.deviceId,
      reason: params.reason,
      confirmedFall: params.confirmedFall ?? false,
      contacts: await this.contacts.listByFamily(params.familyId),
      pushDevices: (await this.pushTokens.listForFamily(params.familyId)).map((t) => t.token),
      ackWindowSeconds: params.ackWindowSeconds ?? DEFAULT_ACK_WINDOW_SECONDS,
      initialCheckin: params.initialCheckin ?? 'pending',
    };

    await client.workflow.start(escalationWorkflow, {
      taskQueue: this.config.temporalTaskQueue,
      workflowId: this.workflowId(incidentId),
      args: [input],
    });
    this.logger.log(`Started escalation ${incidentId} (${params.reason})`);
    return { incidentId };
  }

  /**
   * Confirm the incident belongs to the family before touching its workflow. Without
   * this, a caregiver could signal another family's incident — e.g. stand down someone
   * else's fall by delivering "i_am_fine". A missing or foreign incident is a 404 (we
   * do not reveal that it exists).
   */
  private async assertOwnership(incidentId: string, familyId: string): Promise<void> {
    const incident = await this.incidents.findById(incidentId);
    if (!incident || incident.familyId !== familyId) {
      throw new NotFoundException(`Incident ${incidentId} not found`);
    }
  }

  async deliverCheckin(
    incidentId: string,
    result: VoiceCheckinResult,
    familyId: string,
  ): Promise<void> {
    await this.assertOwnership(incidentId, familyId);
    const handle = this.requireClient().workflow.getHandle(this.workflowId(incidentId));
    await handle.signal(checkinSignal, result);
  }

  /**
   * Route a guardian's on-device voice check-in result (F1.3) to the incident its fall
   * opened. Unlike deliverCheckin (the caregiver-facing endpoint), there is no family
   * ownership check: the event arrived over the device's own mutual-TLS topic, which is
   * authoritative for that device. If no incident is open, the check-in is a harmless
   * no-op (e.g. the ladder already stood down or was never started).
   */
  async recordDeviceCheckin(deviceId: string, result: VoiceCheckinResult): Promise<void> {
    if (!this.client) return; // engine not configured; nothing to signal
    const incident = await this.incidents.findActiveForDevice(deviceId);
    if (!incident) {
      this.logger.warn(`On-device check-in from ${deviceId} with no active incident; ignoring`);
      return;
    }
    const handle = this.client.workflow.getHandle(this.workflowId(incident.id));
    await handle.signal(checkinSignal, result);
    this.logger.log(`Delivered on-device check-in (${result}) to incident ${incident.id}`);
  }

  async acknowledge(incidentId: string, contactId: string, familyId: string): Promise<void> {
    await this.assertOwnership(incidentId, familyId);
    const handle = this.requireClient().workflow.getHandle(this.workflowId(incidentId));
    await handle.signal(ackSignal, contactId);
  }

  /**
   * A caregiver acknowledges an incident from the app — "I'm handling this" (0008). This is
   * provisional: it holds escalation for a bounded window, then resumes unless the caregiver
   * sends an all-clear ([resolve]). `who` identifies the caregiver for the audit trail.
   */
  async caregiverAcknowledge(incidentId: string, familyId: string, who: string): Promise<void> {
    await this.assertOwnership(incidentId, familyId);
    const handle = this.requireClient().workflow.getHandle(this.workflowId(incidentId));
    await handle.signal(caregiverAckSignal, who);
  }

  /** A caregiver's "All clear" that resolves an acknowledged incident (0008). */
  async resolve(incidentId: string, familyId: string): Promise<void> {
    await this.assertOwnership(incidentId, familyId);
    const handle = this.requireClient().workflow.getHandle(this.workflowId(incidentId));
    await handle.signal(resolveSignal);
  }

  /** Await the workflow's terminal result, bounded by a timeout (used by the canary). */
  async awaitOutcome(incidentId: string, timeoutMs = 60_000): Promise<EscalationResult> {
    const handle = this.requireClient().workflow.getHandle(this.workflowId(incidentId));
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('escalation result timed out')), timeoutMs);
    });
    try {
      return (await Promise.race([handle.result(), timeout])) as EscalationResult;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** The ordered step kinds recorded for an incident (used by the canary to verify audit). */
  async getIncidentStepKinds(incidentId: string): Promise<string[]> {
    return this.incidents.listStepKinds(incidentId);
  }
}
