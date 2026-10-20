import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { AppConfig } from '../../config/env.validation';
import { InternalEvent } from '../../internal-events/internal-events';
import { fixture } from './fixtures/load-fixture';
import { InMemoryRingRepository } from './in-memory-ring.repository';
import { signRingBody } from './ring-signature';
import { RingWebhookController } from './ring-webhook.controller';
import { RingWebhookService } from './ring-webhook.service';

const SECRET = 'test-ring-hmac-secret';
const FAMILY = '00000000-0000-4000-8000-0000000000f1';

function configWith(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ringHmacSecret: SECRET,
    ringFamilyId: FAMILY,
    hasRingWebhooks: true,
    ...overrides,
  } as unknown as AppConfig;
}

function setup(config = configWith()) {
  const repo = new InMemoryRingRepository();
  const bus = new EventEmitter2();
  const emitted: Array<{ event: string; payload: unknown }> = [];
  bus.onAny((event, payload) => emitted.push({ event: String(event), payload }));
  const service = new RingWebhookService(config, repo, bus);
  /** Ingest + dispatch, as the controller does. */
  const deliver = async (body: Buffer, simulator = false) => {
    const result = await service.ingest(body, signRingBody(body, SECRET), simulator);
    service.dispatch(result);
    return result;
  };
  return { repo, service, emitted, deliver };
}

