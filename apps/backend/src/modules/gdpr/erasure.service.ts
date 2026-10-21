import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { RING_REPOSITORY, type RingRepository } from '../ring/ring.repository';
import { VisitsService } from '../visits/visits.service';
import type { AuthUser } from '../auth/user.repository';
import { USER_REPOSITORY, type UserRepository } from '../auth/user.repository';
import { AppointmentsService } from '../care/appointments.service';
import { MedicationsService } from '../care/medications.service';
import { DevicesService } from '../devices/devices.service';
import { ContactsService } from '../escalation/contacts.service';
import { FamiliesService } from '../families/families.service';
import { PushTokensService } from '../push/push-tokens.service';

const ERASED_HOUSEHOLD = 'Erased household';

/**
 * GDPR erasure (Art. 17). Removes every piece of identifying data a family owns while
 * preserving the append-only safety trail, which is retained under Art. 17(3) and is
 * already non-identifying (labels + roles, never names). See docs/decisions/0005.
 *
 * - Redacted in place (rows referenced by the append-only trail): contacts, device
 *   names, Ring camera names, caregiver accounts (email → tombstone, password
 *   disabled), family name, and the elder's display name and relation (blanked).
 * - Deleted (standalone, unreferenced): medications, appointments, push tokens,
 *   expected visits.
 * - Untouched (append-only, retained under Art. 17(3)): event_stream, incidents,
 *   incident_steps, narratives, access_log, ring_events, ring_care_decisions,
 *   visit_arrivals, care_proposals, care_proposal_decisions. The last three carry
 *   free text (a visitor's label, a proposal's summary and items); decision 0005 lists
 *   them as an open retention question for founder sign-off.
 *
 * Irreversible, so it requires the caregiver to type their exact family name back.
 */
@Injectable()
export class ErasureService {
  private readonly logger = new Logger(ErasureService.name);

  constructor(
    private readonly families: FamiliesService,
    private readonly contacts: ContactsService,
    private readonly medications: MedicationsService,
    private readonly appointments: AppointmentsService,
    private readonly pushTokens: PushTokensService,
    private readonly devices: DevicesService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly visits: VisitsService,
    @Inject(RING_REPOSITORY) private readonly ring: RingRepository,
  ) {}

  async erase(user: AuthUser, confirmName: string): Promise<{ erased: true }> {
    const familyId = user.familyId;
    const family = await this.families.findByIdOrFail(familyId);

    // A destructive, irreversible action: the caller must type the exact family name.
    if (confirmName.trim() !== family.name) {
      throw new BadRequestException('Confirmation name does not match the family name');
    }

    // Redact rows the append-only trail references (keep the row, drop the identity).
    await this.contacts.redactForFamily(familyId);
    await this.devices.redactNamesForFamily(familyId);
    await this.ring.redactCameraNamesForFamily(familyId); // ring_events reference the rows

    // Delete standalone, unreferenced records.
    for (const m of await this.medications.list(familyId)) {
      await this.medications.delete(familyId, m.id);
    }
    for (const a of await this.appointments.list(familyId)) {
      await this.appointments.delete(familyId, a.id);
    }
    for (const t of await this.pushTokens.listForFamily(familyId)) {
      await this.pushTokens.unregister(familyId, t.token);
    }
    // Expected visits are editable configuration (visitor labels, notes). visit_arrivals
    // keeps its own copy of the label and carries no foreign key, so nothing breaks.
    for (const v of await this.visits.list(familyId)) {
      await this.visits.delete(familyId, v.id);
    }

    // Irreversibly erase the caregiver accounts, then the family name and the elder's
    // display name and relation last.
    await this.users.redactByFamily(familyId);
    await this.families.update(familyId, {
      name: ERASED_HOUSEHOLD,
      elderName: null,
      elderRelation: null,
    });

    this.logger.log(`Erased identifying data for family ${familyId} (audit trail retained)`);
    return { erased: true };
  }
}
