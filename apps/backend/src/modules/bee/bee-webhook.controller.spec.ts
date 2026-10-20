import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppConfig } from '../../config/env.validation';
import { BeeIngestService } from './bee-ingest.service';
import { BeeWebhookController, secretsMatch } from './bee-webhook.controller';
import { rawTextBody } from './raw-text-body.middleware';

const SECRET = 'a-webhook-secret-of-32-characters!';

describe('POST /bee/webhook', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  const config = { hasBee: true, beeWebhookSecret: SECRET as string | undefined };
  const bodies: unknown[] = [];

  beforeAll(async () => {
    const ingest = {
      accept: (body: unknown) => {
        bodies.push(body);
        return { accepted: true, event: 'new-conversation', conversationId: '1' };
      },
    };

    @Module({
      controllers: [BeeWebhookController],
      providers: [
        { provide: AppConfig, useValue: config },
        { provide: BeeIngestService, useValue: ingest },
      ],
    })
    class TestBeeModule implements NestModule {
      configure(consumer: MiddlewareConsumer): void {
        consumer.apply(rawTextBody).forRoutes({ path: 'bee/webhook', method: RequestMethod.POST });
      }
    }

    const moduleRef = await Test.createTestingModule({ imports: [TestBeeModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    bodies.length = 0;
    config.hasBee = true;
    config.beeWebhookSecret = SECRET;
  });

  it('returns 503 when Bee is not configured', async () => {
    config.hasBee = false;
    config.beeWebhookSecret = undefined;
    await request(http).post('/bee/webhook').send({}).expect(503);
  });

  it('rejects a missing or wrong secret', async () => {
    await request(http).post('/bee/webhook').send({ event: 'new-conversation' }).expect(401);
    await request(http)
      .post('/bee/webhook')
      .set('Authorization', 'Bearer wrong-secret')
      .send({ event: 'new-conversation' })
      .expect(401);
    await request(http).post('/bee/webhook?secret=nope').send({}).expect(401);
    expect(bodies).toEqual([]);
  });

  it('accepts the bearer secret with a JSON body', async () => {
    const event = { event: 'new-conversation', data: { conversation: { id: 1 } } };
    const res = await request(http)
      .post('/bee/webhook')
      .set('Authorization', `Bearer ${SECRET}`)
      .send(event)
      .expect(202);
    expect(res.body).toEqual({ accepted: true, event: 'new-conversation', conversationId: '1' });
    expect(bodies).toEqual([event]);
  });

  it('accepts the query secret with a plain-text agent message', async () => {
    const line = 'Event new-conversation: "GP notes" conv=1';
    await request(http)
      .post(`/bee/webhook?secret=${encodeURIComponent(SECRET)}`)
      .set('Content-Type', 'text/plain')
      .send(line)
      .expect(202);
    expect(bodies).toEqual([line]);
  });

  it('compares secrets in constant time regardless of length', () => {
    expect(secretsMatch(SECRET, SECRET)).toBe(true);
    expect(secretsMatch('short', SECRET)).toBe(false);
    expect(secretsMatch(undefined, SECRET)).toBe(false);
  });
});
