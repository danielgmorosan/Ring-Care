import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import { UpdateFamilyDto } from './dto/update-family.dto';
import type { Family } from './family.entity';
import { FamiliesService } from './families.service';

/**
 * Household settings for the signed-in caregiver's family: read the current
 * name and timezone, and change them. The timezone is a safety-relevant setting
 * — "today" for the daily summary and care view is the elder's local day — so it
 * must be editable after signup, not frozen at account creation.
 */
@Controller('me/family')
export class FamilyController {
  constructor(private readonly families: FamiliesService) {}

  @Get()
  get(@CurrentUser() user: AuthUser): Promise<Family> {
    return this.families.findByIdOrFail(user.familyId);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateFamilyDto): Promise<Family> {
    return this.families.update(user.familyId, dto);
  }
}
