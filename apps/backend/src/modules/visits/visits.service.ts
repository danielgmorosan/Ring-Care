import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FamiliesService } from '../families/families.service';
import { CreateVisitDto, UpdateVisitDto } from './dto/visit.dto';
import type { ExpectedVisit } from './visit.entity';
import { VISITS_REPOSITORY, type VisitsRepository, type VisitUpdate } from './visits.repository';

/**
 * The per-family list of pre-logged expected visits (F2.4). Caregiver-managed
 * configuration, always scoped to the caller's family. This is the trusted-context
 * side of rule #5: a stranger is only "expected" if the family logged the visit here
 * (or the system itself started an emergency) — never because of a uniform.
 */
@Injectable()
export class VisitsService {
  constructor(
    @Inject(VISITS_REPOSITORY) private readonly visits: VisitsRepository,
    private readonly families: FamiliesService,
  ) {}

  async list(familyId: string): Promise<ExpectedVisit[]> {
    await this.families.findByIdOrFail(familyId);
    return this.visits.listByFamily(familyId);
  }

  /** Expected visits whose window contains `at` — the seam the stranger evaluator reads. */
  async covering(familyId: string, at: string): Promise<ExpectedVisit[]> {
    return this.visits.findCovering(familyId, new Date(at).toISOString());
  }

  async create(familyId: string, dto: CreateVisitDto): Promise<ExpectedVisit> {
    await this.families.findByIdOrFail(familyId);
    // Canonicalize to instants so window comparisons are consistent everywhere.
    const startsAt = new Date(dto.startsAt).toISOString();
    const endsAt = new Date(dto.endsAt).toISOString();
    assertOrderedWindow(startsAt, endsAt);
    return this.visits.create({
      familyId,
      visitorLabel: dto.visitorLabel,
      startsAt,
      endsAt,
      notes: dto.notes ?? null,
    });
  }

  async update(familyId: string, id: string, dto: UpdateVisitDto): Promise<ExpectedVisit> {
    await this.families.findByIdOrFail(familyId);
    const existing = await this.visits.findById(familyId, id);
    if (!existing) {
      throw new NotFoundException(`Expected visit ${id} not found in family ${familyId}`);
    }
    const patch: VisitUpdate = {};
    if (dto.visitorLabel !== undefined) patch.visitorLabel = dto.visitorLabel;
    if (dto.startsAt !== undefined) patch.startsAt = new Date(dto.startsAt).toISOString();
    if (dto.endsAt !== undefined) patch.endsAt = new Date(dto.endsAt).toISOString();
    if (dto.notes !== undefined) patch.notes = dto.notes;
    // Validate the resulting window, not just the changed field.
    assertOrderedWindow(patch.startsAt ?? existing.startsAt, patch.endsAt ?? existing.endsAt);
    const updated = await this.visits.update(familyId, id, patch);
    if (!updated) {
      throw new NotFoundException(`Expected visit ${id} not found in family ${familyId}`);
    }
    return updated;
  }

  async delete(familyId: string, id: string): Promise<void> {
    await this.families.findByIdOrFail(familyId);
    const deleted = await this.visits.delete(familyId, id);
    if (!deleted) {
      throw new NotFoundException(`Expected visit ${id} not found in family ${familyId}`);
    }
  }
}

/** A visit window must open before it closes; a zero or inverted window is a mistake. */
function assertOrderedWindow(startsAt: string, endsAt: string): void {
  if (endsAt <= startsAt) {
    throw new BadRequestException('endsAt must be after startsAt');
  }
}
