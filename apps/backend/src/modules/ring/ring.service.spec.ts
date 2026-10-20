import { NotFoundException } from '@nestjs/common';
import type { AppConfig } from '../../config/env.validation';
import type { AuthUser } from '../auth/user.repository';
import { MockRingClient } from './client/mock-ring.client';
import { RingDeviceOfflineError } from './client/ring-client.port';
import { InMemoryRingRepository } from './in-memory-ring.repository';
import { parseLimit, RingController } from './ring.controller';
import { RingService, suggestPlacement } from './ring.service';

const FAMILY = '00000000-0000-4000-8000-0000000000f1';
const OTHER = '00000000-0000-4000-8000-0000000000f2';

const caregiver = (familyId: string): AuthUser => ({
  id: '00000000-0000-4000-8000-0000000000a1',
  email: 'ana@example.com',
  familyId,
  createdAt: '2026-10-20T00:00:00.000Z',
});

function setup(mode: 'oauth' | 'playground' | 'off' = 'playground') {
  const config = {
    ringFamilyId: FAMILY,
    ringAuthMode: mode,
    hasRingWebhooks: true,
  } as unknown as AppConfig;
  const repo = new InMemoryRingRepository();
  const client = new MockRingClient();
  client.devices = [
    { id: 'ring-dev-front-1', name: 'Front Door', online: true, kind: 'doorbell_v4' },
    { id: 'ring-dev-hall-2', name: 'Hallway', online: false, kind: 'stickup_cam' },
  ];
  const service = new RingService(config, repo, client);
  return { repo, client, service, controller: new RingController(service) };
}

