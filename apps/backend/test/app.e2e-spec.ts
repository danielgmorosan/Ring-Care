import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AppConfig } from '../src/config/env.validation';
import {
  buildConfirmUrl,
  deriveCallbackKey,
} from '../src/modules/escalation/notifications/call-confirmation';

describe('Obrigada backend (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  async function signup(email: string, familyName: string): Promise<string> {
    const res = await request(http)
      .post('/auth/signup')
      .send({ email, password: 'password123', familyName })
      .expect(201);
    return res.body.token as string;
  }

  it('GET /health is public', async () => {
    const res = await request(http).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('rejects a protected route without a token', async () => {
    await request(http).get('/me/devices').expect(401);
  });

  it('rejects a malformed/forged token', async () => {
    await request(http)
      .get('/me/devices')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('signs up, logs in, and returns the caregiver context', async () => {
    await request(http)
      .post('/auth/signup')
      .send({ email: 'ana@example.com', password: 'password123', familyName: 'Silva family' })
      .expect(201);

    const login = await request(http)
      .post('/auth/login')
      .send({ email: 'ana@example.com', password: 'password123' })
      .expect(200);
    expect(login.body.token).toEqual(expect.any(String));
    expect(login.body.family.name).toBe('Silva family');

    const me = await request(http)
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200);
    expect(me.body.user.email).toBe('ana@example.com');
    expect(me.body.family.name).toBe('Silva family');
  });

  it('rejects signup with a taken email and a weak password', async () => {
    await request(http)
      .post('/auth/signup')
      .send({ email: 'dup@example.com', password: 'password123', familyName: 'A' })
      .expect(201);
    await request(http)
      .post('/auth/signup')
      .send({ email: 'dup@example.com', password: 'password123', familyName: 'B' })
      .expect(409);
    await request(http)
      .post('/auth/signup')
      .send({ email: 'weak@example.com', password: 'short', familyName: 'C' })
      .expect(400);
  });

  describe('the Twilio press-1 callback', () => {
    const signedPath = (incidentId: string, contactId: string): string => {
      const config = app.get(AppConfig);
      const url = new URL(
        buildConfirmUrl({
          publicBaseUrl: 'https://obrigada.example',
          key: deriveCallbackKey({
            callbackSigningSecret: config.callbackSigningSecret,
            jwtSecret: config.jwtSecret,
          }),
          incidentId,
          contactId,
          exp: Math.floor(Date.now() / 1000) + 600,
        }),
      );
      return url.pathname + url.search;
    };

    it('is public but refuses a forged link (403, not 401)', async () => {
      await request(http)
        .post('/twilio/calls/confirm?incident=inc-1&contact=miguel&exp=9999999999&token=forged')
        .type('form')
        .send({ Digits: '1', CallSid: 'CA1' })
        .expect(403);
    });

    it('answers a signed link with TwiML: another digit hangs up', async () => {
      const res = await request(http)
        .post(signedPath('inc-1', 'miguel'))
        .type('form')
        .send({ Digits: '2', CallSid: 'CA1' })
        .expect(200);
      expect(res.headers['content-type']).toMatch(/text\/xml/);
      expect(res.text).toContain('<Hangup/>');
    });

    it('a press 1 for an incident that is not running is answered politely', async () => {
      const res = await request(http)
        .post(signedPath('no-such-incident', 'miguel'))
        .type('form')
        .send({ Digits: '1', CallSid: 'CA1' })
        .expect(200);
      expect(res.text).toContain('already closed');
    });
  });

  describe('an authenticated caregiver', () => {
    let token: string;
    beforeAll(async () => {
      token = await signup('caregiver@example.com', 'Costa family');
    });
    const auth = () => ({ Authorization: `Bearer ${token}` });

    it('registers and lists their guardian (family from the token)', async () => {
      const device = await request(http)
        .post('/me/devices')
        .set(auth())
        .send({ name: 'Kitchen shelf' })
        .expect(201);
      expect(device.body.name).toBe('Kitchen shelf');
      expect(device.body.status).toBe('registered');

      const list = await request(http).get('/me/devices').set(auth()).expect(200);
      expect(list.body).toHaveLength(1);
    });

    it('manages the escalation contact chain', async () => {
      const contact = await request(http)
        .post('/me/contacts')
        .set(auth())
        .send({ name: 'Ana', role: 'daughter', phone: '+351912345678', priority: 0 })
        .expect(201);

      const list = await request(http).get('/me/contacts').set(auth()).expect(200);
      expect(list.body).toHaveLength(1);

      await request(http)
        .patch(`/me/contacts/${contact.body.id}`)
        .set(auth())
        .send({ priority: 5 })
        .expect(200);

      await request(http).delete(`/me/contacts/${contact.body.id}`).set(auth()).expect(204);
      const after = await request(http).get('/me/contacts').set(auth()).expect(200);
      expect(after.body).toHaveLength(0);
    });

    it('rejects a malformed contact', async () => {
      await request(http)
        .post('/me/contacts')
        .set(auth())
        .send({ name: 'X', role: 'friend', priority: 0, phone: '912345678' })
        .expect(400);
    });
  });

  it('isolates one family from another (cross-family access is impossible)', async () => {
    const alice = await signup('alice@example.com', 'Alice family');
    await request(http)
      .post('/me/contacts')
      .set('Authorization', `Bearer ${alice}`)
      .send({ name: 'Alice contact', role: 'daughter', priority: 0 })
      .expect(201);

    // Bob, a different caregiver, sees only his own (empty) chain — there is no
    // way for him to address Alice's family: the id comes from his token.
    const bob = await signup('bob@example.com', 'Bob family');
    const bobContacts = await request(http)
      .get('/me/contacts')
      .set('Authorization', `Bearer ${bob}`)
      .expect(200);
    expect(bobContacts.body).toHaveLength(0);
  });
});
