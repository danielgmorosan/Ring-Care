import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FamiliesService } from '../families/families.service';
import type { Appointment } from './appointment.entity';
import {
  APPOINTMENT_REPOSITORY,
  type AppointmentRepository,
  type AppointmentUpdate,
} from './appointment.repository';
import { CreateAppointmentDto, UpdateAppointmentDto } from './dto/appointment.dto';

/**
 * The per-family appointment calendar (F3.4). Caregiver-managed, family-scoped.
 * Chronological, soonest first.
 */
@Injectable()
export class AppointmentsService {
  constructor(
    @Inject(APPOINTMENT_REPOSITORY) private readonly appointments: AppointmentRepository,
    private readonly families: FamiliesService,
  ) {}

  async list(familyId: string): Promise<Appointment[]> {
    await this.families.findByIdOrFail(familyId);
    return this.appointments.listByFamily(familyId);
  }

  async create(familyId: string, dto: CreateAppointmentDto): Promise<Appointment> {
    await this.families.findByIdOrFail(familyId);
    return this.appointments.create({
      familyId,
      title: dto.title,
      // Normalize to a canonical instant so "today" bucketing is consistent.
      at: new Date(dto.at).toISOString(),
      location: dto.location ?? null,
      notes: dto.notes ?? null,
    });
  }

  async update(familyId: string, id: string, dto: UpdateAppointmentDto): Promise<Appointment> {
    await this.families.findByIdOrFail(familyId);
    const patch: AppointmentUpdate = {};
    if (dto.title !== undefined) patch.title = dto.title;
    // Normalize to a canonical instant so "today" bucketing stays consistent.
    if (dto.at !== undefined) patch.at = new Date(dto.at).toISOString();
    if (dto.location !== undefined) patch.location = dto.location;
    if (dto.notes !== undefined) patch.notes = dto.notes;
    const updated = await this.appointments.update(familyId, id, patch);
    if (!updated) {
      throw new NotFoundException(`Appointment ${id} not found in family ${familyId}`);
    }
    return updated;
  }

  async delete(familyId: string, id: string): Promise<void> {
    await this.families.findByIdOrFail(familyId);
    const deleted = await this.appointments.delete(familyId, id);
    if (!deleted) {
      throw new NotFoundException(`Appointment ${id} not found in family ${familyId}`);
    }
  }
}
