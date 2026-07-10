import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FamiliesService } from '../families/families.service';
import { CONTACT_REPOSITORY, type ContactRepository } from './contact.repository';
import { CreateContactDto, UpdateContactDto } from './dto/contact.dto';
import type { EscalationContact } from './temporal/types';

/**
 * Manages the per-family escalation contact chain — the ordered list of people the
 * ladder calls, with their quiet-hours contracts. Editable configuration; the
 * deterministic workflow reads it at incident start.
 */
@Injectable()
export class ContactsService {
  constructor(
    @Inject(CONTACT_REPOSITORY) private readonly contacts: ContactRepository,
    private readonly families: FamiliesService,
  ) {}

  async list(familyId: string): Promise<EscalationContact[]> {
    await this.families.findByIdOrFail(familyId);
    return this.contacts.listByFamily(familyId);
  }

  async create(familyId: string, dto: CreateContactDto): Promise<EscalationContact> {
    await this.families.findByIdOrFail(familyId);
    return this.contacts.create({
      familyId,
      name: dto.name,
      role: dto.role,
      phone: dto.phone ?? null,
      pushToken: dto.pushToken ?? null,
      priority: dto.priority,
      quietHours: dto.quietHours ?? null,
    });
  }

  async update(
    familyId: string,
    contactId: string,
    dto: UpdateContactDto,
  ): Promise<EscalationContact> {
    await this.families.findByIdOrFail(familyId);
    const updated = await this.contacts.update(familyId, contactId, dto);
    if (!updated) {
      throw new NotFoundException(`Contact ${contactId} not found in family ${familyId}`);
    }
    return updated;
  }

  async delete(familyId: string, contactId: string): Promise<void> {
    await this.families.findByIdOrFail(familyId);
    const deleted = await this.contacts.delete(familyId, contactId);
    if (!deleted) {
      throw new NotFoundException(`Contact ${contactId} not found in family ${familyId}`);
    }
  }

  /** GDPR erasure: strip identity from every contact in place (see decisions/0005). */
  async redactForFamily(familyId: string): Promise<void> {
    await this.contacts.redactByFamily(familyId);
  }
}
