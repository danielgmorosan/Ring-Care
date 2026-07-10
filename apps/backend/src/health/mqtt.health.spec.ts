import type { HealthIndicatorService } from '@nestjs/terminus';
import type { MqttIngestionService } from '../modules/mqtt/mqtt-ingestion.service';
import { MqttHealthIndicator } from './mqtt.health';

/** Minimal stand-in for the terminus session returned by health.check(key). */
function fakeHealth(): HealthIndicatorService {
  return {
    check: (key: string) => ({
      up: (data?: object) => ({ [key]: { status: 'up', ...data } }),
      down: (data?: object) => ({ [key]: { status: 'down', ...data } }),
    }),
  } as unknown as HealthIndicatorService;
}

function indicator(status: { configured: boolean; connected: boolean }): MqttHealthIndicator {
  const mqtt = { status: () => status } as unknown as MqttIngestionService;
  return new MqttHealthIndicator(fakeHealth(), mqtt);
}

describe('MqttHealthIndicator', () => {
  it('is up with configured:false when MQTT is intentionally off (skeleton mode)', () => {
    expect(indicator({ configured: false, connected: false }).check()).toEqual({
      mqtt: { status: 'up', configured: false },
    });
  });

  it('is up when configured and connected to the broker', () => {
    expect(indicator({ configured: true, connected: true }).check()).toEqual({
      mqtt: { status: 'up' },
    });
  });

  it('is down when configured but the device link is severed', () => {
    expect(indicator({ configured: true, connected: false }).check()).toEqual({
      mqtt: { status: 'down', message: 'broker not connected' },
    });
  });
});
