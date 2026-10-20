import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { BeeIngestService } from '../src/modules/bee/bee-ingest.service';

/**
 * The Bee flow through the real app (in-memory stores, mock Bee API): a demo voice
 * note becomes a pending proposal; the caregiver approves part of it; the care module
 * changes and the decision lands in the activity history.
 */
describe('Bee care proposals (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let token: string;
  let familyId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    http = app.getHttpServer();
    const res = await request(http)
      .post('/auth/signup')
      .send({ email: 'bee@example.com', password: 'password123', familyName: 'Bee family' })
      .expect(201);
    token = res.body.token as string;
    familyId = res.body.family.id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('returns 503 from the webhook when Bee is not configured', async () => {
    await request(http).post('/bee/webhook').send({ event: 'new-conversation' }).expect(503);
  });

  it('proposes, lists, approves part of, and audits a demo note', async () => {
    await request(http)
      .post('/me/medications')
      .set(auth())
      .send({ name: 'Donepezil', dosage: '10 mg', times: ['08:00'] })
      .expect(201);

    // The mock Bee API serves the demo note for "demo-*" conversation ids.
    const ingest = app.get(BeeIngestService);
    expect(await ingest.processConversation(familyId, 'demo-1')).toBe('created');

    const pending = await request(http)
      .get('/me/care/proposals?status=pending')
      .set(auth())
      .expect(200);
    expect(pending.body).toHaveLength(1);
    const proposal = pending.body[0];
    expect(proposal.items.map((i: { kind: string }) => i.kind)).toEqual([
      'medication_change',
      'appointment',
      'todo',
    ]);

    await request(http).get('/me/care/proposals?status=maybe').set(auth()).expect(400);
    await request(http)
      .post(`/me/care/proposals/${proposal.id}/approve`)
      .set(auth())
      .send({ itemIds: ['not-a-uuid'] })
      .expect(400);

    const medItem = proposal.items[0].id as string;
    const approved = await request(http)
      .post(`/me/care/proposals/${proposal.id}/approve`)
      .set(auth())
      .send({ itemIds: [medItem] })
      .expect(200);
    // "From Monday" is always a future day: scheduled, with a Bee todo for that morning.
    expect(approved.body).toEqual({ applied: [], scheduled: [medItem], todosCreated: 1 });

    const meds = await request(http).get('/me/medications').set(auth()).expect(200);
    expect(meds.body[0]).toMatchObject({ name: 'Donepezil', dosage: '10 mg', times: ['08:00'] });
    expect(meds.body[0].notes).toMatch(/^From Monday \d+ \w+: 5 mg at 20:00\.$/);

    const again = await request(http)
      .post(`/me/care/proposals/${proposal.id}/approve`)
      .set(auth())
      .send({})
      .expect(200);
    expect(again.body).toEqual(approved.body);
    await request(http).post(`/me/care/proposals/${proposal.id}/reject`).set(auth()).expect(409);

    const activity = await request(http).get('/me/activity').set(auth()).expect(200);
    expect(activity.body.map((a: { label: string }) => a.label)).toContain(
      'Approved care changes from a Bee note',
    );
  });

  it('keeps proposals family-scoped', async () => {
    const other = await request(http)
      .post('/auth/signup')
      .send({ email: 'other@example.com', password: 'password123', familyName: 'Other' })
      .expect(201);
    const list = await request(http)
      .get('/me/care/proposals')
      .set({ Authorization: `Bearer ${other.body.token}` })
      .expect(200);
    expect(list.body).toEqual([]);
  });
});
