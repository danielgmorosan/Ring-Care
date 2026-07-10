import { NotFoundException } from '@nestjs/common';
import type { DevicesService } from '../devices/devices.service';
import { DoseService } from './dose.service';
import { InMemoryDoseConfirmationRepository } from './in-memory-dose-confirmation.repository';
import { InMemoryMedicationRepository } from './in-memory-medication.repository';

const FAMILY = 'fam-1';
const OTHER_FAMILY = 'fam-2';
const DEVICE = 'device-1';
const OTHER_DEVICE = 'device-2';
const AT = '2026-07-09T08:03:00.000Z';

describe('DoseService', () => {
  let service: DoseService;
  let meds: InMemoryMedicationRepository;
  let medicationId: string;

  beforeEach(async () => {
    meds = new InMemoryMedicationRepository();
    const doses = new InMemoryDoseConfirmationRepository();
    const devices = {
      findById: async (id: string) => {
        if (id === DEVICE) return { id: DEVICE, familyId: FAMILY };
        if (id === OTHER_DEVICE) return { id: OTHER_DEVICE, familyId: OTHER_FAMILY };
        return null;
      },
    } as unknown as DevicesService;
    service = new DoseService(devices, meds, doses);
    const med = await meds.create({
      familyId: FAMILY,
      name: 'Bisoprolol',
      dosage: '5mg',
      times: ['08:00'],
      notes: null,
    });
    medicationId = med.id;
  });

  it('records a confirmation the family can read back, newest first', async () => {
    await service.confirm(DEVICE, 'dose-1', medicationId, '08:00', AT);

    const history = await service.listForMedication(FAMILY, medicationId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ medicationId, slot: '08:00', confirmedAt: AT });
  });

  it('is idempotent on the dose id', async () => {
    await service.confirm(DEVICE, 'dose-dup', medicationId, '08:00', AT);
    await service.confirm(DEVICE, 'dose-dup', medicationId, '08:00', AT);

    expect(await service.listForMedication(FAMILY, medicationId)).toHaveLength(1);
  });

  it('refuses a confirmation for a medication not in the device’s family', async () => {
    // OTHER_DEVICE is in OTHER_FAMILY; the med belongs to FAMILY, so it is not found.
    await expect(
      service.confirm(OTHER_DEVICE, 'dose-x', medicationId, null, AT),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a confirmation from an unregistered device', async () => {
    await expect(service.confirm('ghost', 'dose-x', medicationId, null, AT)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s the adherence history for another family’s medication', async () => {
    await expect(service.listForMedication(OTHER_FAMILY, medicationId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.listForMedication(FAMILY, 'ghost-med')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
