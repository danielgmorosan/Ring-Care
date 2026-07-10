import { Injectable } from '@nestjs/common';
import { FamiliesService } from '../families/families.service';
import { dayInZone } from '../families/timezone';
import type { Appointment } from './appointment.entity';
import { AppointmentsService } from './appointments.service';
import type { Medication } from './medication.entity';
import { MedicationsService } from './medications.service';

export interface CareToday {
  /** The day, YYYY-MM-DD in the family's timezone. */
  date: string;
  /** The full medication schedule (doses recur daily). */
  medications: Medication[];
  /** Appointments falling on this day. */
  appointments: Appointment[];
}

/**
 * The combined "Today" care view (F3.4): the medication schedule plus today's
 * appointments, in one call. Family-scoped via the underlying services. "Today" is
 * the elder's local day, per the family's timezone.
 */
@Injectable()
export class CareService {
  constructor(
    private readonly medications: MedicationsService,
    private readonly appointments: AppointmentsService,
    private readonly families: FamiliesService,
  ) {}

  async today(familyId: string, date?: string): Promise<CareToday> {
    const { timezone } = await this.families.findByIdOrFail(familyId);
    const day = date ?? dayInZone(new Date(), timezone);
    const [medications, allAppointments] = await Promise.all([
      this.medications.list(familyId),
      this.appointments.list(familyId),
    ]);
    return {
      date: day,
      medications,
      appointments: allAppointments.filter((a) => dayInZone(a.at, timezone) === day),
    };
  }
}
