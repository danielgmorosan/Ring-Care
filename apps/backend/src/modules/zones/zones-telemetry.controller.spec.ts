import { UnauthorizedException } from '@nestjs/common';
import type { DevicesService } from '../devices/devices.service';
import { CreateZoneDto } from './dto/zone.dto';
import type { Zone } from './zone.entity';
import { ZonesTelemetryController } from './zones-telemetry.controller';
import type { ZonesService } from './zones.service';

const DEVICE = '00000000-0000-4000-8000-0000000000d1';
const TOKEN = 'device-secret-token';

function make() {
  const activeOnDevice = jest.fn().mockResolvedValue([{ id: 'z1' } as Zone]);
  const createOnDevice = jest.fn().mockResolvedValue({ id: 'z2' } as Zone);
  const zones = { activeOnDevice, createOnDevice } as unknown as ZonesService;
  const devices = {
    verifyHeartbeatToken: async (deviceId: string, token: string) =>
      deviceId === DEVICE && token === TOKEN,
  } as unknown as DevicesService;
  const controller = new ZonesTelemetryController(zones, devices);
  return { controller, activeOnDevice, createOnDevice };
}

const dto: CreateZoneDto = {
  deviceId: DEVICE,
  name: 'Stove',
  kind: 'hazard',
  points: [
    { x: 0.1, y: 0.1 },
    { x: 0.3, y: 0.1 },
    { x: 0.2, y: 0.3 },
  ],
};

describe('ZonesTelemetryController', () => {
  it('lists a device’s active zones when the token is valid', async () => {
    const { controller, activeOnDevice } = make();
    const zones = await controller.list(DEVICE, `Bearer ${TOKEN}`);
    expect(activeOnDevice).toHaveBeenCalledWith(DEVICE);
    expect(zones).toHaveLength(1);
  });

  it('saves a zone the device drew when the token is valid', async () => {
    const { controller, createOnDevice } = make();
    await controller.create(dto, `Bearer ${TOKEN}`);
    expect(createOnDevice).toHaveBeenCalledWith(DEVICE, dto);
  });

  it('rejects a wrong token, touching no zones', async () => {
    const { controller, activeOnDevice } = make();
    await expect(controller.list(DEVICE, 'Bearer nope')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(activeOnDevice).not.toHaveBeenCalled();
  });

  it('rejects a missing Authorization header', async () => {
    const { controller } = make();
    await expect(controller.list(DEVICE, undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the token is valid for a different device (no cross-device write)', async () => {
    const { controller, createOnDevice } = make();
    const otherDto = { ...dto, deviceId: '00000000-0000-4000-8000-0000000000d2' };
    await expect(controller.create(otherDto, `Bearer ${TOKEN}`)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(createOnDevice).not.toHaveBeenCalled();
  });
});
