import { Injectable } from '@nestjs/common';
import { DevicesService } from '../devices/devices.service';
import { FamiliesService } from '../families/families.service';
import { dayInZone } from '../families/timezone';
import { VisitArrivalsService } from '../visits/visit-arrivals.service';
import { IncidentsQueryService } from './incidents-query.service';
import { NarrationService } from './narration/narration.service';

export interface DailySummary {
  /** The day summarized, YYYY-MM-DD in the family's timezone. */
  date: string;
  /** Warm, human-words recap of the day. */
  text: string;
  incidentCount: number;
  guardiansTotal: number;
  guardiansOnline: number;
  /** Expected visits that started today (Ring arrivals, decision 0011). */
  visitsExpected: number;
  visitsArrived: number;
  visitsMissed: number;
}

/**
 * The calm "Today" recap (F3.2). Gathers the day's incidents (or their reassuring
 * absence) and guardian presence, then narrates them in human words. Read-only,
 * scoped to the caller's family. Reuses IncidentsQueryService (which enforces family
 * ownership) so outcome derivation lives in one place.
 *
 * "Today" is the elder's local calendar day, per the family's timezone.
 */
@Injectable()
export class DailySummaryService {
  constructor(
    private readonly incidents: IncidentsQueryService,
    private readonly devices: DevicesService,
    private readonly narration: NarrationService,
    private readonly families: FamiliesService,
    private readonly visitArrivals: VisitArrivalsService,
  ) {}

  async forFamily(familyId: string, date?: string): Promise<DailySummary> {
    const { timezone } = await this.families.findByIdOrFail(familyId);
    const day = date ?? dayInZone(new Date(), timezone);
    const [allIncidents, devices, visits] = await Promise.all([
      this.incidents.listForFamily(familyId),
      this.devices.findByFamily(familyId),
      this.visitArrivals.dayCounts(familyId, day, timezone, Date.now()),
    ]);

    const dayIncidents = allIncidents.filter((i) => dayInZone(i.openedAt, timezone) === day);
    const guardiansTotal = devices.length;
    const guardiansOnline = devices.filter((d) => d.status === 'online').length;

    const text = await this.narration.summarizeDay({
      date: day,
      incidents: dayIncidents.map((i) => ({
        reason: i.reason,
        outcome: i.outcome,
        at: i.openedAt,
      })),
      guardiansTotal,
      guardiansOnline,
      // Counts only, never visitor labels (they can be names).
      ...(visits.expected > 0 ? { visits } : {}),
    });

    return {
      date: day,
      text,
      incidentCount: dayIncidents.length,
      guardiansTotal,
      guardiansOnline,
      visitsExpected: visits.expected,
      visitsArrived: visits.arrived,
      visitsMissed: visits.missed,
    };
  }
}
