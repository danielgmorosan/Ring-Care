import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/user.repository';
import { ActivityService, type ActivityItem } from '../audit/activity.service';
import { AppointmentsService } from '../care/appointments.service';
import { MedicationsService } from '../care/medications.service';
import type { Appointment } from '../care/appointment.entity';
import type { Medication } from '../care/medication.entity';
import { DevicesService } from '../devices/devices.service';
import type { Device } from '../devices/device.entity';
import { ContactsService } from '../escalation/contacts.service';
import { IncidentsQueryService, type IncidentDetail } from '../escalation/incidents-query.service';
import { FamiliesService } from '../families/families.service';
import type { Family } from '../families/family.entity';
import { PushTokensService } from '../push/push-tokens.service';
import type { PushToken } from '../push/push-token.entity';
import type { EscalationContact } from '../escalation/temporal/types';

/** Everything Obrigada holds for a family, for GDPR access/portability (Art. 15/20). */
export interface FamilyDataExport {
  exportedAt: string;
  account: { userId: string; email: string };
  family: Family;
  guardians: Device[];
  contacts: EscalationContact[];
  medications: Medication[];
  appointments: Appointment[];
  incidents: IncidentDetail[];
  pushDevices: PushToken[];
  activity: ActivityItem[];
}

/**
 * Assembles a family's full data export from the modules that own each slice. Every
 * read is family-scoped and ownership-guarded (each service checks the family), so
 * the export can only ever contain the caller's own family. Read-only; the POST that
 * triggers it is recorded on the append-only activity trail (rule #7).
 */
@Injectable()
export class ExportService {
  constructor(
    private readonly families: FamiliesService,
    private readonly devices: DevicesService,
    private readonly contacts: ContactsService,
    private readonly medications: MedicationsService,
    private readonly appointments: AppointmentsService,
    private readonly incidents: IncidentsQueryService,
    private readonly pushTokens: PushTokensService,
    private readonly activity: ActivityService,
  ) {}

  async exportFamily(user: AuthUser): Promise<FamilyDataExport> {
    const familyId = user.familyId;
    const [
      family,
      guardians,
      contacts,
      medications,
      appointments,
      summaries,
      pushDevices,
      activity,
    ] = await Promise.all([
      this.families.findByIdOrFail(familyId),
      this.devices.findByFamily(familyId),
      this.contacts.list(familyId),
      this.medications.list(familyId),
      this.appointments.list(familyId),
      this.incidents.listForFamily(familyId),
      this.pushTokens.listForFamily(familyId),
      this.activity.forFamily(familyId, 1000),
    ]);

    // Expand each incident to its full step trail + narrative.
    const incidents = await Promise.all(
      summaries.map((s) => this.incidents.detailForFamily(familyId, s.id)),
    );

    return {
      exportedAt: new Date().toISOString(),
      account: { userId: user.id, email: user.email },
      family,
      guardians,
      contacts,
      medications,
      appointments,
      incidents,
      pushDevices,
      activity,
    };
  }
}
