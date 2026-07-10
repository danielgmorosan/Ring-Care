import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';

@Controller('ping')
class PingController {
  @Get()
  ping(): { ok: true } {
    return { ok: true };
  }
}

/**
 * Proves the ThrottlerGuard wiring rejects once the per-IP budget is spent. Uses a
 * tiny standalone app with a low limit (2) and no skipIf, so it throttles even under
 * NODE_ENV=test (the real app deliberately skips throttling in the test suites).
 */
describe('rate limiting (ThrottlerGuard)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 2 }] })],
      controllers: [PingController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('allows requests up to the limit, then returns 429 Too Many Requests', async () => {
    await request(app.getHttpServer()).get('/ping').expect(200);
    await request(app.getHttpServer()).get('/ping').expect(200);
    await request(app.getHttpServer()).get('/ping').expect(429);
  });
});
