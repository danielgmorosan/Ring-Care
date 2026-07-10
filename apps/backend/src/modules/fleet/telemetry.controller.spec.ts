import { UnauthorizedException } from '@nestjs/common';
import type { DevicesService } from '../devices/devices.service';
import type { DeviceCommandsService } from './device-commands.service';
import type { Heartbeat } from './heartbeat';
import type { FleetService } from './fleet.service';
import { TelemetryController } from './telemetry.controller';

const DEVICE = '00000000-0000-4000-8000-0000000000d1';
const GOOD_TOKEN = 'valid-device-token';

describe('TelemetryController', () => {
  let recorded: Array<{ hb: Heartbeat; at: number }>;
  let acks: Array<{ deviceId: string; commandId: string; status: string }>;
  let controller: TelemetryController;

  beforeEach(() => {
    recorded = [];
    acks = [];
    const fleet = {
      recordHeartbeat: async (hb: Heartbeat, at: number) => {
        recorded.push({ hb, at });
      },
    } as unknown as FleetService;
    const devices = {
      verifyHeartbeatToken: async (deviceId: string, token: string) =>
        deviceId === DEVICE && token === GOOD_TOKEN,
    } as unknown as DevicesService;
    const commands = {
      recordAck: async (deviceId: string, commandId: string, status: string) => {
        acks.push({ deviceId, commandId, status });
      },
    } as unknown as DeviceCommandsService;
    controller = new TelemetryController(fleet, devices, commands);
  });

  it('records a full heartbeat with a valid token, stamping the server receive time', async () => {
    await controller.heartbeat(
      { deviceId: DEVICE, batteryPct: 73, thermalC: 31.5, appVersion: 'guardian-lite-0.1' },
      `Bearer ${GOOD_TOKEN}`,
    );

    expect(recorded).toHaveLength(1);
    const { hb, at } = recorded[0]!;
    expect(hb).toMatchObject({ deviceId: DEVICE, batteryPct: 73, appVersion: 'guardian-lite-0.1' });
    expect(hb.time).toBe(new Date(at).toISOString());
  });

  it('passes reported on-device model versions through to the fleet', async () => {
    await controller.heartbeat(
      { deviceId: DEVICE, models: { pose: 'movenet-1.2', vlm: 'gemma-2b-q4' } },
      `Bearer ${GOOD_TOKEN}`,
    );
    expect(recorded[0]!.hb.models).toEqual({ pose: 'movenet-1.2', vlm: 'gemma-2b-q4' });
  });

  it('defaults optional telemetry to null when a guardian only sends its id', async () => {
    await controller.heartbeat({ deviceId: DEVICE }, `Bearer ${GOOD_TOKEN}`);
    expect(recorded[0]!.hb).toMatchObject({
      batteryPct: null,
      thermalC: null,
      appVersion: null,
      models: null,
    });
  });

  it('rejects a heartbeat with a wrong token and records nothing', async () => {
    await expect(controller.heartbeat({ deviceId: DEVICE }, 'Bearer nope')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(recorded).toHaveLength(0);
  });

  it('rejects a heartbeat with no Authorization header', async () => {
    await expect(controller.heartbeat({ deviceId: DEVICE }, undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(recorded).toHaveLength(0);
  });

  it('records a command ack from a token-authenticated guardian', async () => {
    await controller.commandAck(
      { deviceId: DEVICE, commandId: 'cmd-1', status: 'executed' },
      `Bearer ${GOOD_TOKEN}`,
    );
    expect(acks).toEqual([{ deviceId: DEVICE, commandId: 'cmd-1', status: 'executed' }]);
  });

  it('rejects a command ack with a wrong token and records nothing', async () => {
    await expect(
      controller.commandAck(
        { deviceId: DEVICE, commandId: 'cmd-1', status: 'executed' },
        'Bearer no',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(acks).toHaveLength(0);
  });
});
