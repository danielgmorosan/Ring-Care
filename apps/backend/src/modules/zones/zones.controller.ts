import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import { CreateZoneDto, UpdateZoneDto } from './dto/zone.dto';
import type { Zone } from './zone.entity';
import { ZonesService } from './zones.service';

/** Safety zones the signed-in caregiver's family has drawn on their guardians (F2.3). */
@Controller('me/zones')
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Zone[]> {
    return this.zones.list(user.familyId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateZoneDto): Promise<Zone> {
    return this.zones.create(user.familyId, dto);
  }

  @Patch(':zoneId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('zoneId') zoneId: string,
    @Body() dto: UpdateZoneDto,
  ): Promise<Zone> {
    return this.zones.update(user.familyId, zoneId, dto);
  }

  @Delete(':zoneId')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('zoneId') zoneId: string): Promise<void> {
    await this.zones.remove(user.familyId, zoneId);
  }
}
