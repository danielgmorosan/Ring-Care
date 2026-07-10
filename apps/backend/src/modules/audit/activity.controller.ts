import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import { ActivityService, type ActivityItem } from './activity.service';

/** The activity history for the signed-in caregiver's family. Read-only. */
@Controller('me/activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<ActivityItem[]> {
    return this.activity.forFamily(user.familyId);
  }
}
