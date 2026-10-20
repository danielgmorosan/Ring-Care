import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import { CreateVisitDto, UpdateVisitDto } from './dto/visit.dto';
import type { ExpectedVisit } from './visit.entity';
import { VisitArrivalsService, type VisitArrivalView } from './visit-arrivals.service';
import { VisitsService } from './visits.service';

/** Expected visits the signed-in caregiver's family has pre-logged (F2.4). */
@Controller('me/visits')
export class VisitsController {
  constructor(
    private readonly visits: VisitsService,
    private readonly arrivals: VisitArrivalsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<ExpectedVisit[]> {
    return this.visits.list(user.familyId);
  }

  /** Who arrived, from the Ring doorbell (decision 0011): "Anna arrived at 9:02." */
  @Get('arrivals')
  listArrivals(@CurrentUser() user: AuthUser): Promise<VisitArrivalView[]> {
    return this.arrivals.listForFamily(user.familyId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateVisitDto): Promise<ExpectedVisit> {
    return this.visits.create(user.familyId, dto);
  }

  @Patch(':visitId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('visitId') visitId: string,
    @Body() dto: UpdateVisitDto,
  ): Promise<ExpectedVisit> {
    return this.visits.update(user.familyId, visitId, dto);
  }

  @Delete(':visitId')
  @HttpCode(204)
  async delete(@CurrentUser() user: AuthUser, @Param('visitId') visitId: string): Promise<void> {
    await this.visits.delete(user.familyId, visitId);
  }
}
