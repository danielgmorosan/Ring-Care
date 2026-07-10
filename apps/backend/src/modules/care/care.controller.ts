import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import { CareService, type CareToday } from './care.service';

/** The combined "Today" care view for the signed-in caregiver's family. */
@Controller('me/care')
export class CareController {
  constructor(private readonly care: CareService) {}

  @Get('today')
  today(@CurrentUser() user: AuthUser): Promise<CareToday> {
    return this.care.today(user.familyId);
  }
}
