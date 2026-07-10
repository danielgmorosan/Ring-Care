import { UnauthorizedException } from '@nestjs/common';
import type { DevicesService } from '../devices/devices.service';
import { LiveTelemetryController } from './live-telemetry.controller';
import type { LiveGrant, LiveService } from './live.service';

const DEVICE = '00000000-0000-4000-8000-0000000000d1';
const TOKEN = 'device-secret-token';

function make() {
  const mintPublisherToken = jest
    .fn()
    .mockResolvedValue({ url: 'wss://x', token: 't', room: 'r', identity: DEVICE } as LiveGrant);
  const live = { mintPublisherToken } as unknown as LiveService;
  const devices = {
    verifyHeartbeatToken: async (deviceId: string, token: string) =>
      deviceId === DEVICE && token === TOKEN,
  } as unknown as DevicesService;
  return { controller: new LiveTelemetryController(live, devices), mintPublisherToken };
}

describe('LiveTelemetryController', () => {
  it('mints a publisher token for a guardian with a valid device token', async () => {
    const { controller, mintPublisherToken } = make();
    const grant = await controller.publisherToken(DEVICE, `Bearer ${TOKEN}`);
    expect(mintPublisherToken).toHaveBeenCalledWith(DEVICE);
    expect(grant.token).toBe('t');
  });

  it('rejects a wrong device token, minting nothing', async () => {
    const { controller, mintPublisherToken } = make();
    await expect(controller.publisherToken(DEVICE, 'Bearer nope')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(mintPublisherToken).not.toHaveBeenCalled();
  });

  it('rejects a missing Authorization header', async () => {
    const { controller } = make();
    await expect(controller.publisherToken(DEVICE, undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a missing deviceId', async () => {
    const { controller, mintPublisherToken } = make();
    await expect(controller.publisherToken('', `Bearer ${TOKEN}`)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(mintPublisherToken).not.toHaveBeenCalled();
  });
});
