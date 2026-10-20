import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AppConfig } from '../../../config/env.validation';
import { FamiliesService } from '../../families/families.service';
import { VisitArrivalsService } from '../../visits/visit-arrivals.service';
import { buildVisitNoShowMessage } from '../../visits/visit-message';
import { AlertsService } from '../alerts.service';

/** The alert kind (and contract reason) for an expected visitor who did not arrive. */
export const VISIT_NO_SHOW_REASON = 'visit.no_show';

/**
 * Tells the family, once, when an expected visitor has not arrived by start +
 * VISIT_ARRIVAL_GRACE_MINUTES (decision 0011). "Anna was expected at 9:00 and hasn't
 * arrived yet."
 *
 * Crash-safe like the wander and missed-dose sweeps: visits and arrivals are Postgres
 * rows and the once-only guard reads the append-only alerts trail (ref = visit id), so a
 * restart mid-wait loses nothing and never re-alerts.
 *
 * Only the Ring-linked household (RING_FAMILY_ID) is swept: arrivals come from the
 * front-door camera, so a family without one would see every visit as a no-show.
 */
@Injectable()
export class VisitNoShowSweepService {
  private readonly logger = new Logger(VisitNoShowSweepService.name);

  constructor(
    private readonly config: AppConfig,
    private readonly families: FamiliesService,
    private readonly visitArrivals: VisitArrivalsService,
    private readonly alerts: AlertsService,
  ) {}

  @Interval(60_000)
  async scheduledSweep(): Promise<void> {
    await this.sweep(Date.now());
  }

  /** One pass. Exposed (not just the interval) so it is testable with a fake clock. */
  async sweep(nowMs: number): Promise<void> {
    const familyId = this.config.ringFamilyId;
    if (!familyId) return;
    try {
      const { timezone } = await this.families.findByIdOrFail(familyId);
      const due = await this.visitArrivals.dueWithoutArrival(familyId, nowMs);
      for (const visit of due) {
        if (await this.alerts.alreadyRaised(visit.id, VISIT_NO_SHOW_REASON)) continue;
        this.logger.warn(`Visit ${visit.id} has no arrival past its grace period; alerting`);
        await this.alerts.raise({
          familyId,
          deviceId: null,
          kind: VISIT_NO_SHOW_REASON,
          message: buildVisitNoShowMessage(visit.visitorLabel, visit.startsAt, timezone),
          ref: visit.id,
          at: new Date(this.visitArrivals.noShowDueAt(visit)).toISOString(),
        });
      }
    } catch (error) {
      // Nothing is marked done on failure, so the next pass retries.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Visit no-show sweep failed for family ${familyId}: ${message}`);
    }
  }
}
