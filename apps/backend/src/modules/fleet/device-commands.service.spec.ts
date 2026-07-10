import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  InternalEvent,
  type DeviceCommandIssuedPayload,
} from '../../internal-events/internal-events';
import type { DevicesService } from '../devices/devices.service';
import { DeviceCommandsService } from './device-commands.service';
import { InMemoryDeviceCommandAckRepository } from './in-memory-device-command-ack.repository';
import { InMemoryDeviceCommandRepository } from './in-memory-device-command.repository';

const FAMILY = 'fam-1';
const OTHER_FAMILY = 'fam-2';
const DEVICE = 'device-1';
const OTHER_DEVICE = 'device-2';
const USER = 'user-1';

describe('DeviceCommandsService', () => {
  let service: DeviceCommandsService;
  let repo: InMemoryDeviceCommandRepository;
  let bus: EventEmitter2;
  let emit: jest.SpyInstance;

  beforeEach(() => {
    repo = new InMemoryDeviceCommandRepository();
    bus = new EventEmitter2();
    emit = jest.spyOn(bus, 'emit');
    const devices = {
      findById: async (id: string) => (id === DEVICE ? { id: DEVICE, familyId: FAMILY } : null),
    } as unknown as DevicesService;
    service = new DeviceCommandsService(
      devices,
      repo,
      new InMemoryDeviceCommandAckRepository(),
      bus,
    );
  });

  it('records the wipe and emits DeviceCommandIssued with the command id', async () => {
    const { commandId } = await service.issueWipe(FAMILY, DEVICE, USER);

    const history = await service.historyForFamily(FAMILY, DEVICE);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ id: commandId, command: 'wipe', status: 'pending' });

    const issued = emit.mock.calls.filter((c) => c[0] === InternalEvent.DeviceCommandIssued);
    expect(issued).toHaveLength(1);
    expect(issued[0]![1] as DeviceCommandIssuedPayload).toMatchObject({
      deviceId: DEVICE,
      commandId,
      command: 'wipe',
    });
  });

  it('refuses to wipe a device another family owns', async () => {
    await expect(service.issueWipe(OTHER_FAMILY, DEVICE, USER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(emit.mock.calls.some((c) => c[0] === InternalEvent.DeviceCommandIssued)).toBe(false);
  });

  it('refuses to wipe an unknown device', async () => {
    await expect(service.issueWipe(FAMILY, 'ghost-device', USER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('records a guardian’s ack and reflects it in the history status', async () => {
    const { commandId } = await service.issueWipe(FAMILY, DEVICE, USER);

    // Pending until the device acks.
    expect((await service.historyForFamily(FAMILY, DEVICE))[0]).toMatchObject({
      id: commandId,
      status: 'pending',
    });

    await service.recordAck(DEVICE, commandId, 'executed', null);

    expect((await service.historyForFamily(FAMILY, DEVICE))[0]).toMatchObject({
      status: 'executed',
    });
  });

  it('refuses an ack for a command that is not this device’s', async () => {
    const { commandId } = await service.issueWipe(FAMILY, DEVICE, USER);

    await expect(
      service.recordAck(OTHER_DEVICE, commandId, 'executed', null),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.recordAck(DEVICE, 'ghost-command', 'executed', null),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s command history for a device another family owns', async () => {
    await expect(service.historyForFamily(OTHER_FAMILY, DEVICE)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
