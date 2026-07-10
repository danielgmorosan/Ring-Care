import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NativeConnection, Worker } from '@temporalio/worker';
import { AppConfig } from '../../config/env.validation';
import { INCIDENT_REPOSITORY, type IncidentRepository } from './incident.repository';
import { NOTIFICATION_PORT, type NotificationPort } from './notifications/notification.port';
import { createEscalationActivities } from './temporal/activities.impl';

/**
 * Runs the Temporal worker that executes escalation workflows and activities.
 * Only starts when Temporal is configured; otherwise the escalation engine is
 * dormant (skeleton mode). The worker is what makes escalation crash-proof: it can
 * die and restart and Temporal resumes every in-flight incident from history.
 */
@Injectable()
export class EscalationWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EscalationWorkerService.name);
  private worker: Worker | null = null;
  private running: Promise<void> | null = null;
  private connection: NativeConnection | null = null;

  constructor(
    private readonly config: AppConfig,
    @Inject(INCIDENT_REPOSITORY) private readonly incidents: IncidentRepository,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.hasTemporal) {
      this.logger.log('TEMPORAL_ADDRESS not set; escalation worker disabled (skeleton mode)');
      return;
    }
    this.connection = await NativeConnection.connect({ address: this.config.temporalAddress });
    this.worker = await Worker.create({
      connection: this.connection,
      namespace: this.config.temporalNamespace,
      taskQueue: this.config.temporalTaskQueue,
      workflowsPath: require.resolve('./temporal/workflows'),
      activities: createEscalationActivities({
        incidents: this.incidents,
        notifications: this.notifications,
      }),
    });
    this.running = this.worker.run();
    this.logger.log(`Escalation worker running on task queue ${this.config.temporalTaskQueue}`);
  }

  async onModuleDestroy(): Promise<void> {
    this.worker?.shutdown();
    await this.running?.catch(() => undefined);
    await this.connection?.close();
  }
}
