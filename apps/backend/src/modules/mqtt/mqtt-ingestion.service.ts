import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { readFileSync } from 'node:fs';
import { connectAsync, type IClientOptions, type MqttClient } from 'mqtt';
import {
  type DeviceCommandMessage,
  eventEnvelopeSchema,
  heartbeatMessageSchema,
  MQTT_TOPIC_ROOT,
  mqttTopics,
} from '@obrigada/shared';
import { AppConfig } from '../../config/env.validation';
import {
  InternalEvent,
  type DeviceCommandIssuedPayload,
} from '../../internal-events/internal-events';
import { EventsService } from '../events/events.service';
import { FleetService } from '../fleet/fleet.service';

interface ParsedTopic {
  deviceId: string;
  kind: 'events' | 'heartbeat';
}

/**
 * The device link: subscribes to the guardian fleet's event and heartbeat topics
 * over mutual-TLS MQTT and ingests messages. Every payload is validated with the
 * shared zod schemas (rule #1 media rejection happens here), and the device id in
 * the body must match the topic — defense-in-depth on top of the broker's
 * per-device ACL. Idempotent ingestion makes QoS-1 redelivery and offline replay
 * lossless and duplicate-free.
 */
@Injectable()
export class MqttIngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttIngestionService.name);
  private client: MqttClient | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly events: EventsService,
    private readonly fleet: FleetService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.hasMqtt) {
      this.logger.log('MQTT_URL not set; device link disabled (skeleton mode)');
      return;
    }
    const url = this.config.mqttUrl!;
    const options = this.buildTlsOptions();

    this.client = await connectAsync(url, options);
    this.logger.log(`Connected to MQTT broker at ${url}`);

    // Wildcard subscriptions across the fleet; per-device isolation is the broker's
    // ACL job. QoS 1 so alerts are delivered at least once.
    const eventsTopic = mqttTopics.events('+');
    const heartbeatTopic = mqttTopics.heartbeat('+');
    await this.client.subscribeAsync([eventsTopic, heartbeatTopic], { qos: 1 });
    this.logger.log(`Subscribed to ${eventsTopic} and ${heartbeatTopic}`);

    this.client.on('message', (topic, payload) => {
      void this.handleMessage(topic, payload).catch((error) => {
        this.logger.error(`Failed handling message on ${topic}: ${(error as Error).message}`);
      });
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.endAsync();
  }

  /**
   * Device-link status for the readiness probe. `configured:false` means MQTT is
   * intentionally off (skeleton mode); when configured, `connected` reflects the
   * live broker connection.
   */
  status(): { configured: boolean; connected: boolean } {
    return { configured: this.config.hasMqtt, connected: this.client?.connected ?? false };
  }

  /**
   * Deliver a caregiver-issued command to its guardian (F2.6). Publishes to the device's
   * own command topic at QoS 1 (at-least-once; the commandId lets the device dedupe). In
   * skeleton mode, or if the broker link is down, it logs the intent — the command is
   * already durably recorded, so a later reconnect/ops can still act on it.
   */
  @OnEvent(InternalEvent.DeviceCommandIssued)
  async onDeviceCommandIssued(payload: DeviceCommandIssuedPayload): Promise<void> {
    const message: DeviceCommandMessage = {
      commandId: payload.commandId,
      command: payload.command,
      issuedAt: payload.issuedAt,
    };
    const topic = mqttTopics.commands(payload.deviceId);
    if (!this.client?.connected) {
      this.logger.warn(
        `Device link down; ${payload.command} command ${payload.commandId} for device ` +
          `${payload.deviceId} is recorded but not yet delivered`,
      );
      return;
    }
    try {
      await this.client.publishAsync(topic, JSON.stringify(message), { qos: 1 });
      this.logger.log(
        `Sent ${payload.command} command ${payload.commandId} to ${payload.deviceId}`,
      );
    } catch (error) {
      // The command is durably recorded; never throw out of an event handler.
      this.logger.error(
        `Failed to publish command ${payload.commandId}: ${(error as Error).message}`,
      );
    }
  }

  private buildTlsOptions(): IClientOptions {
    const options: IClientOptions = { rejectUnauthorized: true };
    if (this.config.mqttCaPath) options.ca = readFileSync(this.config.mqttCaPath);
    if (this.config.mqttCertPath) options.cert = readFileSync(this.config.mqttCertPath);
    if (this.config.mqttKeyPath) options.key = readFileSync(this.config.mqttKeyPath);
    return options;
  }

  private parseTopic(topic: string): ParsedTopic | null {
    const parts = topic.split('/');
    if (parts.length !== 4) return null;
    const [root, dev, deviceId, kind] = parts;
    if (root !== MQTT_TOPIC_ROOT || dev !== 'dev' || !deviceId) return null;
    if (kind !== 'events' && kind !== 'heartbeat') return null;
    return { deviceId, kind };
  }

  /** Routes one message. Public so it can be unit-tested without a broker. */
  async handleMessage(topic: string, payload: Buffer): Promise<void> {
    const parsed = this.parseTopic(topic);
    if (!parsed) {
      this.logger.warn(`Ignoring message on unrecognized topic: ${topic}`);
      return;
    }

    let json: unknown;
    try {
      json = JSON.parse(payload.toString('utf8'));
    } catch {
      this.logger.warn(`Dropping non-JSON message on ${topic}`);
      return;
    }

    if (parsed.kind === 'events') {
      const result = eventEnvelopeSchema.safeParse(json);
      if (!result.success) {
        this.logger.warn(`Invalid event envelope on ${topic}: ${result.error.message}`);
        return;
      }
      if (result.data.deviceId !== parsed.deviceId) {
        this.logger.warn(
          `Device id mismatch on ${topic}: body claims ${result.data.deviceId}; dropping`,
        );
        return;
      }
      await this.events.ingest(result.data);
      return;
    }

    const result = heartbeatMessageSchema.safeParse(json);
    if (!result.success) {
      this.logger.warn(`Invalid heartbeat on ${topic}: ${result.error.message}`);
      return;
    }
    await this.fleet.recordHeartbeat(
      {
        deviceId: parsed.deviceId,
        time: result.data.time,
        batteryPct: result.data.batteryPct ?? null,
        thermalC: result.data.thermalC ?? null,
        appVersion: result.data.appVersion ?? null,
        models: result.data.models ?? null,
      },
      Date.now(),
    );
  }
}
