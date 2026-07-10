import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import {
  IncidentsQueryService,
  type IncidentDetail,
  type IncidentSummary,
} from './incidents-query.service';

/** The incident trail (Timeline) for the signed-in caregiver's family. Read-only. */
@Controller('me/incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsQueryService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<IncidentSummary[]> {
    return this.incidents.listForFamily(user.familyId);
  }

  @Get(':incidentId')
  detail(
    @CurrentUser() user: AuthUser,
    @Param('incidentId') incidentId: string,
  ): Promise<IncidentDetail> {
    return this.incidents.detailForFamily(user.familyId, incidentId);
  }
}
