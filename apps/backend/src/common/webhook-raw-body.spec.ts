import { Body, Controller, INestApplication, Module, Post } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppConfig } from '../config/env.validation';
import { BeeIngestService } from '../modules/bee/bee-ingest.service';
import { BeeWebhookController } from '../modules/bee/bee-webhook.controller';
import { InMemoryRingRepository } from '../modules/ring/in-memory-ring.repository';
import { RING_REPOSITORY } from '../modules/ring/ring.repository';
import { signRingBody } from '../modules/ring/ring-signature';
import { RingWebhookController } from '../modules/ring/ring-webhook.controller';
import { RingWebhookService } from '../modules/ring/ring-webhook.service';
import { installRawWebhookBodies } from './webhook-raw-body';

const RING_SECRET = 'test-ring-hmac-secret';
const BEE_SECRET = 'a-webhook-secret-of-32-characters!';
const FAMILY = '00000000-0000-4000-8000-0000000000f1';

@Controller('echo')
class EchoController {
  @Post()
  echo(@Body() body: unknown): unknown {
    return { body };
  }
}

/** The app as main.ts builds it: rawBody: true, raw webhook readers mounted before init. */
describe('raw webhook bodies (main.ts wiring)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let repo: InMemoryRingRepository;
  const beeBodies: unknown[] = [];

  beforeAll(async () => {
    repo = new InMemoryRingRepository();
    const config = {
      ringHmacSecret: RING_SECRET,
      ringFamilyId: FAMILY,
      hasRingWebhooks: true,
      hasBee: true,
      beeWebhookSecret: BEE_SECRET,
    };
    @Module({
      controllers: [RingWebhookController, BeeWebhookController, EchoController],
      providers: [
        RingWebhookService,
        { provide: AppConfig, useValue: config },
        { provide: RING_REPOSITORY, useValue: repo },
        { provide: EventEmitter2, useValue: new EventEmitter2() },
        {
          provide: BeeIngestService,
          useValue: {
            accept: (body: unknown) => {
              beeBodies.push(body);
              return { accepted: true, event: 'new-conversation', conversationId: '1' };
            },
          },
        },
      ],
    })
    class TestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    installRawWebhookBodies(app);
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  const ringBody = (id: string) =>
    JSON.stringify({
      data: {
        id,
        type: 'motion_detected',
        attributes: { sub_type: 'human', timestamp: '2026-10-21T02:04:00.000Z' },
        relationships: { device: { data: { id: 'ring-dev-front-1', type: 'devices' } } },
      },
    });

  it.each(['application/vnd.api+json', 'text/plain', 'application/json'])(
    'accepts a signed Ring webhook sent as %s, verifying the HMAC over the raw bytes',
    async (contentType) => {
      const raw = ringBody(`evt-${contentType}`);
      const res = await request(http)
        .post('/ring/webhook')
        .set('content-type', contentType)
        .set('x-signature', signRingBody(raw, RING_SECRET))
        .send(raw)
        .expect(200);
      expect(res.body).toEqual({ ok: true, duplicate: false });
      const events = await repo.listEvents(FAMILY, 10);
      expect(events.find((e) => e.ringEventKey.endsWith(`evt-${contentType}`))).toMatchObject({
        kind: 'motion',
        subType: 'human',
      });
    },
  );

  it('still rejects a vnd.api+json body whose signature does not match its bytes', async () => {
    const raw = ringBody('evt-tampered');
    await request(http)
      .post('/ring/webhook')
      .set('content-type', 'application/vnd.api+json')
      .set('x-signature', signRingBody(raw.replace('human', 'vehicle'), RING_SECRET))
      .send(raw)
      .expect(401);
  });

  it('hands the Bee controller any content type as text', async () => {
    beeBodies.length = 0;
    await request(http)
      .post('/bee/webhook')
      .set('authorization', `Bearer ${BEE_SECRET}`)
      .set('content-type', 'application/vnd.api+json')
      .send('{"event":"new-conversation","data":{"conversation":{"id":"7"}}}')
      .expect(202);
    await request(http)
      .post('/bee/webhook')
      .set('authorization', `Bearer ${BEE_SECRET}`)
      .set('content-type', 'text/plain')
      .send('Event new-conversation: conv=8')
      .expect(202);
    expect(beeBodies).toEqual([
      '{"event":"new-conversation","data":{"conversation":{"id":"7"}}}',
      'Event new-conversation: conv=8',
    ]);
  });

  it('leaves every other route on the normal JSON parser', async () => {
    const res = await request(http).post('/echo').send({ hello: 'world' }).expect(201);
    expect(res.body).toEqual({ body: { hello: 'world' } });
  });
});
