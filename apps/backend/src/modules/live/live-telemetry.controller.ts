import { Controller, Get, Headers, Query, UnauthorizedException } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { DevicesService } from '../devices/devices.service';
import { LiveService, type LiveGrant } from './live.service';

/**
 * Device-facing publish token for live view (F2.5). When a family member opens the camera,
 * the guardian fetches a publish-only token here and streams its camera into its room; it
 * drops the token and the camera when the viewer leaves, so streaming happens only while
 * someone is watching (decision 0010). The stream is E2EE — LiveKit relays but cannot
 * decrypt, and no media touches the backend.
 *
 * Public to the JWT guard: a guardian has no user token and authenticates with its
 * per-device secret (Authorization: Bearer <deviceToken>), the same credential as the
 * heartbeat, zones, and roster paths.
 */
@Controller('telemetry/live-token')
export class LiveTelemetryController {
  constructor(
    private readonly live: LiveService,
    private readonly devices: DevicesService,
  ) {}

  @Public()
  @Get()
  async publisherToken(
    @Query('deviceId') deviceId: string,
    @Headers('authorization') authorization?: string,
  ): Promise<LiveGrant> {
    await this.authenticateDevice(deviceId, authorization);
    return this.live.mintPublisherToken(deviceId);
  }

  /** Authenticate a guardian by its per-device token. Generic error — no probing oracle. */
  private async authenticateDevice(deviceId: string, authorization?: string): Promise<void> {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!deviceId || !token || !(await this.devices.verifyHeartbeatToken(deviceId, token))) {
      throw new UnauthorizedException('Invalid device credentials');
    }
  }
}
