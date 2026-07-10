import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import type { SightingDecision } from './sighting-decision.entity';
import { SightingsService } from './sightings.service';

/** The stranger/uniform sighting history for the signed-in caregiver's family (F2.4). */
@Controller('me/sightings')
export class SightingsController {
  constructor(private readonly sightings: SightingsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<SightingDecision[]> {
    return this.sightings.list(user.familyId);
  }
}
