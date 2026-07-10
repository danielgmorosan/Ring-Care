import { Body, Controller, Get, Headers, Post, Query, UnauthorizedException } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { DevicesService } from '../devices/devices.service';
import { CreateZoneDto } from './dto/zone.dto';
import type { Zone } from './zone.entity';
import { ZonesService } from './zones.service';

/**
 * Device-facing zones sync (F2.3). A guardian draws zones on its own camera view — the
 * frame never leaves the device (rule #1) — then syncs them here and reads back the active
 * set to run its on-device geometry. Public to the JWT guard: a guardian has no user token
 * and authenticates with its per-device secret (Authorization: Bearer <deviceToken>), the
 * same credential as the heartbeat path.
 */
@Controller('telemetry/zones')
export class ZonesTelemetryController {
  constructor(
    private readonly zones: ZonesService,
    private readonly devices: DevicesService,
  ) {}

  /** The device's active zones, so the guardian can run point-in-polygon geometry locally. */
  @Public()
  @Get()
  async list(
    @Query('deviceId') deviceId: string,
    @Headers('authorization') authorization?: string,
  ): Promise<Zone[]> {
    await this.authenticateDevice(deviceId, authorization);
    return this.zones.activeOnDevice(deviceId);
  }

  /** The device saves a zone it drew. deviceId in the body must match the presented token. */
  @Public()
  @Post()
  async create(
    @Body() dto: CreateZoneDto,
    @Headers('authorization') authorization?: string,
  ): Promise<Zone> {
    await this.authenticateDevice(dto.deviceId, authorization);
    return this.zones.createOnDevice(dto.deviceId, dto);
  }

  /** Authenticate a guardian by its per-device token. Generic error — no spoofing oracle. */
  private async authenticateDevice(deviceId: string, authorization?: string): Promise<void> {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!deviceId || !token || !(await this.devices.verifyHeartbeatToken(deviceId, token))) {
      throw new UnauthorizedException('Invalid device credentials');
    }
  }
}
