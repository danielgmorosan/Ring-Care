import { EventEmitter2 } from '@nestjs/event-emitter';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import type { Client } from '@temporalio/client';
import { AppConfig } from '../src/config/env.validation';
import { CanaryService } from '../src/modules/canary/canary.service';
import { EscalationService } from '../src/modules/escalation/escalation.service';
import { InMemoryContactRepository } from '../src/modules/escalation/in-memory-contact.repository';
import { InMemoryIncidentRepository } from '../src/modules/escalation/in-memory-incident.repository';
import type { NotificationPort } from '../src/modules/escalation/notifications/notification.port';
import { createEscalationActivities } from '../src/modules/escalation/temporal/activities.impl';

const workflowsPath = require.resolve('../src/modules/escalation/temporal/workflows');

const noopNotifications: NotificationPort = {
  async placeCall() {
    return { answered: false };
  },
  async sendSms() {},
  async pushCriticalAlert() {},
  async pushDeviceAlert() {},
  async notifyEmergency() {},
};

// The canary family has no registered devices; escalation asks for an empty list.
const noPushTokens = {
  listForFamily: async () => [],
} as unknown as import('../src/modules/push/push-tokens.service').PushTokensService;

/**
 * End-to-end proof that the canary genuinely drives the durable escalation
 * pipeline: it starts a real workflow on a real worker (time-skipping test server)
 * and reports healthy only after the incident reaches a terminal, audited state.
 */
describe('CanaryService against the real escalation pipeline', () => {
  let env: TestWorkflowEnvironment;

  beforeAll(async () => {
    env = await TestWorkflowEnvironment.createTimeSkipping();
  }, 60_000);

  afterAll(async () => {
    await env?.teardown();
  });

  it('runs a synthetic fall end-to-end and reports healthy', async () => {
    const taskQueue = 'canary-tq';
    const config = {
      temporalTaskQueue: taskQueue,
      canaryFamilyId: 'fam-canary',
      canaryDeviceId: 'dev-canary',
      canaryIntervalSeconds: 3600,
      canaryEnabled: true,
      hasTemporal: true,
    } as unknown as AppConfig;

    const incidents = new InMemoryIncidentRepository();
    const contacts = new InMemoryContactRepository(); // empty chain → ladder → emergency
    const escalation = new EscalationService(
      config,
      env.client as Client,
      incidents,
      contacts,
      noPushTokens,
    );
    const canary = new CanaryService(config, escalation, new EventEmitter2());

    const worker = await Worker.create({
      connection: env.nativeConnection,
      taskQueue,
      workflowsPath,
      activities: createEscalationActivities({ incidents, notifications: noopNotifications }),
    });

    const run = await worker.runUntil(canary.runOnce());

    expect(run.ok).toBe(true);
    expect(run.outcome).toBe('emergency_notified');
    expect(run.latencyMs).toEqual(expect.any(Number));
  }, 60_000);
});
