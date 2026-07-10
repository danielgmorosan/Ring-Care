import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FamiliesService } from '../families/families.service';
import { CreatePersonDto, UpdatePersonDto } from './dto/person.dto';
import { PEOPLE_REPOSITORY, type PeopleRepository, type PersonUpdate } from './people.repository';
import type { Person } from './person.entity';

/**
 * The per-family roster of enrolled people (F2.2): who belongs in the household and
 * what role they play. Always scoped to the caller's family. The backend holds only
 * the roster (title + role); face embeddings and photos stay on the device
 * (CLAUDE.md rule #4). Removal is a soft deactivate, never a delete.
 */
@Injectable()
export class PeopleService {
  constructor(
    @Inject(PEOPLE_REPOSITORY) private readonly people: PeopleRepository,
    private readonly families: FamiliesService,
  ) {}

  async list(familyId: string): Promise<Person[]> {
    await this.families.findByIdOrFail(familyId);
    return this.people.listByFamily(familyId);
  }

  async create(familyId: string, dto: CreatePersonDto): Promise<Person> {
    await this.families.findByIdOrFail(familyId);
    return this.people.create({
      familyId,
      title: dto.title,
      role: dto.role,
      notes: dto.notes ?? null,
    });
  }

  async update(familyId: string, id: string, dto: UpdatePersonDto): Promise<Person> {
    await this.families.findByIdOrFail(familyId);
    const patch: PersonUpdate = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.role !== undefined) patch.role = dto.role;
    if (dto.notes !== undefined) patch.notes = dto.notes;
    const updated = await this.people.update(familyId, id, patch);
    if (!updated) {
      throw new NotFoundException(`Person ${id} not found in family ${familyId}`);
    }
    return updated;
  }

  async remove(familyId: string, id: string): Promise<void> {
    await this.families.findByIdOrFail(familyId);
    const removed = await this.people.deactivate(familyId, id);
    if (!removed) {
      throw new NotFoundException(`Person ${id} not found in family ${familyId}`);
    }
  }
}
