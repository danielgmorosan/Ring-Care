import { UnauthorizedException } from '@nestjs/common';
import type { DevicesService } from '../devices/devices.service';
import { PeopleTelemetryController } from './people-telemetry.controller';
import type { PeopleService } from './people.service';
import type { Person } from './person.entity';

const DEVICE = '00000000-0000-4000-8000-0000000000d1';
const FAMILY = '00000000-0000-4000-8000-0000000000f1';
const TOKEN = 'device-secret-token';

function person(over: Partial<Person>): Person {
  return {
    id: 'p1',
    familyId: FAMILY,
    title: 'Grandfather',
    role: 'resident',
    notes: null,
    active: true,
    createdAt: '2026-07-10T00:00:00.000Z',
    ...over,
  };
}

function make() {
  const list = jest
    .fn()
    .mockResolvedValue([
      person({ id: 'p1', title: 'Grandfather', role: 'resident' }),
      person({ id: 'p2', title: 'Nurse', role: 'caregiver' }),
      person({ id: 'p3', title: 'Old label', active: false }),
    ]);
  const people = { list } as unknown as PeopleService;
  const devices = {
    verifyHeartbeatToken: async (deviceId: string, token: string) =>
      deviceId === DEVICE && token === TOKEN,
    findById: async (deviceId: string) =>
      deviceId === DEVICE ? ({ id: DEVICE, familyId: FAMILY } as never) : null,
  } as unknown as DevicesService;
  const controller = new PeopleTelemetryController(people, devices);
  return { controller, list };
}

describe('PeopleTelemetryController', () => {
  it('returns the active roster (labels only) for the device family when the token is valid', async () => {
    const { controller, list } = make();
    const roster = await controller.list(DEVICE, `Bearer ${TOKEN}`);
    expect(list).toHaveBeenCalledWith(FAMILY);
    // Inactive people are hidden; each entry is labels only (no biometric field).
    expect(roster).toEqual([
      { id: 'p1', title: 'Grandfather', role: 'resident' },
      { id: 'p2', title: 'Nurse', role: 'caregiver' },
    ]);
  });

  it('rejects a wrong token, touching no roster', async () => {
    const { controller, list } = make();
    await expect(controller.list(DEVICE, 'Bearer nope')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(list).not.toHaveBeenCalled();
  });

  it('rejects a missing Authorization header', async () => {
    const { controller } = make();
    await expect(controller.list(DEVICE, undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a missing deviceId', async () => {
    const { controller, list } = make();
    await expect(controller.list('', `Bearer ${TOKEN}`)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(list).not.toHaveBeenCalled();
  });
});
