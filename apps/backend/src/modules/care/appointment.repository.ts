import type { Appointment } from './appointment.entity';

export interface NewAppointment {
  familyId: string;
  title: string;
  at: string;
  location: string | null;
  notes: string | null;
}

/** Editable fields of an existing appointment. */
export type AppointmentUpdate = Partial<Omit<Appointment, 'id' | 'familyId' | 'createdAt'>>;

/** The per-family appointment calendar. Editable configuration. */
export interface AppointmentRepository {
  listByFamily(familyId: string): Promise<Appointment[]>;
  findById(familyId: string, id: string): Promise<Appointment | null>;
  create(appointment: NewAppointment): Promise<Appointment>;
  update(familyId: string, id: string, patch: AppointmentUpdate): Promise<Appointment | null>;
  delete(familyId: string, id: string): Promise<boolean>;
}

export const APPOINTMENT_REPOSITORY = Symbol('APPOINTMENT_REPOSITORY');
