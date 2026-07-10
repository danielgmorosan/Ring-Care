import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { MqttIngestionService } from '../modules/mqtt/mqtt-ingestion.service';

/**
 * Readiness indicator for the MQTT device link. Mirrors the database indicators:
 * when MQTT is not configured (skeleton mode) it reports up with configured:false;
 * when configured but the broker connection is down, it reports down — the device
 * link being severed is a real, alertable outage for a safety system.
 */
@Injectable()
export class MqttHealthIndicator {
  constructor(
    private readonly health: HealthIndicatorService,
    private readonly mqtt: MqttIngestionService,
  ) {}

  check(key = 'mqtt'): HealthIndicatorResult {
    const indicator = this.health.check(key);
    const { configured, connected } = this.mqtt.status();
    if (!configured) {
      return indicator.up({ configured: false });
    }
    return connected ? indicator.up() : indicator.down({ message: 'broker not connected' });
  }
}
