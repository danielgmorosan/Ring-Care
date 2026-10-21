import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  INCIDENT_REPOSITORY,
  type IncidentRepository,
} from '../src/modules/escalation/incident.repository';

/**
 * Integration tests — require a migrated Postgres/TimescaleDB reachable at
 * DATABASE_URL. Skipped automatically when it is absent (e.g. local runs without
 * Docker); CI provides a TimescaleDB service container and runs migrations first.
 *
 * Proves the two things F0.2 is "done when": the Postgres-backed repositories serve
 * the same API, and the append-only guarantee is enforced at the database level.
 */
const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

describeIfDb('Data layer (integration)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  it('signs up and persists a family + device through the Postgres-backed repositories', async () => {
    const signup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'int@example.com', password: 'password123', familyName: 'Integration family' })
      .expect(201);
    const token = signup.body.token as string;
    const familyId = signup.body.family.id as string;

    const device = await request(app.getHttpServer())
      .post('/me/devices')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Kitchen shelf' })
      .expect(201);

    // Read back from a fresh query path to prove durability, not just echo.
    const listed = await request(app.getHttpServer())
      .get('/me/devices')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].id).toBe(device.body.id);

    // The user, family, and device all persisted.
    const users = await pool.query('SELECT family_id FROM users WHERE email = $1', [
      'int@example.com',
    ]);
    expect(users.rows[0]?.family_id).toBe(familyId);
  });

  it('stores the household timezone from signup (and defaults/validates it)', async () => {
    const withTz = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: 'tz@example.com',
        password: 'password123',
        familyName: 'Lisbon family',
        timezone: 'Europe/Lisbon',
      })
      .expect(201);
    const good = await pool.query('SELECT timezone FROM families WHERE id = $1', [
      withTz.body.family.id,
    ]);
    expect(good.rows[0].timezone).toBe('Europe/Lisbon');

    // A bogus timezone falls back to UTC; a missing one defaults to UTC.
    const bad = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: 'tzbad@example.com',
        password: 'password123',
        familyName: 'Bad tz',
        timezone: 'Not/AZone',
      })
      .expect(201);
    const badRow = await pool.query('SELECT timezone FROM families WHERE id = $1', [
      bad.body.family.id,
    ]);
    expect(badRow.rows[0].timezone).toBe('UTC');
  });

  it("persists, then clears, the elder's display name and relation", async () => {
    const signup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'elder@example.com', password: 'password123', familyName: 'Elder family' })
      .expect(201);
    const token = signup.body.token as string;
    const familyId = signup.body.family.id as string;

    await request(app.getHttpServer())
      .patch('/me/family')
      .set('Authorization', `Bearer ${token}`)
      .send({ elderName: 'Maria', elderRelation: 'mother' })
      .expect(200);
    const set = await pool.query('SELECT elder_name, elder_relation FROM families WHERE id = $1', [
      familyId,
    ]);
    expect(set.rows[0]).toEqual({ elder_name: 'Maria', elder_relation: 'mother' });

    await request(app.getHttpServer())
      .patch('/me/family')
      .set('Authorization', `Bearer ${token}`)
      .send({ elderName: null, elderRelation: null })
      .expect(200);
    const cleared = await pool.query(
      'SELECT elder_name, elder_relation FROM families WHERE id = $1',
      [familyId],
    );
    expect(cleared.rows[0]).toEqual({ elder_name: null, elder_relation: null });
  });

  it('reads and updates household settings (timezone), and logs the change', async () => {
    const signup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: 'settings@example.com',
        password: 'password123',
        familyName: 'Settings family',
        timezone: 'Europe/Lisbon',
      })
      .expect(201);
    const token = signup.body.token as string;

    const before = await request(app.getHttpServer())
      .get('/me/family')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(before.body.timezone).toBe('Europe/Lisbon');

    const updated = await request(app.getHttpServer())
      .patch('/me/family')
      .set('Authorization', `Bearer ${token}`)
      .send({ timezone: 'America/New_York' })
      .expect(200);
    expect(updated.body.timezone).toBe('America/New_York');

    // Read back from Postgres to prove it persisted, not just echoed.
    const row = await pool.query('SELECT timezone FROM families WHERE id = $1', [
      signup.body.family.id,
    ]);
    expect(row.rows[0].timezone).toBe('America/New_York');

    // The change lands in the append-only activity trail (rule #7).
    const activity = await request(app.getHttpServer())
      .get('/me/activity')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(activity.body.some((a: { label: string }) => a.label === 'Updated home settings')).toBe(
      true,
    );

    // Guarded like every other /me route.
    await request(app.getHttpServer()).get('/me/family').expect(401);
    await request(app.getHttpServer()).patch('/me/family').send({ timezone: 'UTC' }).expect(401);
  });

  it('registers and removes a device push token, and logs it', async () => {
    const signup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'push@example.com', password: 'password123', familyName: 'Push family' })
      .expect(201);
    const token = signup.body.token as string;

    const registered = await request(app.getHttpServer())
      .post('/me/push-tokens')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: 'device-token-xyz', platform: 'ios' })
      .expect(201);
    expect(registered.body.token).toBe('device-token-xyz');

    // Persisted in Postgres, scoped to the family.
    const row = await pool.query('SELECT platform FROM push_tokens WHERE token = $1', [
      'device-token-xyz',
    ]);
    expect(row.rows[0]?.platform).toBe('ios');

    // Re-registering the same token upserts (no duplicate).
    await request(app.getHttpServer())
      .post('/me/push-tokens')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: 'device-token-xyz', platform: 'android' })
      .expect(201);
    const count = await pool.query('SELECT count(*)::int AS n FROM push_tokens WHERE token = $1', [
      'device-token-xyz',
    ]);
    expect(count.rows[0].n).toBe(1);

    // Registration lands in the append-only activity trail (rule #7).
    const activity = await request(app.getHttpServer())
      .get('/me/activity')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      activity.body.some((a: { label: string }) => a.label === 'Registered a device for alerts'),
    ).toBe(true);

    await request(app.getHttpServer())
      .delete('/me/push-tokens/device-token-xyz')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    const after = await pool.query('SELECT count(*)::int AS n FROM push_tokens WHERE token = $1', [
      'device-token-xyz',
    ]);
    expect(after.rows[0].n).toBe(0);

    // A bad platform is rejected; unauthenticated is 401.
    await request(app.getHttpServer())
      .post('/me/push-tokens')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: 'x', platform: 'nokia' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/me/push-tokens')
      .send({ token: 'x', platform: 'ios' })
      .expect(401);
  });

  it('reports a device as having an active incident until it reaches a terminal step', async () => {
    const signup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'active@example.com', password: 'password123', familyName: 'Active family' })
      .expect(201);
    const token = signup.body.token as string;
    const familyId = signup.body.family.id as string;
    const device = await request(app.getHttpServer())
      .post('/me/devices')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bedside' })
      .expect(201);
    const deviceId = device.body.id as string;

    const incidents = app.get<IncidentRepository>(INCIDENT_REPOSITORY);
    expect(await incidents.hasActiveForDevice(deviceId)).toBe(false); // no incident yet

    const incidentId = randomUUID();
    await incidents.open({
      id: incidentId,
      familyId,
      deviceId,
      triggeringEventId: null,
      reason: 'fall.suspected',
      openedAt: new Date().toISOString(),
    });
    await incidents.appendStep({
      incidentId,
      seq: 0,
      kind: 'incident_opened',
      contactId: null,
      detail: {},
    });
    // Open, no terminal step -> active (a second fall here is de-duplicated).
    expect(await incidents.hasActiveForDevice(deviceId)).toBe(true);

    // Once it stands down, the device is free to escalate a genuinely new fall.
    await incidents.appendStep({
      incidentId,
      seq: 1,
      kind: 'stood_down',
      contactId: null,
      detail: {},
    });
    expect(await incidents.hasActiveForDevice(deviceId)).toBe(false);
  });

  it('denies cross-family mutation of contacts, medications, and appointments (tenant isolation)', async () => {
    const a = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'iso-a@example.com', password: 'password123', familyName: 'Iso A' })
      .expect(201);
    const tokenA = a.body.token as string;
    const auth = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

    const contactId = (
      await request(app.getHttpServer())
        .post('/me/contacts')
        .set(...auth(tokenA))
        .send({ name: 'Ana', role: 'daughter', phone: '+351920000000', priority: 1 })
        .expect(201)
    ).body.id as string;
    const medId = (
      await request(app.getHttpServer())
        .post('/me/medications')
        .set(...auth(tokenA))
        .send({ name: 'Bisoprolol', times: ['08:00'] })
        .expect(201)
    ).body.id as string;
    const apptId = (
      await request(app.getHttpServer())
        .post('/me/appointments')
        .set(...auth(tokenA))
        .send({ title: 'Cardiology', at: '2026-08-01T10:00:00.000Z' })
        .expect(201)
    ).body.id as string;

    const b = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'iso-b@example.com', password: 'password123', familyName: 'Iso B' })
      .expect(201);
    const tokenB = b.body.token as string;

    // Family B cannot touch any of Family A's records — every attempt is a 404.
    await request(app.getHttpServer())
      .patch(`/me/contacts/${contactId}`)
      .set(...auth(tokenB))
      .send({ name: 'Hijacked' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/me/contacts/${contactId}`)
      .set(...auth(tokenB))
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/me/medications/${medId}`)
      .set(...auth(tokenB))
      .send({ name: 'Hijacked' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/me/medications/${medId}`)
      .set(...auth(tokenB))
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/me/appointments/${apptId}`)
      .set(...auth(tokenB))
      .send({ title: 'Hijacked' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/me/appointments/${apptId}`)
      .set(...auth(tokenB))
      .expect(404);

    // And A's records are untouched.
    const contacts = await request(app.getHttpServer())
      .get('/me/contacts')
      .set(...auth(tokenA))
      .expect(200);
    expect(contacts.body.find((c: { id: string }) => c.id === contactId)?.name).toBe('Ana');
  });

  it('scopes escalation control to the family (no cross-family check-in or start)', async () => {
    // Family A with a device and an open incident on it.
    const a = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'fam-a@example.com', password: 'password123', familyName: 'Family A' })
      .expect(201);
    const tokenA = a.body.token as string;
    const familyA = a.body.family.id as string;
    const deviceA = (
      await request(app.getHttpServer())
        .post('/me/devices')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Hallway' })
        .expect(201)
    ).body.id as string;

    const incidentId = randomUUID();
    const incidents = app.get<IncidentRepository>(INCIDENT_REPOSITORY);
    await incidents.open({
      id: incidentId,
      familyId: familyA,
      deviceId: deviceA,
      triggeringEventId: null,
      reason: 'fall.confirmed',
      openedAt: new Date().toISOString(),
    });

    // Family B — a different account entirely.
    const b = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'fam-b@example.com', password: 'password123', familyName: 'Family B' })
      .expect(201);
    const tokenB = b.body.token as string;

    // B cannot stand down A's fall by delivering a check-in to A's incident.
    await request(app.getHttpServer())
      .post(`/incidents/${incidentId}/checkin`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ result: 'i_am_fine' })
      .expect(404);

    // B cannot start an incident on A's device.
    await request(app.getHttpServer())
      .post('/incidents')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ deviceId: deviceA, reason: 'fall.suspected' })
      .expect(404);

    // And unauthenticated is rejected.
    await request(app.getHttpServer())
      .post(`/incidents/${incidentId}/checkin`)
      .send({ result: 'i_am_fine' })
      .expect(401);
  });

  it('separates liveness from readiness, and readiness checks the dependencies', async () => {
    // Liveness: process is up, no dependency checks.
    const live = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(live.body).toEqual({ status: 'ok' });

    // Readiness: Postgres is configured here and reachable, so overall is up.
    const ready = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(ready.body.status).toBe('ok');
    expect(ready.body.info.postgres.status).toBe('up');
    expect(ready.body.info.mqtt.status).toBe('up'); // configured:false or connected

    // /health stays an alias of readiness.
    await request(app.getHttpServer()).get('/health').expect(200);
  });

  it('serves Prometheus metrics publicly, reflecting real HTTP traffic', async () => {
    // A request that will be counted under its route pattern.
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong' })
      .expect(401);

    const res = await request(app.getHttpServer()).get('/metrics').expect(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('process_cpu_user_seconds_total');
    expect(res.text).toContain('http_requests_total');
    // The failed login above was recorded with its route + 401 status.
    expect(res.text).toMatch(/http_requests_total\{[^}]*status="401"[^}]*\}/);
  });

  it('exports all of a family’s data and logs the access (GDPR Art. 15)', async () => {
    const signup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'export@example.com', password: 'password123', familyName: 'Export family' })
      .expect(201);
    const token = signup.body.token as string;

    // Seed some family data across modules.
    await request(app.getHttpServer())
      .post('/me/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Ana', role: 'daughter', phone: '+351920000000', priority: 1 })
      .expect(201);
    await request(app.getHttpServer())
      .post('/me/medications')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bisoprolol', times: ['08:00'] })
      .expect(201);

    const dump = await request(app.getHttpServer())
      .post('/me/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(dump.body.family.name).toBe('Export family');
    expect(dump.body.account.email).toBe('export@example.com');
    expect(dump.body.contacts.some((c: { name: string }) => c.name === 'Ana')).toBe(true);
    expect(dump.body.medications.some((m: { name: string }) => m.name === 'Bisoprolol')).toBe(true);
    expect(typeof dump.body.exportedAt).toBe('string');

    // The data-access request is itself on the append-only trail (rule #7).
    const activity = await request(app.getHttpServer())
      .get('/me/activity')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      activity.body.some((a: { label: string }) => a.label === 'Exported all family data'),
    ).toBe(true);

    await request(app.getHttpServer()).post('/me/export').expect(401);
  });

  it('erases identifying data but keeps the append-only trail (GDPR Art. 17)', async () => {
    const signup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'erase@example.com', password: 'password123', familyName: 'Erase Me' })
      .expect(201);
    const token = signup.body.token as string;
    const familyId = signup.body.family.id as string;

    await request(app.getHttpServer())
      .post('/me/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Ana', role: 'daughter', phone: '+351920000000', priority: 1 })
      .expect(201);
    await request(app.getHttpServer())
      .post('/me/medications')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bisoprolol', times: ['08:00'] })
      .expect(201);
    await request(app.getHttpServer())
      .post('/me/push-tokens')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: 'erase-device-token', platform: 'ios' })
      .expect(201);

    // Wrong confirmation name is refused and changes nothing.
    await request(app.getHttpServer())
      .post('/me/erase')
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmName: 'Not It' })
      .expect(400);

    // Correct confirmation erases.
    const erased = await request(app.getHttpServer())
      .post('/me/erase')
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmName: 'Erase Me' })
      .expect(201);
    expect(erased.body).toEqual({ erased: true });

    // Family name tombstoned; contact redacted in place (row kept, identity gone).
    const fam = await pool.query('SELECT name FROM families WHERE id = $1', [familyId]);
    expect(fam.rows[0].name).toBe('Erased household');
    const contact = await pool.query(
      'SELECT name, phone FROM family_contacts WHERE family_id = $1',
      [familyId],
    );
    expect(contact.rows).toHaveLength(1); // not deleted
    expect(contact.rows[0].name).toBe('Erased contact');
    expect(contact.rows[0].phone).toBeNull();

    // Standalone records deleted.
    const meds = await pool.query(
      'SELECT count(*)::int AS n FROM medications WHERE family_id = $1',
      [familyId],
    );
    expect(meds.rows[0].n).toBe(0);
    const push = await pool.query(
      'SELECT count(*)::int AS n FROM push_tokens WHERE family_id = $1',
      [familyId],
    );
    expect(push.rows[0].n).toBe(0);

    // The caregiver account is irreversibly disabled — old credentials no longer work.
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'erase@example.com', password: 'password123' })
      .expect(401);

    // The append-only access log is RETAINED (rule #2 / Art. 17(3)) and records the erasure.
    const log = await pool.query(
      "SELECT action FROM access_log WHERE family_id = $1 AND action = 'erase.create'",
      [familyId],
    );
    expect(log.rows.length).toBeGreaterThan(0);

    await request(app.getHttpServer()).post('/me/erase').send({ confirmName: 'x' }).expect(401);
  });

  describe('device provisioning (F2.6)', () => {
    let token: string;
    let deviceId: string;

    beforeAll(async () => {
      const signup = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: 'prov@example.com', password: 'password123', familyName: 'Prov family' })
        .expect(201);
      token = signup.body.token as string;
      const device = await request(app.getHttpServer())
        .post('/me/devices')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Hallway' })
        .expect(201);
      deviceId = device.body.id as string;
    });

    it('pairs a phone: issue a claim code, redeem it, device becomes provisioning', async () => {
      const issued = await request(app.getHttpServer())
        .post(`/me/devices/${deviceId}/claim-code`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect(issued.body.code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);

      // The phone redeems the code with no auth token — the code is the credential.
      const provisioned = await request(app.getHttpServer())
        .post('/provision')
        .send({ code: issued.body.code })
        .expect(201);
      expect(provisioned.body.deviceId).toBe(deviceId);
      expect(provisioned.body.heartbeatIntervalSeconds).toBeGreaterThan(0);

      // Only the hash is stored, and the device transitioned.
      const stored = await pool.query('SELECT code_hash, consumed_at FROM device_claim_codes', []);
      expect(stored.rows.every((r) => r.code_hash !== issued.body.code)).toBe(true);
      const status = await pool.query('SELECT status FROM devices WHERE id = $1', [deviceId]);
      expect(status.rows[0].status).toBe('provisioning');

      // Single-use: the same code cannot be redeemed again.
      await request(app.getHttpServer())
        .post('/provision')
        .send({ code: issued.body.code })
        .expect(401);
    });

    it('rejects an unknown claim code', async () => {
      await request(app.getHttpServer()).post('/provision').send({ code: 'ZZZZ-ZZZZ' }).expect(401);
    });

    it('surfaces guardian health in the fleet view from the latest heartbeat', async () => {
      // A guardian with no heartbeat yet: present, but offline with no health.
      const before = await request(app.getHttpServer())
        .get('/me/fleet')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const mine = before.body.find((g: { id: string }) => g.id === deviceId);
      expect(mine).toMatchObject({ online: false, lastSeenAt: null, batteryPct: null });

      // A recent heartbeat lands: battery, app version, and online surface.
      await pool.query(
        `INSERT INTO heartbeats (time, device_id, battery_pct, thermal_c, app_version)
         VALUES (now(), $1, 77, 30.5, '1.4.0')`,
        [deviceId],
      );
      const after = await request(app.getHttpServer())
        .get('/me/fleet')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const health = after.body.find((g: { id: string }) => g.id === deviceId);
      expect(health).toMatchObject({ online: true, batteryPct: 77, appVersion: '1.4.0' });
      expect(typeof health.lastSeenAt).toBe('string');

      await request(app.getHttpServer()).get('/me/fleet').expect(401);
    });

    it('a guardian check-in requires its device token, then turns it online', async () => {
      // Register + pair a fresh guardian to obtain its check-in token.
      const dev = await request(app.getHttpServer())
        .post('/me/devices')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Telemetry guardian' })
        .expect(201);
      const guardianId = dev.body.id as string;
      const issued = await request(app.getHttpServer())
        .post(`/me/devices/${guardianId}/claim-code`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      const prov = await request(app.getHttpServer())
        .post('/provision')
        .send({ code: issued.body.code })
        .expect(201);
      const deviceToken = prov.body.deviceToken as string;
      expect(typeof deviceToken).toBe('string');

      // No token and a wrong token are both rejected (no presence-spoofing).
      await request(app.getHttpServer())
        .post('/telemetry/heartbeat')
        .send({ deviceId: guardianId })
        .expect(401);
      await request(app.getHttpServer())
        .post('/telemetry/heartbeat')
        .set('Authorization', 'Bearer wrong-token')
        .send({ deviceId: guardianId })
        .expect(401);

      // With its own token: accepted, and the guardian shows online.
      await request(app.getHttpServer())
        .post('/telemetry/heartbeat')
        .set('Authorization', `Bearer ${deviceToken}`)
        .send({ deviceId: guardianId, batteryPct: 64, appVersion: 'guardian-lite-0.1' })
        .expect(204);
      const fleet = await request(app.getHttpServer())
        .get('/me/fleet')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const health = fleet.body.find((g: { id: string }) => g.id === guardianId);
      expect(health).toMatchObject({
        online: true,
        batteryPct: 64,
        appVersion: 'guardian-lite-0.1',
      });

      // A malformed device id fails validation before anything else.
      await request(app.getHttpServer())
        .post('/telemetry/heartbeat')
        .set('Authorization', `Bearer ${deviceToken}`)
        .send({ deviceId: 'not-a-uuid' })
        .expect(400);
    });

    it('requires auth and family ownership to issue a claim code', async () => {
      await request(app.getHttpServer()).post(`/me/devices/${deviceId}/claim-code`).expect(401);

      const other = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: 'nosy2@example.com', password: 'password123', familyName: 'Nosy2' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/me/devices/${deviceId}/claim-code`)
        .set('Authorization', `Bearer ${other.body.token}`)
        .expect(404);
    });
  });

  describe('append-only enforcement on event_stream (rule #2)', () => {
    let deviceId: string;

    beforeAll(async () => {
      const fam = await pool.query<{ id: string }>(
        `INSERT INTO families (name) VALUES ('Append-only fam') RETURNING id`,
      );
      const dev = await pool.query<{ id: string }>(
        `INSERT INTO devices (family_id, name) VALUES ($1, 'dev') RETURNING id`,
        [fam.rows[0]!.id],
      );
      deviceId = dev.rows[0]!.id;

      await pool.query(
        `INSERT INTO event_stream (occurred_at, event_id, device_id, type, confidence, payload)
         VALUES (now(), gen_random_uuid(), $1, 'fall.suspected', 0.94, '{}'::jsonb)`,
        [deviceId],
      );
    });

    it('allows INSERT', async () => {
      const before = await pool.query('SELECT count(*)::int AS n FROM event_stream');
      await pool.query(
        `INSERT INTO event_stream (occurred_at, event_id, device_id, type, payload)
         VALUES (now(), gen_random_uuid(), $1, 'heartbeat', '{}'::jsonb)`,
        [deviceId],
      );
      const after = await pool.query('SELECT count(*)::int AS n FROM event_stream');
      expect(after.rows[0].n).toBe(before.rows[0].n + 1);
    });

    it('rejects UPDATE', async () => {
      await expect(
        pool.query(`UPDATE event_stream SET type = 'tampered' WHERE device_id = $1`, [deviceId]),
      ).rejects.toThrow(/append-only/i);
    });

    it('rejects DELETE', async () => {
      await expect(
        pool.query(`DELETE FROM event_stream WHERE device_id = $1`, [deviceId]),
      ).rejects.toThrow(/append-only/i);
    });

    it('rejects TRUNCATE', async () => {
      await expect(pool.query(`TRUNCATE event_stream`)).rejects.toThrow(/append-only/i);
    });
  });

  it('configures a retention policy on heartbeats', async () => {
    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n
       FROM timescaledb_information.jobs
       WHERE proc_name = 'policy_retention' AND hypertable_name = 'heartbeats'`,
    );
    expect(rows[0]!.n).toBeGreaterThanOrEqual(1);
  });

  describe('medications (F3.4)', () => {
    let token: string;

    beforeAll(async () => {
      const signup = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: 'care@example.com', password: 'password123', familyName: 'Care family' })
        .expect(201);
      token = signup.body.token as string;
    });

    it('adds, lists, and removes a medication through the Postgres repository', async () => {
      const created = await request(app.getHttpServer())
        .post('/me/medications')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Bisoprolol', dosage: '5mg', times: ['20:00', '08:00'], notes: 'With food' })
        .expect(201);
      expect(created.body.times).toEqual(['08:00', '20:00']); // normalized + persisted as jsonb

      const listed = await request(app.getHttpServer())
        .get('/me/medications')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(listed.body).toHaveLength(1);
      expect(listed.body[0]).toMatchObject({ name: 'Bisoprolol', dosage: '5mg' });

      await request(app.getHttpServer())
        .delete(`/me/medications/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
      const after = await request(app.getHttpServer())
        .get('/me/medications')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(after.body).toHaveLength(0);
    });

    it('validates dose times and requires auth', async () => {
      await request(app.getHttpServer())
        .post('/me/medications')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Bad', times: ['9am'] })
        .expect(400);
      await request(app.getHttpServer()).get('/me/medications').expect(401);
    });

    it('edits a medication and records the change in the activity history', async () => {
      const created = await request(app.getHttpServer())
        .post('/me/medications')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Ramipril', dosage: '2.5mg', times: ['08:00'] })
        .expect(201);

      const updated = await request(app.getHttpServer())
        .patch(`/me/medications/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ dosage: '5mg', times: ['20:00', '08:00'] })
        .expect(200);
      expect(updated.body).toMatchObject({ name: 'Ramipril', dosage: '5mg' });
      expect(updated.body.times).toEqual(['08:00', '20:00']); // normalized

      const activity = await request(app.getHttpServer())
        .get('/me/activity')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(activity.body.map((a: { label: string }) => a.label)).toContain(
        'Updated a medication',
      );
    });

    it('never returns another family’s medications', async () => {
      await request(app.getHttpServer())
        .post('/me/medications')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Private pill' })
        .expect(201);

      const other = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: 'care2@example.com', password: 'password123', familyName: 'Care2' })
        .expect(201);
      const otherList = await request(app.getHttpServer())
        .get('/me/medications')
        .set('Authorization', `Bearer ${other.body.token}`)
        .expect(200);
      expect(otherList.body).toHaveLength(0);
    });

    it('manages appointments and rolls them into the Today view', async () => {
      // Noon today (UTC) is always on the current UTC day, so the Today bucketing is
      // stable regardless of when CI runs. "later" is well into the future.
      const todayDate = new Date().toISOString().slice(0, 10);
      const soon = `${todayDate}T12:00:00.000Z`;
      const later = new Date(Date.now() + 40 * 24 * 3600_000).toISOString();
      const created = await request(app.getHttpServer())
        .post('/me/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Dr. Almeida', at: soon, location: 'Clinic' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/me/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Follow-up', at: later })
        .expect(201);

      const listed = await request(app.getHttpServer())
        .get('/me/appointments')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(listed.body).toHaveLength(2);
      expect(listed.body[0].title).toBe('Dr. Almeida'); // soonest first

      // Today view: the medication schedule + only today's appointment.
      const today = await request(app.getHttpServer())
        .get('/me/care/today')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const titles = today.body.appointments.map((a: { title: string }) => a.title);
      expect(titles).toContain('Dr. Almeida');
      expect(titles).not.toContain('Follow-up');
      expect(Array.isArray(today.body.medications)).toBe(true);

      // Bad datetime is rejected; auth required.
      await request(app.getHttpServer())
        .post('/me/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'X', at: 'not-a-date' })
        .expect(400);
      await request(app.getHttpServer()).get('/me/care/today').expect(401);

      await request(app.getHttpServer())
        .delete(`/me/appointments/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
    });
  });

  describe('append-only enforcement on incident_steps (rule #2)', () => {
    let incidentId: string;

    beforeAll(async () => {
      const fam = await pool.query<{ id: string }>(
        `INSERT INTO families (name) VALUES ('Incident fam') RETURNING id`,
      );
      const dev = await pool.query<{ id: string }>(
        `INSERT INTO devices (family_id, name) VALUES ($1, 'dev') RETURNING id`,
        [fam.rows[0]!.id],
      );
      const inc = await pool.query<{ id: string }>(
        `INSERT INTO incidents (family_id, device_id, reason) VALUES ($1, $2, 'fall.suspected')
         RETURNING id`,
        [fam.rows[0]!.id, dev.rows[0]!.id],
      );
      incidentId = inc.rows[0]!.id;
      await pool.query(
        `INSERT INTO incident_steps (incident_id, seq, kind) VALUES ($1, 0, 'incident_opened')`,
        [incidentId],
      );
    });

    it('rejects UPDATE on an incident step', async () => {
      await expect(
        pool.query(`UPDATE incident_steps SET kind = 'tampered' WHERE incident_id = $1`, [
          incidentId,
        ]),
      ).rejects.toThrow(/append-only/i);
    });

    it('rejects DELETE on an incident step', async () => {
      await expect(
        pool.query(`DELETE FROM incident_steps WHERE incident_id = $1`, [incidentId]),
      ).rejects.toThrow(/append-only/i);
    });
  });

  describe('incident trail read endpoints (me/incidents)', () => {
    let token: string;
    let familyId: string;
    let incidentId: string;

    beforeAll(async () => {
      const signup = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: 'trail@example.com', password: 'password123', familyName: 'Trail family' })
        .expect(201);
      token = signup.body.token as string;
      familyId = signup.body.family.id as string;

      const dev = await pool.query<{ id: string }>(
        `INSERT INTO devices (family_id, name) VALUES ($1, 'Kitchen shelf') RETURNING id`,
        [familyId],
      );
      const contact = await pool.query<{ id: string }>(
        `INSERT INTO family_contacts (family_id, name, role, priority)
         VALUES ($1, 'Ana', 'daughter', 0) RETURNING id`,
        [familyId],
      );
      const inc = await pool.query<{ id: string }>(
        `INSERT INTO incidents (family_id, device_id, reason) VALUES ($1, $2, 'fall.suspected')
         RETURNING id`,
        [familyId, dev.rows[0]!.id],
      );
      incidentId = inc.rows[0]!.id;
      // Steps out of seq order to prove the endpoint sorts by seq.
      await pool.query(
        `INSERT INTO incident_steps (incident_id, seq, kind, contact_id) VALUES
           ($1, 1, 'call_placed', $2),
           ($1, 0, 'incident_opened', NULL),
           ($1, 2, 'call_answered', $2)`,
        [incidentId, contact.rows[0]!.id],
      );
    });

    it('lists the incident for its family with derived outcome and step count', async () => {
      const listed = await request(app.getHttpServer())
        .get('/me/incidents')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(listed.body).toHaveLength(1);
      expect(listed.body[0]).toMatchObject({
        id: incidentId,
        reason: 'fall.suspected',
        outcome: 'acknowledged',
        stepCount: 3,
      });
    });

    it('returns steps in seq order with resolved contact name and timestamps', async () => {
      const detail = await request(app.getHttpServer())
        .get(`/me/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(detail.body.steps.map((s: { kind: string }) => s.kind)).toEqual([
        'incident_opened',
        'call_placed',
        'call_answered',
      ]);
      expect(detail.body.steps[1].contactName).toBe('Ana');
      expect(typeof detail.body.steps[1].occurredAt).toBe('string');
      // F3.2: a human-words narrative is generated (mock adapter in CI).
      expect(typeof detail.body.narrative).toBe('string');
      expect(detail.body.narrative.length).toBeGreaterThan(0);
    });

    it('persists the narrative append-only and reuses it on the next open', async () => {
      const first = await request(app.getHttpServer())
        .get(`/me/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const second = await request(app.getHttpServer())
        .get(`/me/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      // Same words each open (terminal incident: stored once, reused).
      expect(second.body.narrative).toBe(first.body.narrative);

      const stored = await pool.query(
        `SELECT text, generated_by FROM incident_narratives WHERE incident_id = $1`,
        [incidentId],
      );
      expect(stored.rows).toHaveLength(1);
      expect(stored.rows[0].generated_by).toBe('mock');

      // Append-only enforcement (rule #2).
      await expect(
        pool.query(`UPDATE incident_narratives SET text = 'x' WHERE incident_id = $1`, [
          incidentId,
        ]),
      ).rejects.toThrow(/append-only/i);
      await expect(
        pool.query(`DELETE FROM incident_narratives WHERE incident_id = $1`, [incidentId]),
      ).rejects.toThrow(/append-only/i);
    });

    it('never leaks another family incident (empty list + 404)', async () => {
      const other = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: 'nosy@example.com', password: 'password123', familyName: 'Nosy family' })
        .expect(201);
      const otherToken = other.body.token as string;

      const listed = await request(app.getHttpServer())
        .get('/me/incidents')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);
      expect(listed.body).toHaveLength(0);

      await request(app.getHttpServer())
        .get(`/me/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/me/incidents').expect(401);
    });

    it('summarizes today for the family, counting the day’s incident', async () => {
      const summary = await request(app.getHttpServer())
        .get('/me/summary/today')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(typeof summary.body.text).toBe('string');
      expect(summary.body.text.length).toBeGreaterThan(0);
      // The incident seeded above opened today (opened_at defaults to now()).
      expect(summary.body.incidentCount).toBeGreaterThanOrEqual(1);
      expect(summary.body.guardiansTotal).toBeGreaterThanOrEqual(1);
      await request(app.getHttpServer()).get('/me/summary/today').expect(401);
    });

    it('gives another family a calm, incident-free summary', async () => {
      const other = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: 'calm@example.com', password: 'password123', familyName: 'Calm family' })
        .expect(201);
      const summary = await request(app.getHttpServer())
        .get('/me/summary/today')
        .set('Authorization', `Bearer ${other.body.token}`)
        .expect(200);
      expect(summary.body.incidentCount).toBe(0);
      expect(summary.body.text).toContain('calm');
    });
  });

  describe('access log + activity history (rule #7)', () => {
    let token: string;
    let familyId: string;

    beforeAll(async () => {
      const signup = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: 'audit@example.com', password: 'password123', familyName: 'Audit family' })
        .expect(201);
      token = signup.body.token as string;
      familyId = signup.body.family.id as string;
    });

    it('records a mutation and surfaces it in the activity history', async () => {
      // A caregiver action flows through the global audit interceptor.
      await request(app.getHttpServer())
        .post('/me/medications')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Bisoprolol' })
        .expect(201);

      const activity = await request(app.getHttpServer())
        .get('/me/activity')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(activity.body.map((a: { label: string }) => a.label)).toContain('Added a medication');

      // It landed in the append-only access log for this family.
      const rows = await pool.query('SELECT action FROM access_log WHERE family_id = $1', [
        familyId,
      ]);
      expect(rows.rows.some((r) => r.action === 'medications.create')).toBe(true);

      await request(app.getHttpServer()).get('/me/activity').expect(401);
    });

    it('never shows another family’s activity', async () => {
      const other = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: 'audit2@example.com', password: 'password123', familyName: 'Audit2' })
        .expect(201);
      const activity = await request(app.getHttpServer())
        .get('/me/activity')
        .set('Authorization', `Bearer ${other.body.token}`)
        .expect(200);
      expect(activity.body).toHaveLength(0);
    });

    it('enforces append-only on the access log', async () => {
      await expect(
        pool.query(`UPDATE access_log SET action = 'tampered' WHERE family_id = $1`, [familyId]),
      ).rejects.toThrow(/append-only/i);
      await expect(
        pool.query(`DELETE FROM access_log WHERE family_id = $1`, [familyId]),
      ).rejects.toThrow(/append-only/i);
    });
  });

  describe('family Q&A (F3.3)', () => {
    let token: string;

    beforeAll(async () => {
      const signup = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: 'qa@example.com', password: 'password123', familyName: 'QA family' })
        .expect(201);
      token = signup.body.token as string;
      await request(app.getHttpServer())
        .post('/me/medications')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Bisoprolol', times: ['08:00'] })
        .expect(201);
    });

    it('answers a question grounded in the family record (mock adapter in CI)', async () => {
      const res = await request(app.getHttpServer())
        .post('/me/ask')
        .set('Authorization', `Bearer ${token}`)
        .send({ question: 'How is everything?' })
        .expect(201);
      expect(typeof res.body.answer).toBe('string');
      // The mock digest reflects the real record: one medication on the schedule.
      expect(res.body.answer).toContain('One medication on the schedule.');

      // The question is recorded in the activity history (audit interceptor).
      const activity = await request(app.getHttpServer())
        .get('/me/activity')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(activity.body.map((a: { label: string }) => a.label)).toContain(
        'Asked Obrigada a question',
      );

      // Validation + auth.
      await request(app.getHttpServer())
        .post('/me/ask')
        .set('Authorization', `Bearer ${token}`)
        .send({ question: '' })
        .expect(400);
      await request(app.getHttpServer()).post('/me/ask').send({ question: 'hi' }).expect(401);
    });
  });
});