describe('RingWebhookService', () => {
  it('answers 503 when webhooks are not configured, before touching anything', async () => {
    const { service, repo } = setup(
      configWith({ hasRingWebhooks: false, ringHmacSecret: undefined }),
    );
    const body = fixture('motion-human.jsonapi');
    await expect(service.ingest(body, signRingBody(body, SECRET), false)).rejects.toMatchObject({
      status: 503,
    });
    expect(await repo.listEvents(FAMILY, 10)).toHaveLength(0);
  });

  it('rejects a missing or invalid signature with 401 and records nothing', async () => {
    const { service, repo } = setup();
    const body = fixture('motion-human.jsonapi');
    await expect(service.ingest(body, undefined, false)).rejects.toMatchObject({ status: 401 });
    await expect(service.ingest(body, signRingBody(body, 'wrong'), false)).rejects.toMatchObject({
      status: 401,
    });
    expect(await repo.listEvents(FAMILY, 10)).toHaveLength(0);
  });

  it('rejects a signed body that is not JSON with 400', async () => {
    const { service } = setup();
    const body = Buffer.from('nope');
    await expect(service.ingest(body, signRingBody(body, SECRET), false)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('records a motion event, auto-creates the camera, and emits RingMotionDetected', async () => {
    const { repo, emitted, deliver } = setup();
    const result = await deliver(fixture('motion-human.jsonapi'));

    const [camera] = await repo.listCameras(FAMILY);
    expect(camera).toMatchObject({
      ringDeviceId: 'ring-dev-front-1',
      name: '',
      placement: 'other',
      lastEventAt: '2026-10-21T02:04:00.000Z',
    });
    const [event] = await repo.listEvents(FAMILY, 10);
    expect(event).toMatchObject({
      ringCameraId: camera!.id,
      kind: 'motion',
      subType: 'human',
      source: 'ring',
      rawType: 'motion_detected',
    });
    expect(emitted).toEqual([
      {
        event: InternalEvent.RingMotionDetected,
        payload: {
          familyId: FAMILY,
          ringCameraId: camera!.id,
          ringEventId: event!.id,
          placement: 'other',
          subType: 'human',
          occurredAt: '2026-10-21T02:04:00.000Z',
          source: 'ring',
        },
      },
    ]);
    expect(result.ringEventId).toBe(event!.id);
  });

  it('is idempotent: a redelivery records once and emits once', async () => {
    const { repo, emitted, deliver } = setup();
    const first = await deliver(fixture('button-press.flat'));
    const second = await deliver(fixture('button-press.flat'));

    expect(first.recorded).toBe(true);
    expect(second.recorded).toBe(false);
    expect(await repo.listEvents(FAMILY, 10)).toHaveLength(1);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.event).toBe(InternalEvent.RingButtonPressed);
  });

  it('carries the caregiver-set placement and labels simulator traffic', async () => {
    const { repo, emitted, deliver } = setup();
    const camera = await repo.ensureCamera(FAMILY, 'ring-dev-front-1');
    await repo.setPlacement(FAMILY, camera.id, 'front_door');

    await deliver(fixture('motion-human.jsonapi'), true);

    expect(emitted[0]!.payload).toMatchObject({ placement: 'front_door', source: 'simulator' });
    expect((await repo.listEvents(FAMILY, 1))[0]!.source).toBe('simulator');
    expect(await repo.listCameras(FAMILY)).toHaveLength(1); // reused, not duplicated
  });

  it('tracks online state from device_online / device_offline without emitting', async () => {
    const { repo, emitted, deliver } = setup();
    await deliver(fixture('device-offline')); // 2026-10-20T00:00:00Z
    expect((await repo.listCameras(FAMILY))[0]!.online).toBe(false);

    await deliver(fixture('device-online')); // 2026-10-21T09:00:00Z
    expect((await repo.listCameras(FAMILY))[0]!.online).toBe(true);
    expect(emitted).toHaveLength(0);
  });

  it('does not let a late, older offline flip a newer online', async () => {
    const { repo, deliver } = setup();
    await deliver(fixture('device-online')); // newer
    await deliver(fixture('device-offline')); // older, arrives late
    expect((await repo.listCameras(FAMILY))[0]!.online).toBe(true);
  });

  it('records unknown event types without a camera and without emitting', async () => {
    const { repo, emitted, deliver } = setup();
    await deliver(fixture('unknown-type'));
    expect(await repo.listCameras(FAMILY)).toHaveLength(0);
    expect((await repo.listEvents(FAMILY, 1))[0]).toMatchObject({
      kind: 'other',
      rawType: 'battery_low',
      ringCameraId: null,
    });
    expect(emitted).toHaveLength(0);
  });

  it('a listener that throws never breaks intake', async () => {
    const bus = new EventEmitter2();
    bus.on(InternalEvent.RingMotionDetected, () => {
      throw new Error('listener boom');
    });
    const svc = new RingWebhookService(configWith(), new InMemoryRingRepository(), bus);
    const body = fixture('motion-human.jsonapi');
    const result = await svc.ingest(body, signRingBody(body, SECRET), false);
    expect(result.pending).not.toBeNull();
    expect(() => svc.dispatch(result)).not.toThrow();
  });
});

describe('POST /ring/webhook (HTTP, raw body)', () => {
  let app: INestApplication;
  let repo: InMemoryRingRepository;
  const emitted: string[] = [];

  beforeAll(async () => {
    repo = new InMemoryRingRepository();
    const bus = new EventEmitter2();
    bus.onAny((event) => emitted.push(String(event)));
    const moduleRef = await Test.createTestingModule({
      controllers: [RingWebhookController],
      providers: [
        { provide: RingWebhookService, useValue: new RingWebhookService(configWith(), repo, bus) },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('verifies the signature over the exact bytes sent, then answers 200', async () => {
    // Odd spacing on purpose: a re-serialized body would not match the signature.
    const raw = '{ "event_type" :"button_press",  "event_id":"http-1", "device_id":"cam-9" }';
    const res = await request(app.getHttpServer())
      .post('/ring/webhook')
      .set('content-type', 'application/json')
      .set('x-signature', signRingBody(raw, SECRET))
      .send(raw)
      .expect(200);
    expect(res.body).toEqual({ ok: true, duplicate: false });

    await new Promise((r) => setImmediate(r));
    expect(emitted).toContain(InternalEvent.RingButtonPressed);

    const again = await request(app.getHttpServer())
      .post('/ring/webhook')
      .set('content-type', 'application/json')
      .set('x-signature', signRingBody(raw, SECRET))
      .send(raw)
      .expect(200);
    expect(again.body).toEqual({ ok: true, duplicate: true });
  });

  it('answers 401 for a bad signature', async () => {
    const raw = '{"event_type":"button_press","event_id":"http-2","device_id":"cam-9"}';
    await request(app.getHttpServer())
      .post('/ring/webhook')
      .set('content-type', 'application/json')
      .set('x-signature', signRingBody(raw, 'not-the-secret'))
      .send(raw)
      .expect(401);
    await request(app.getHttpServer())
      .post('/ring/webhook')
      .set('content-type', 'application/json')
      .send(raw)
      .expect(401);
  });

  it('marks simulator traffic from the header', async () => {
    const raw = '{"event_type":"motion_detected","event_id":"http-3","device_id":"cam-9"}';
    await request(app.getHttpServer())
      .post('/ring/webhook')
      .set('content-type', 'application/json')
      .set('x-signature', signRingBody(raw, SECRET))
      .set('x-obrigada-simulator', '1')
      .send(raw)
      .expect(200);
    const latest = (await repo.listEvents(FAMILY, 10)).find(
      (e) => e.ringEventKey === 'ring:http-3',
    );
    expect(latest?.source).toBe('simulator');
  });
});
