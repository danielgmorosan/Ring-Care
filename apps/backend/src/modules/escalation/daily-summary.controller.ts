import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import { DailySummaryService, type DailySummary } from './daily-summary.service';

/** The calm "Today" recap for the signed-in caregiver's family. Read-only. */
@Controller('me/summary')
export class DailySummaryController {
  constructor(private readonly summary: DailySummaryService) {}

  @Get('today')
  today(@CurrentUser() user: AuthUser): Promise<DailySummary> {
    return this.summary.forFamily(user.familyId);
  }
}
