import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AppConfig } from '../../config/env.validation';
import { AlertsService } from '../escalation/alerts.service';
import { FamiliesService } from '../families/families.service';
import { dayInZone, minutesSinceMidnightInZone } from '../families/timezone';
import {
  DOSE_CONFIRMATION_REPOSITORY,
  type DoseConfirmationRepository,
} from './dose-confirmation.repository';
import { MEDICATION_REPOSITORY, type MedicationRepository } from './medication.repository';
import { buildMissedDoseMessage } from './missed-dose-message';

const MINUTES_PER_DAY = 24 * 60;
const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Detects medication doses that came and went without confirmation (F3.4) and tells the
 * family, once. For each medication's scheduled "HH:MM" slots, in the family's own
 * timezone: if local time is past the slot plus the miss window and no confirmation was
 * recorded for that slot today, the family is alerted. The alert is de-duplicated on
 * (medication, slot, local day) via the append-only alerts trail, so a still-missed dose
 * is not re-sent on every pass — and the dedup survives a restart because it reads the
 * trail, not memory.
 *
 * Simplification: a slot whose window would cross local midnight is skipped (a dose late
 * at night with a long window). Widening that is a follow-up.
 */
@Injectable()
export class MissedDoseSweepService {
  private readonly logger = new Logger(MissedDoseSweepService.name);

  constructor(
    private readonly families: FamiliesService,
    private readonly alerts: AlertsService,
    private readonly config: AppConfig,
    @Inject(MEDICATION_REPOSITORY) private readonly medications: MedicationRepository,
    @Inject(DOSE_CONFIRMATION_REPOSITORY) private readonly doses: DoseConfirmationRepository,
  ) {}

  @Interval(5 * 60 * 1000)
  async scheduledSweep(): Promise<void> {
    await this.sweep(Date.now());
  }

  /** One detection pass. Exposed (not just the interval) so it is testable. */
  async sweep(nowMs: number): Promise<void> {
    const now = new Date(nowMs).toISOString();
    const windowMin = this.config.missedDoseWindowMinutes;
    const families = await this.families.findAll();

    for (const family of families) {
      try {
        await this.sweepFamily(family.id, family.timezone, now, windowMin);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Missed-dose sweep failed for family ${family.id}: ${message}`);
      }
    }
  }

  private async sweepFamily(
    familyId: string,
    timezone: string,
    now: string,
    windowMin: number,
  ): Promise<void> {
    const today = dayInZone(now, timezone);
    const localNowMin = minutesSinceMidnightInZone(now, timezone);
    const medications = await this.medications.listByFamily(familyId);

    for (const med of medications) {
      // Which of this med's slots were already confirmed today (local)?
      const confirmations = await this.doses.listByMedication(familyId, med.id);
      const confirmedToday = new Set(
        confirmations
          .filter((c) => c.slot && dayInZone(c.confirmedAt, timezone) === today)
          .map((c) => c.slot),
      );

      for (const slot of med.times) {
        const match = HH_MM.exec(slot);
        if (!match) continue;
        const slotMin = Number(match[1]) * 60 + Number(match[2]);
        const dueBy = slotMin + windowMin;
        // Not past the window yet, or the window crosses midnight (skipped, see class doc).
        if (dueBy >= MINUTES_PER_DAY || localNowMin < dueBy) continue;
        if (confirmedToday.has(slot)) continue;

        const ref = `${med.id}:${slot}:${today}`;
        if (await this.alerts.alreadyRaised(ref, 'missed_dose')) continue;

        this.logger.warn(`Missed ${slot} dose of "${med.name}" for family ${familyId}`);
        await this.alerts.raise({
          familyId,
          deviceId: null,
          kind: 'missed_dose',
          message: buildMissedDoseMessage(med.name, slot),
          ref,
          at: now,
        });
      }
    }
  }
}
