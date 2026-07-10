import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DevicesService } from '../devices/devices.service';
import type { DoseConfirmation } from './dose-confirmation.entity';
import {
  DOSE_CONFIRMATION_REPOSITORY,
  type DoseConfirmationRepository,
} from './dose-confirmation.repository';
import { MEDICATION_REPOSITORY, type MedicationRepository } from './medication.repository';

/**
 * Medication dose confirmations (F3.4). A guardian reports that the elder confirmed a
 * dose (device path); the family reads the adherence history (family path). Both are
 * scoped so a confirmation can only ever be recorded against a medication in the
 * device's own family, and read only by that family.
 */
@Injectable()
export class DoseService {
  constructor(
    private readonly devices: DevicesService,
    @Inject(MEDICATION_REPOSITORY) private readonly medications: MedicationRepository,
    @Inject(DOSE_CONFIRMATION_REPOSITORY) private readonly doses: DoseConfirmationRepository,
  ) {}

  /**
   * Device path: record that the elder confirmed a dose. The device is already token-
   * authenticated for `deviceId`; the medication must belong to that device's family.
   */
  async confirm(
    deviceId: string,
    doseId: string,
    medicationId: string,
    slot: string | null,
    confirmedAt: string,
  ): Promise<void> {
    const device = await this.devices.findById(deviceId);
    if (!device) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }
    const medication = await this.medications.findById(device.familyId, medicationId);
    if (!medication) {
      throw new NotFoundException(`Medication ${medicationId} not found`);
    }
    await this.doses.append({
      doseId,
      medicationId,
      familyId: device.familyId,
      slot,
      confirmedAt,
    });
  }

  /** Family path: a medication's dose-confirmation history, newest first. */
  async listForMedication(familyId: string, medicationId: string): Promise<DoseConfirmation[]> {
    const medication = await this.medications.findById(familyId, medicationId);
    if (!medication) {
      throw new NotFoundException(`Medication ${medicationId} not found in family ${familyId}`);
    }
    return this.doses.listByMedication(familyId, medicationId);
  }
}
