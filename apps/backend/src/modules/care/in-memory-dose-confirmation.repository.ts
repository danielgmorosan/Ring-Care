import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { DoseConfirmation } from './dose-confirmation.entity';
import { DoseConfirmationRepository, NewDoseConfirmation } from './dose-confirmation.repository';

@Injectable()
export class InMemoryDoseConfirmationRepository implements DoseConfirmationRepository {
  private readonly byMedication = new Map<string, DoseConfirmation[]>();
  private readonly seen = new Set<string>();
  private seq = 0;

  async append(confirmation: NewDoseConfirmation): Promise<void> {
    if (this.seen.has(confirmation.doseId)) return; // idempotent on doseId
    this.seen.add(confirmation.doseId);
    const record: DoseConfirmation = {
      id: uuidv4(),
      ...confirmation,
      // Monotonic synthetic timestamp; avoids Date.now() for stable test ordering.
      createdAt: new Date(this.seq++).toISOString(),
    };
    const list = this.byMedication.get(confirmation.medicationId) ?? [];
    list.push(record);
    this.byMedication.set(confirmation.medicationId, list);
  }

  async listByMedication(familyId: string, medicationId: string): Promise<DoseConfirmation[]> {
    return (this.byMedication.get(medicationId) ?? [])
      .filter((c) => c.familyId === familyId)
      .sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt));
  }
}
