import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import { Device } from './device.entity';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { ProvisioningService, type IssuedClaimCode } from './provisioning.service';

/** Guardians for the signed-in caregiver's family. Family derived from the token. */
@Controller('me/devices')
export class DevicesController {
  constructor(
    private readonly devices: DevicesService,
    private readonly provisioning: ProvisioningService,
  ) {}

  @Post()
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceDto): Promise<Device> {
    return this.devices.register({ familyId: user.familyId, name: dto.name });
  }

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Device[]> {
    return this.devices.findByFamily(user.familyId);
  }

  /** Issue a fresh pairing code for one of the caller's guardians. Shown once. */
  @Post(':deviceId/claim-code')
  claimCode(
    @CurrentUser() user: AuthUser,
    @Param('deviceId') deviceId: string,
  ): Promise<IssuedClaimCode> {
    return this.provisioning.issueClaimCode(user.familyId, deviceId);
  }
}
