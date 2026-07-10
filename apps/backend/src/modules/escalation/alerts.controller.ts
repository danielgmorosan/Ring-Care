import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import type { Alert } from './alert.entity';
import { AlertsService } from './alerts.service';

/** Every alert the signed-in caregiver's family has received (F2), newest first. */
@Controller('me/alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Alert[]> {
    return this.alerts.list(user.familyId);
  }
}
