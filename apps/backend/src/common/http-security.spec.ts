import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { applyHttpSecurity } from './http-security';

@Controller('ping')
class PingController {
  @Get()
  ping(): { ok: true } {
    return { ok: true };
  }
}

async function appWith(corsOrigins: string[] | undefined): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ controllers: [PingController] }).compile();
  const app = moduleRef.createNestApplication();
  applyHttpSecurity(app, corsOrigins);
  await app.init();
  return app;
}

describe('applyHttpSecurity', () => {
  it('sets standard security headers (helmet)', async () => {
    const app = await appWith(undefined);
    try {
      const res = await request(app.getHttpServer()).get('/ping').expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['strict-transport-security']).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it('reflects any origin when no allowlist is set (dev)', async () => {
    const app = await appWith(undefined);
    try {
      const res = await request(app.getHttpServer())
        .get('/ping')
        .set('Origin', 'https://anything.example')
        .expect(200);
      expect(res.headers['access-control-allow-origin']).toBe('https://anything.example');
    } finally {
      await app.close();
    }
  });

  it('allows a configured origin but not others', async () => {
    const app = await appWith(['https://app.obrigada.ai']);
    try {
      const allowed = await request(app.getHttpServer())
        .get('/ping')
        .set('Origin', 'https://app.obrigada.ai')
        .expect(200);
      expect(allowed.headers['access-control-allow-origin']).toBe('https://app.obrigada.ai');

      const blocked = await request(app.getHttpServer())
        .get('/ping')
        .set('Origin', 'https://evil.example')
        .expect(200); // the request still runs (CORS is a browser control)…
      // …but the browser is not told the disallowed origin is permitted.
      expect(blocked.headers['access-control-allow-origin']).not.toBe('https://evil.example');
    } finally {
      await app.close();
    }
  });
});
