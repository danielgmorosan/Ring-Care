import { ServiceUnavailableException } from '@nestjs/common';
import type { AppConfig } from '../../config/env.validation';
import { LiveService, roomForDevice } from './live.service';

const DEVICE = '00000000-0000-4000-8000-0000000000d1';
const VIEWER = '00000000-0000-4000-8000-0000000000a1';

function config(over: Partial<AppConfig>): AppConfig {
  return {
    hasLiveKit: false,
    livekitUrl: undefined,
    livekitApiKey: undefined,
    livekitApiSecret: undefined,
    ...over,
  } as unknown as AppConfig;
}

const configured = config({
  hasLiveKit: true,
  livekitUrl: 'wss://obrigada.livekit.cloud',
  livekitApiKey: 'APIkey123',
  livekitApiSecret: 'secretsecretsecretsecretsecret00',
});

describe('LiveService', () => {
  it('is disabled and refuses to mint when LiveKit is not configured', async () => {
    const service = new LiveService(config({ hasLiveKit: false }));
    expect(service.enabled).toBe(false);
    await expect(service.mintViewerToken(DEVICE, VIEWER)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('mints a view-only token scoped to the guardian room when configured', async () => {
    const service = new LiveService(configured);
    expect(service.enabled).toBe(true);

    const grant = await service.mintViewerToken(DEVICE, VIEWER);
    expect(grant.url).toBe('wss://obrigada.livekit.cloud');
    expect(grant.room).toBe(roomForDevice(DEVICE));
    expect(grant.identity).toBe(VIEWER);
    expect(grant.expiresInSeconds).toBeGreaterThan(0);

    // The token is a signed JWT; its video grant is view-only, scoped to this room.
    const payload = JSON.parse(Buffer.from(grant.token.split('.')[1]!, 'base64url').toString());
    expect(payload.video.room).toBe(roomForDevice(DEVICE));
    expect(payload.video.roomJoin).toBe(true);
    expect(payload.video.canSubscribe).toBe(true);
    expect(payload.video.canPublish).toBe(false);
    expect(payload.sub).toBe(VIEWER);
  });

  it('gives each guardian its own room', () => {
    expect(roomForDevice('a')).not.toBe(roomForDevice('b'));
  });

  it('refuses to mint a publisher token when LiveKit is not configured', async () => {
    const service = new LiveService(config({ hasLiveKit: false }));
    await expect(service.mintPublisherToken(DEVICE)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('mints a publish-only token identified as the device, scoped to its room', async () => {
    const service = new LiveService(configured);
    const grant = await service.mintPublisherToken(DEVICE);
    expect(grant.room).toBe(roomForDevice(DEVICE));
    expect(grant.identity).toBe(DEVICE);

    const payload = JSON.parse(Buffer.from(grant.token.split('.')[1]!, 'base64url').toString());
    expect(payload.video.room).toBe(roomForDevice(DEVICE));
    expect(payload.video.canPublish).toBe(true);
    // Publish-only: the guardian never subscribes to (watches) the room.
    expect(payload.video.canSubscribe).toBe(false);
    expect(payload.sub).toBe(DEVICE);
  });
});
