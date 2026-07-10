import { Injectable } from '@nestjs/common';
import { AppointmentsService } from '../care/appointments.service';
import { MedicationsService } from '../care/medications.service';
import { IncidentsQueryService } from '../escalation/incidents-query.service';
import type { FamilyContext } from '../escalation/narration/narration.port';
import { NarrationService } from '../escalation/narration/narration.service';
import { FamiliesService } from '../families/families.service';
import { FleetHealthService } from '../fleet/fleet-health.service';

export interface AskResult {
  answer: string;
}

/**
 * The family Q&A agent (F3.3, Tier 1 — describe, never act). Assembles the family's
 * structured record (recent incidents, guardian presence, care schedule), minimized
 * to labels/counts/roles — no elder biometrics, pixels, or audio — and asks the
 * narration port to answer the caregiver's question grounded only in those facts.
 * Ephemeral: nothing is stored.
 */
@Injectable()
export class QaService {
  constructor(
    private readonly families: FamiliesService,
    private readonly incidents: IncidentsQueryService,
    private readonly fleet: FleetHealthService,
    private readonly medications: MedicationsService,
    private readonly appointments: AppointmentsService,
    private readonly narration: NarrationService,
  ) {}

  async ask(familyId: string, question: string): Promise<AskResult> {
    const [family, incidents, guardians, medications, appointments] = await Promise.all([
      this.families.findByIdOrFail(familyId),
      this.incidents.listForFamily(familyId),
      this.fleet.forFamily(familyId),
      this.medications.list(familyId),
      this.appointments.list(familyId),
    ]);

    const context: FamilyContext = {
      timezone: family.timezone,
      incidents: incidents.map((i) => ({ reason: i.reason, outcome: i.outcome, at: i.openedAt })),
      guardians: { total: guardians.length, online: guardians.filter((g) => g.online).length },
      medications: medications.map((m) => ({ name: m.name, times: m.times })),
      appointments: appointments.map((a) => ({ title: a.title, at: a.at })),
    };

    const answer = await this.narration.answer({ question, context });
    return { answer };
  }
}
