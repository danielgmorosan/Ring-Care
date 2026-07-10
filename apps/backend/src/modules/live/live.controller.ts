import { Controller, NotFoundException, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import { DevicesService } from '../devices/devices.service';
import { LiveService, type LiveGrant } from './live.service';

/**
 * Live view (F2.5). A family member opens one of their guardians' cameras and gets a
 * short-lived, view-only LiveKit token. The camera stream is end-to-end encrypted between
 * the guardian and the family device; the backend never sees media, only mints the token.
 *
 * Every open is a POST, so the global AuditInterceptor records it (rule #7: who looked and
 * when). The device must belong to the caller's family — a viewer can never open a stranger's
 * camera.
 */
@Controller('me/live')
export class LiveController {
  constructor(
    private readonly live: LiveService,
    private readonly devices: DevicesService,
  ) {}

  @Post(':deviceId/token')
  async open(
    @CurrentUser() user: AuthUser,
    @Param('deviceId') deviceId: string,
  ): Promise<LiveGrant> {
    const device = await this.devices.findById(deviceId);
    if (!device || device.familyId !== user.familyId) {
      // Same 404 for "no such device" and "not your device" — no cross-family probing oracle.
      throw new NotFoundException('Guardian not found');
    }
    return this.live.mintViewerToken(deviceId, user.id);
  }
}
