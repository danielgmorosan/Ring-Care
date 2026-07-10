import { NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/user.repository';
import type { DevicesService } from '../devices/devices.service';
import { LiveController } from './live.controller';
import type { LiveGrant, LiveService } from './live.service';

const FAMILY = '00000000-0000-4000-8000-0000000000f1';
const OTHER_FAMILY = '00000000-0000-4000-8000-0000000000f2';
const DEVICE = '00000000-0000-4000-8000-0000000000d1';

const user: AuthUser = {
  id: '00000000-0000-4000-8000-0000000000a1',
  email: 'caregiver@example.com',
  familyId: FAMILY,
  createdAt: '2026-07-10T00:00:00.000Z',
};

function make(deviceFamilyId: string | null) {
  const mintViewerToken = jest
    .fn()
    .mockResolvedValue({ url: 'wss://x', token: 't', room: 'r', identity: user.id } as LiveGrant);
  const live = { mintViewerToken } as unknown as LiveService;
  const findById = jest
    .fn()
    .mockResolvedValue(deviceFamilyId ? { id: DEVICE, familyId: deviceFamilyId } : null);
  const devices = { findById } as unknown as DevicesService;
  return { controller: new LiveController(live, devices), mintViewerToken };
}

describe('LiveController', () => {
  it('mints a token for a guardian that belongs to the caller family', async () => {
    const { controller, mintViewerToken } = make(FAMILY);
    const grant = await controller.open(user, DEVICE);
    expect(mintViewerToken).toHaveBeenCalledWith(DEVICE, user.id);
    expect(grant.token).toBe('t');
  });

  it('404s (and mints nothing) for a guardian in another family', async () => {
    const { controller, mintViewerToken } = make(OTHER_FAMILY);
    await expect(controller.open(user, DEVICE)).rejects.toBeInstanceOf(NotFoundException);
    expect(mintViewerToken).not.toHaveBeenCalled();
  });

  it('404s for an unknown guardian', async () => {
    const { controller, mintViewerToken } = make(null);
    await expect(controller.open(user, DEVICE)).rejects.toBeInstanceOf(NotFoundException);
    expect(mintViewerToken).not.toHaveBeenCalled();
  });
});
