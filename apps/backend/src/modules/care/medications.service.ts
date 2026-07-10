import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FamiliesService } from '../families/families.service';
import { CreateMedicationDto, UpdateMedicationDto } from './dto/medication.dto';
import type { Medication } from './medication.entity';
import {
  MEDICATION_REPOSITORY,
  type MedicationRepository,
  type MedicationUpdate,
} from './medication.repository';

/**
 * The per-family medication schedule (F3.4). Caregiver-managed care configuration,
 * always scoped to the caller's family. Not medical advice — a schedule the family
 * keeps and the app surfaces.
 */
@Injectable()
export class MedicationsService {
  constructor(
    @Inject(MEDICATION_REPOSITORY) private readonly medications: MedicationRepository,
    private readonly families: FamiliesService,
  ) {}

  async list(familyId: string): Promise<Medication[]> {
    await this.families.findByIdOrFail(familyId);
    return this.medications.listByFamily(familyId);
  }

  async create(familyId: string, dto: CreateMedicationDto): Promise<Medication> {
    await this.families.findByIdOrFail(familyId);
    return this.medications.create({
      familyId,
      name: dto.name,
      dosage: dto.dosage ?? null,
      times: normalizeTimes(dto.times ?? []),
      notes: dto.notes ?? null,
    });
  }

  async update(familyId: string, id: string, dto: UpdateMedicationDto): Promise<Medication> {
    await this.families.findByIdOrFail(familyId);
    const patch: MedicationUpdate = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.dosage !== undefined) patch.dosage = dto.dosage;
    if (dto.times !== undefined) patch.times = normalizeTimes(dto.times);
    if (dto.notes !== undefined) patch.notes = dto.notes;
    const updated = await this.medications.update(familyId, id, patch);
    if (!updated) {
      throw new NotFoundException(`Medication ${id} not found in family ${familyId}`);
    }
    return updated;
  }

  async delete(familyId: string, id: string): Promise<void> {
    await this.families.findByIdOrFail(familyId);
    const deleted = await this.medications.delete(familyId, id);
    if (!deleted) {
      throw new NotFoundException(`Medication ${id} not found in family ${familyId}`);
    }
  }
}

/** De-duplicate and sort dose times so the schedule reads in order. */
function normalizeTimes(times: string[]): string[] {
  return [...new Set(times)].sort();
}
