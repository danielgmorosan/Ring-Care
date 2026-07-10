import { Body, Controller, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { DevicesService } from '../devices/devices.service';
import { DoseService } from './dose.service';
import { DoseConfirmationDto } from './dto/dose-confirmation.dto';

/**
 * Device-facing medication confirmations (F3.4). Public to the JWT guard because a
 * guardian has no user token — it authenticates with the per-device secret it uses for
 * heartbeats. The elder confirms a dose by voice on the guardian; the device reports it
 * here. No audio, only the confirmation (rule #1).
 */
@Controller('telemetry')
export class DoseTelemetryController {
  constructor(
    private readonly devices: DevicesService,
    private readonly doses: DoseService,
  ) {}

  @Public()
  @Post('dose-confirmation')
  @HttpCode(204)
  async confirm(
    @Body() dto: DoseConfirmationDto,
    @Headers('authorization') authorization?: string,
  ): Promise<void> {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!token || !(await this.devices.verifyHeartbeatToken(dto.deviceId, token))) {
      throw new UnauthorizedException('Invalid device credentials');
    }
    await this.doses.confirm(
      dto.deviceId,
      dto.doseId,
      dto.medicationId,
      dto.slot ?? null,
      dto.confirmedAt ?? new Date().toISOString(),
    );
  }
}
