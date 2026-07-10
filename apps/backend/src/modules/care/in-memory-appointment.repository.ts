import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { Appointment } from './appointment.entity';
import { AppointmentRepository, AppointmentUpdate, NewAppointment } from './appointment.repository';

@Injectable()
export class InMemoryAppointmentRepository implements AppointmentRepository {
  private readonly byFamily = new Map<string, Appointment[]>();
  private seq = 0;

  async listByFamily(familyId: string): Promise<Appointment[]> {
    // Chronological, soonest first.
    return [...(this.byFamily.get(familyId) ?? [])].sort((a, b) => a.at.localeCompare(b.at));
  }

  async findById(familyId: string, id: string): Promise<Appointment | null> {
    return (this.byFamily.get(familyId) ?? []).find((a) => a.id === id) ?? null;
  }

  async create(appointment: NewAppointment): Promise<Appointment> {
    const { familyId, ...rest } = appointment;
    const created: Appointment = {
      id: uuidv4(),
      familyId,
      ...rest,
      createdAt: new Date(this.seq++).toISOString(),
    };
    const list = this.byFamily.get(familyId) ?? [];
    list.push(created);
    this.byFamily.set(familyId, list);
    return created;
  }

  async update(
    familyId: string,
    id: string,
    patch: AppointmentUpdate,
  ): Promise<Appointment | null> {
    const list = this.byFamily.get(familyId) ?? [];
    const index = list.findIndex((a) => a.id === id);
    if (index < 0) return null;
    const merged = { ...list[index]!, ...patch };
    list[index] = merged;
    return merged;
  }

  async delete(familyId: string, id: string): Promise<boolean> {
    const list = this.byFamily.get(familyId) ?? [];
    const index = list.findIndex((a) => a.id === id);
    if (index < 0) return false;
    list.splice(index, 1);
    return true;
  }
}
