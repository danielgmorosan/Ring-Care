import { Inject, Injectable } from '@nestjs/common';
import { AppConfig } from '../../config/env.validation';
import { FamiliesService } from '../families/families.service';
import { dayInZone } from '../families/timezone';
import type { VisitArrival } from './visit-arrival.entity';
import { VISIT_ARRIVAL_REPOSITORY, type VisitArrivalRepository } from './visit-arrival.repository';
import type { ExpectedVisit } from './visit.entity';
import { buildVisitArrivalText } from './visit-message';
import { VISITS_REPOSITORY, type VisitsRepository } from './visits.repository';

/**
 * A visitor who rings a few minutes before their window still counts as arrived, so an
 * early carer is not later reported as a no-show.
 */
export const EARLY_ARRIVAL_MINUTES = 15;

/**
 * How far back the no-show sweep looks. A visit whose grace period ended longer ago than
 * this (e.g. while the backend was down for a day, or a visit logged in the past) is not
 * announced late; the family would only be confused by it.
 */
export const NO_SHOW_LOOKBACK_HOURS = 6;

const MINUTE_MS = 60_000;

/** One arrival for the family timeline, with its words. */
export interface VisitArrivalView extends VisitArrival {
  /** "Anna arrived at 9:02." in the household's timezone. */
  text: string;
}

/** A day's expected visits as counts only (no names), for the daily recap. */
export interface VisitDayCounts {
  expected: number;
  arrived: number;
  /** No arrival and the grace period has passed. */
  missed: number;
}

/**
 * Arrivals of expected visitors (decision 0011). The visits module owns the record; the
 * escalation module's Ring care logic decides when a Ring event is an arrival and calls
 * record(). Deterministic: no AI decides any of this (rule #3).
 */
@Injectable()
export class VisitArrivalsService {
  constructor(
    @Inject(VISITS_REPOSITORY) private readonly visits: VisitsRepository,
    @Inject(VISIT_ARRIVAL_REPOSITORY) private readonly arrivals: VisitArrivalRepository,
    private readonly families: FamiliesService,
    private readonly config: AppConfig,
  ) {}

  /** When a visit counts as a no-show: start + VISIT_ARRIVAL_GRACE_MINUTES. */
  noShowDueAt(visit: ExpectedVisit): number {
    return Date.parse(visit.startsAt) + this.config.visitArrivalGraceMinutes * MINUTE_MS;
  }

  /**
   * Visits whose arrival window contains `at`: from EARLY_ARRIVAL_MINUTES before the start
   * to the end of the window. Soonest first.
   */
  async inArrivalWindow(familyId: string, at: string): Promise<ExpectedVisit[]> {
    const t = Date.parse(at);
    const visits = await this.visits.listByFamily(familyId);
    return visits.filter(
      (v) =>
        Date.parse(v.startsAt) - EARLY_ARRIVAL_MINUTES * MINUTE_MS <= t &&
        t <= Date.parse(v.endsAt),
    );
  }

  /** Record that the visitor arrived. False if this visit already has its arrival. */
  record(visit: ExpectedVisit, ringEventId: string, arrivedAt: string): Promise<boolean> {
    return this.arrivals.record({
      visitId: visit.id,
      familyId: visit.familyId,
      ringEventId,
      visitorLabel: visit.visitorLabel,
      arrivedAt: new Date(arrivedAt).toISOString(),
    });
  }

  findByVisit(visitId: string): Promise<VisitArrival | null> {
    return this.arrivals.findByVisit(visitId);
  }

  /**
   * Visits that should have started by now and have no arrival: start + grace has passed
   * (within the lookback), and nobody arrived. The caller alerts once per visit.
   */
  async dueWithoutArrival(familyId: string, nowMs: number): Promise<ExpectedVisit[]> {
    const visits = await this.visits.listByFamily(familyId);
    const due: ExpectedVisit[] = [];
    for (const visit of visits) {
      const dueAt = this.noShowDueAt(visit);
      if (dueAt > nowMs || dueAt < nowMs - NO_SHOW_LOOKBACK_HOURS * 60 * MINUTE_MS) continue;
      if (await this.arrivals.findByVisit(visit.id)) continue;
      due.push(visit);
    }
    return due;
  }

  /**
   * Counts for the visits that started on `day` (YYYY-MM-DD in `tz`): how many were
   * expected, how many arrived, and how many are past their grace period with no arrival.
   */
  async dayCounts(
    familyId: string,
    day: string,
    tz: string,
    nowMs: number,
  ): Promise<VisitDayCounts> {
    const visits = (await this.visits.listByFamily(familyId)).filter(
      (v) => dayInZone(v.startsAt, tz) === day,
    );
    let arrived = 0;
    let missed = 0;
    for (const visit of visits) {
      if (await this.arrivals.findByVisit(visit.id)) arrived++;
      else if (this.noShowDueAt(visit) <= nowMs) missed++;
    }
    return { expected: visits.length, arrived, missed };
  }

  /** The family's arrivals, newest first, with timeline words in the household's clock. */
  async listForFamily(familyId: string): Promise<VisitArrivalView[]> {
    const { timezone } = await this.families.findByIdOrFail(familyId);
    const arrivals = await this.arrivals.listByFamily(familyId);
    return arrivals.map((a) => ({
      ...a,
      text: buildVisitArrivalText(a.visitorLabel, a.arrivedAt, timezone),
    }));
  }
}
