import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import { DeviceCommandsService, type DeviceCommandView } from './device-commands.service';
import {
  FleetHealthService,
  type FleetGuardian,
  type FleetHistoryPoint,
} from './fleet-health.service';

/** Health and control of the signed-in caregiver's guardians. Family from the token. */
@Controller('me/fleet')
export class FleetController {
  constructor(
    private readonly fleet: FleetHealthService,
    private readonly commands: DeviceCommandsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<FleetGuardian[]> {
    return this.fleet.forFamily(user.familyId);
  }

  /** A guardian's recent battery/thermal trend for the dashboard (F2.6). */
  @Get(':deviceId/history')
  history(
    @CurrentUser() user: AuthUser,
    @Param('deviceId') deviceId: string,
  ): Promise<FleetHistoryPoint[]> {
    return this.fleet.historyForFamily(user.familyId, deviceId);
  }

  /** A guardian's command history with each command's ack status (F2.6). */
  @Get(':deviceId/commands')
  commandHistory(
    @CurrentUser() user: AuthUser,
    @Param('deviceId') deviceId: string,
  ): Promise<DeviceCommandView[]> {
    return this.commands.historyForFamily(user.familyId, deviceId);
  }

  /**
   * Remote-wipe a guardian (F2.6): decommission a lost or retired phone, clearing its
   * encrypted storage including the face embeddings that never left it (rule #4).
   * Accepted (202): the command is recorded and queued for the device link to deliver.
   */
  @Post(':deviceId/wipe')
  @HttpCode(202)
  wipe(
    @CurrentUser() user: AuthUser,
    @Param('deviceId') deviceId: string,
  ): Promise<{ commandId: string }> {
    return this.commands.issueWipe(user.familyId, deviceId, user.id);
  }
}
