import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { connectAsync, type MqttClient } from 'mqtt';
import { mqttTopics } from '@obrigada/shared';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { OfflineSweepService } from '../src/modules/fleet/offline-sweep.service';

/**
 * Simulated-guardian integration test — requires a migrated Postgres AND a running
 * mutual-TLS EMQX broker with dev certs generated for TEST_DEVICE_ID. Skipped when
 * any of those is absent; CI brings up the compose stack and provides them.
 *
 * Proves the F0.3 "done when": zero event loss across replays and the guardian
 * offline alert firing.
 */
const MQTT_URL = process.env.MQTT_URL;
const DATABASE_URL = process.env.DATABASE_URL;
// A device is identified by its certificate CN, which equals its devices.id (uuid).
const DEVICE_ID = process.env.TEST_DEVICE_ID ?? '00000000-0000-4000-8000-000000000001';
const deviceCertDir = resolve(__dirname, `../../../certs/devices/${DEVICE_ID}`);

const enabled = Boolean(MQTT_URL && DATABASE_URL && existsSync(deviceCertDir));
const describeMaybe = enabled ? describe : describe.skip;

async function pollUntil<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 8000,
  stepMs = 150,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (predicate(value)) return value;
    if (Date.now() - start > timeoutMs) throw new Error('pollUntil timed out');
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

describeMaybe('MQTT device link (integration)', () => {
  let app: INestApplication;
  let pool: Pool;
  let device: MqttClient;

  const eventId = '11111111-1111-4111-8111-111111111111';
  const occurredAt = '2026-07-06T18:00:00.000Z';

  const eventCount = async (): Promise<number> => {
    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM event_stream WHERE device_id = $1 AND event_id = $2`,
      [DEVICE_ID, eventId],
    );
    return rows[0]!.n;
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });

    // Seed a family and the device row so the event_stream FK is satisfied. The
    // device's id equals the certificate CN the simulated client connects with.
    const fam = await pool.query<{ id: string }>(
      `INSERT INTO families (name) VALUES ('MQTT sim') RETURNING id`,
    );
    await pool.query(
      `INSERT INTO devices (id, family_id, name) VALUES ($1, $2, 'sim')
       ON CONFLICT (id) DO NOTHING`,
      [DEVICE_ID, fam.rows[0]!.id],
    );

    // Boot the backend — it connects to the broker (as CN=backend) and subscribes.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    // Connect the simulated guardian using its own device certificate (CN=DEVICE_ID).
    device = await connectAsync(MQTT_URL!, {
      ca: readFileSync(resolve(deviceCertDir, 'ca.crt')),
      cert: readFileSync(resolve(deviceCertDir, 'tls.crt')),
      key: readFileSync(resolve(deviceCertDir, 'tls.key')),
      rejectUnauthorized: true,
    });
  }, 30_000);

  afterAll(async () => {
    await device?.endAsync();
    await app?.close();
    await pool?.end();
  });

  const publishEvent = (): Promise<void> =>
    device.publishAsync(
      mqttTopics.events(DEVICE_ID),
      JSON.stringify({
        eventId,
        deviceId: DEVICE_ID,
        type: 'fall.suspected',
        occurredAt,
        confidence: 0.94,
        payload: {},
      }),
      { qos: 1 },
    ) as unknown as Promise<void>;

  it('ingests an event the device publishes over mutual-TLS MQTT', async () => {
    await publishEvent();
    const n = await pollUntil(eventCount, (c) => c >= 1);
    expect(n).toBe(1);
  });

  it('dedups a replayed event — zero event loss, no double count', async () => {
    await publishEvent();
    await publishEvent();
    // Give the broker+backend a beat, then assert it is still exactly one row.
    await new Promise((r) => setTimeout(r, 500));
    expect(await eventCount()).toBe(1);
  });

  it('records heartbeats', async () => {
    await device.publishAsync(
      mqttTopics.heartbeat(DEVICE_ID),
      JSON.stringify({ time: occurredAt, batteryPct: 80 }),
      { qos: 1 },
    );
    const beats = await pollUntil(
      async () => {
        const { rows } = await pool.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM heartbeats WHERE device_id = $1`,
          [DEVICE_ID],
        );
        return rows[0]!.n;
      },
      (c) => c >= 1,
    );
    expect(beats).toBeGreaterThanOrEqual(1);
  });

  it('fires the guardian-offline alert when heartbeats stop', async () => {
    // Force a sweep far in the future rather than waiting out the real threshold.
    const sweep = app.get(OfflineSweepService);
    const future = Date.now() + 10 * 60 * 1000;
    const newlyOffline = await sweep.sweep(future);
    expect(newlyOffline.some((d) => d.deviceId === DEVICE_ID)).toBe(true);

    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM event_stream
       WHERE device_id = $1 AND type = 'guardian.offline'`,
      [DEVICE_ID],
    );
    expect(rows[0]!.n).toBeGreaterThanOrEqual(1);
  });
});
