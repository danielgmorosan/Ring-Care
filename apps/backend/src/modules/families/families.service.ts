import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';
import { InternalEvent, type FamilyCreatedPayload } from '../../internal-events/internal-events';
import { DEFAULT_CHECKIN_LANGUAGE } from './checkin-language';
import { CreateFamilyDto } from './dto/create-family.dto';
import { UpdateFamilyDto } from './dto/update-family.dto';
import { Family } from './family.entity';
import { FAMILY_REPOSITORY, type FamilyPatch, type FamilyRepository } from './family.repository';
import { normalizeTimeZone } from './timezone';

@Injectable()
export class FamiliesService {
  constructor(
    @Inject(FAMILY_REPOSITORY) private readonly families: FamilyRepository,
    private readonly bus: EventEmitter2,
  ) {}

  async create(dto: CreateFamilyDto): Promise<Family> {
    const family: Family = {
      id: uuidv4(),
      name: dto.name,
      timezone: normalizeTimeZone(dto.timezone),
      checkinLanguage: dto.checkinLanguage ?? DEFAULT_CHECKIN_LANGUAGE,
      elderName: dto.elderName ?? null,
      elderRelation: dto.elderRelation ?? null,
      createdAt: new Date().toISOString(),
    };
    const saved = await this.families.create(family);

    const payload: FamilyCreatedPayload = {
      familyId: saved.id,
      createdAt: saved.createdAt,
    };
    this.bus.emit(InternalEvent.FamilyCreated, payload);

    return saved;
  }

  async findAll(): Promise<Family[]> {
    return this.families.findAll();
  }

  async findByIdOrFail(id: string): Promise<Family> {
    const family = await this.families.findById(id);
    if (!family) {
      throw new NotFoundException(`Family ${id} not found`);
    }
    return family;
  }

  /**
   * Update household settings. Timezone is normalized. For the elder's name and relation,
   * undefined leaves the value unchanged and null clears it.
   */
  async update(id: string, dto: UpdateFamilyDto): Promise<Family> {
    const patch: FamilyPatch = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.timezone !== undefined) patch.timezone = normalizeTimeZone(dto.timezone);
    if (dto.checkinLanguage !== undefined) patch.checkinLanguage = dto.checkinLanguage;
    if (dto.elderName !== undefined) patch.elderName = dto.elderName;
    if (dto.elderRelation !== undefined) patch.elderRelation = dto.elderRelation;

    const updated = await this.families.update(id, patch);
    if (!updated) {
      throw new NotFoundException(`Family ${id} not found`);
    }
    return updated;
  }
}
