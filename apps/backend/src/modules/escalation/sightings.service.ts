import { Inject, Injectable } from '@nestjs/common';
import type { SightingDecision } from './sighting-decision.entity';
import { SIGHTING_REPOSITORY, type SightingRepository } from './sighting.repository';

/**
 * The family-facing read side of the stranger/uniform trail (F2.4): who a guardian has
 * seen and how each sighting was judged. Read-only over the append-only store, always
 * scoped to the caller's family.
 */
@Injectable()
export class SightingsService {
  constructor(@Inject(SIGHTING_REPOSITORY) private readonly sightings: SightingRepository) {}

  list(familyId: string): Promise<SightingDecision[]> {
    return this.sightings.listByFamily(familyId);
  }
}
