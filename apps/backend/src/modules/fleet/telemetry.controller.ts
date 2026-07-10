import { Body, Controller, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { DevicesService } from '../devices/devices.service';
import { DeviceCommandsService } from './device-commands.service';
import { CommandAckDto } from './dto/command-ack.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { FleetService } from './fleet.service';

/**
 * Device-facing telemetry. Public to the JWT guard because a guardian has no user
 * token — instead it authenticates with the per-device secret issued at provisioning,
 * presented as `Authorization: Bearer <deviceToken>`. The device id is NOT the
 * credential (that would let anyone spoof a guardian's presence); the token is. The
 * production guardian beats over MQTT with mutual TLS; this HTTP path serves
 * lightweight guardians and onboarding.
 */
@Controller('telemetry')
export class TelemetryController {
  constructor(
    private readonly fleet: FleetService,
    private readonly devices: DevicesService,
    private readonly commands: DeviceCommandsService,
  ) {}

  @Public()
  @Post('heartbeat')
  @HttpCode(204)
  async heartbeat(
    @Body() dto: HeartbeatDto,
    @Headers('authorization') authorization?: string,
  ): Promise<void> {
    await this.authenticateDevice(dto.deviceId, authorization);

    const receivedAtMs = Date.now();
    await this.fleet.recordHeartbeat(
      {
        deviceId: dto.deviceId,
        time: new Date(receivedAtMs).toISOString(),
        batteryPct: dto.batteryPct ?? null,
        thermalC: dto.thermalC ?? null,
        appVersion: dto.appVersion ?? null,
        models: dto.models ?? null,
      },
      receivedAtMs,
    );
  }

  /**
   * A guardian acknowledges it carried out a command (F2.6), closing the remote-wipe
   * loop. Same per-device token auth as the heartbeat. The service checks the command
   * belongs to this device, so a guardian cannot ack another's command.
   */
  @Public()
  @Post('command-ack')
  @HttpCode(204)
  async commandAck(
    @Body() dto: CommandAckDto,
    @Headers('authorization') authorization?: string,
  ): Promise<void> {
    await this.authenticateDevice(dto.deviceId, authorization);
    await this.commands.recordAck(dto.deviceId, dto.commandId, dto.status, dto.detail ?? null);
  }

  /** Authenticate a guardian by its per-device token. Generic error — no spoofing oracle. */
  private async authenticateDevice(deviceId: string, authorization?: string): Promise<void> {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!token || !(await this.devices.verifyHeartbeatToken(deviceId, token))) {
      throw new UnauthorizedException('Invalid device credentials');
    }
  }
}