describe('RingService / RingController', () => {
  it('reports status for the linked family and an unlinked Ring for any other', async () => {
    const { controller } = setup('oauth');
    expect(await controller.status(caregiver(FAMILY))).toEqual({
      mode: 'oauth',
      webhooks: true,
      cameras: [],
    });
    expect(await controller.status(caregiver(OTHER))).toEqual({
      mode: 'off',
      webhooks: false,
      cameras: [],
    });
  });

  it('syncs devices, suggesting front_door only for doorbells, and keeps a set placement', async () => {
    const { controller, client } = setup();
    const synced = await controller.sync(caregiver(FAMILY));
    expect(synced.map((c) => [c.ringDeviceId, c.name, c.placement, c.online])).toEqual([
      ['ring-dev-front-1', 'Front Door', 'front_door', true],
      ['ring-dev-hall-2', 'Hallway', 'other', false],
    ]);

    const hall = synced[1]!;
    await controller.update(caregiver(FAMILY), hall.id, { placement: 'indoor' });
    client.devices[1] = { ...client.devices[1]!, name: 'Hall', online: true };
    const again = await controller.sync(caregiver(FAMILY));
    expect(again[1]).toMatchObject({
      id: hall.id,
      name: 'Hall',
      placement: 'indoor',
      online: true,
    });
    expect(again).toHaveLength(2);
  });

  it('names a camera the webhook auto-created, on the next sync', async () => {
    const { controller, repo } = setup();
    const auto = await repo.ensureCamera(FAMILY, 'ring-dev-hall-2');
    const synced = await controller.sync(caregiver(FAMILY));
    expect(synced).toHaveLength(2);
    expect(synced.find((c) => c.ringDeviceId === 'ring-dev-hall-2')).toMatchObject({
      id: auto.id,
      name: 'Hallway',
    });
  });

  it('scopes every route to the linked family', async () => {
    const { controller, repo } = setup();
    const cam = await repo.ensureCamera(FAMILY, 'ring-dev-front-1');
    await repo.recordEvent({
      familyId: FAMILY,
      ringCameraId: cam.id,
      ringEventKey: 'ring:e1',
      kind: 'motion',
      subType: 'human',
      source: 'simulator',
      occurredAt: '2026-10-21T02:04:00.000Z',
      rawType: 'motion_detected',
    });
    const other = caregiver(OTHER);

    expect(await controller.cameras(other)).toEqual([]);
    expect(await controller.activity(other)).toEqual([]);
    await expect(controller.sync(other)).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      controller.update(other, cam.id, { placement: 'front_door' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      controller.openLive(other, cam.id, { sdpOffer: 'v=0\r\n' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.closeLive(other, cam.id, 'abc')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    // The linked family sees it.
    expect(await controller.cameras(caregiver(FAMILY))).toHaveLength(1);
  });

  it('404s an unknown camera for the linked family', async () => {
    const { controller } = setup();
    await expect(
      controller.update(caregiver(FAMILY), '00000000-0000-4000-8000-000000000999', {
        placement: 'indoor',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses sync and live view with 503 when Ring is not connected', async () => {
    const { controller, repo } = setup('off');
    const cam = await repo.ensureCamera(FAMILY, 'ring-dev-front-1');
    await expect(controller.sync(caregiver(FAMILY))).rejects.toMatchObject({ status: 503 });
    await expect(
      controller.openLive(caregiver(FAMILY), cam.id, { sdpOffer: 'v=0\r\n' }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('relays live-view signalling and closes the session', async () => {
    const { controller, repo, client } = setup();
    const cam = await repo.ensureCamera(FAMILY, 'ring-dev-front-1');
    const opened = await controller.openLive(caregiver(FAMILY), cam.id, { sdpOffer: 'v=0\r\n' });
    expect(opened).toEqual({
      sessionId: expect.any(String),
      sdpAnswer: expect.stringMatching(/^v=0/),
    });
    expect(client.opened).toEqual([
      { ringDeviceId: 'ring-dev-front-1', sessionId: opened.sessionId },
    ]);

    await controller.closeLive(caregiver(FAMILY), cam.id, opened.sessionId);
    expect(client.closed).toEqual([
      { ringDeviceId: 'ring-dev-front-1', sessionId: opened.sessionId },
    ]);
  });

  it('rejects a session id that could escape the Ring path', async () => {
    const { controller, repo } = setup();
    const cam = await repo.ensureCamera(FAMILY, 'ring-dev-front-1');
    await expect(
      controller.closeLive(caregiver(FAMILY), cam.id, '../../v1/devices'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('marks the camera offline when Ring says the device is offline', async () => {
    const { service, repo, client } = setup();
    const cam = await repo.ensureCamera(FAMILY, 'ring-dev-front-1');
    jest.spyOn(client, 'startLiveView').mockRejectedValue(new RingDeviceOfflineError());
    await expect(service.openLive(FAMILY, 'u1', cam.id, 'v=0\r\n')).rejects.toMatchObject({
      status: 503,
    });
    expect((await repo.findCamera(FAMILY, cam.id))!.online).toBe(false);
  });

  it('lists activity newest first in the contract shape, hiding unknown kinds', async () => {
    const { controller, repo } = setup();
    const cam = await repo.ensureCamera(FAMILY, 'ring-dev-front-1');
    await repo.setPlacement(FAMILY, cam.id, 'front_door');
    const base = {
      familyId: FAMILY,
      ringCameraId: cam.id,
      subType: null,
      source: 'ring' as const,
    };
    await repo.recordEvent({
      ...base,
      ringEventKey: 'a',
      kind: 'ding',
      occurredAt: '2026-10-21T08:00:00.000Z',
      rawType: 'button_press',
    });
    await repo.recordEvent({
      ...base,
      ringEventKey: 'b',
      kind: 'motion',
      subType: 'human',
      occurredAt: '2026-10-21T09:00:00.000Z',
      rawType: 'motion_detected',
    });
    await repo.recordEvent({
      ...base,
      ringEventKey: 'c',
      kind: 'other',
      occurredAt: '2026-10-21T10:00:00.000Z',
      rawType: 'battery_low',
    });

    const activity = await controller.activity(caregiver(FAMILY), '10');
    expect(activity.map((a) => a.kind)).toEqual(['motion', 'ding']);
    expect(activity[0]).toEqual({
      id: expect.any(String),
      cameraId: cam.id,
      cameraName: '',
      placement: 'front_door',
      kind: 'motion',
      subType: 'human',
      occurredAt: '2026-10-21T09:00:00.000Z',
      source: 'ring',
      interpretation: null,
    });
  });
});

describe('helpers', () => {
  it('clamps the activity limit', () => {
    expect(parseLimit(undefined)).toBe(50);
    expect(parseLimit('5')).toBe(5);
    expect(parseLimit('0')).toBe(1);
    expect(parseLimit('9999')).toBe(200);
    expect(parseLimit('abc')).toBe(50);
  });

  it('suggests front_door only for doorbells', () => {
    expect(suggestPlacement({ kind: 'doorbell_v4', name: 'x' })).toBe('front_door');
    expect(suggestPlacement({ kind: 'stickup_cam', name: 'Front door' })).toBe('other');
    expect(suggestPlacement({ kind: null, name: '' })).toBe('other');
  });
});
