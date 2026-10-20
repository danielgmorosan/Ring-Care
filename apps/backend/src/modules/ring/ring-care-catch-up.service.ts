import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { RingCareService } from '../escalation/ring-care/ring-care.service';
import type { RingEventRecord } from './ring.entity';
import { RING_REPOSITORY, type RingRepository } from './ring.repository';

/** How far back the catch-up looks for events that were recorded but never judged. */
export const RING_CATCH_UP_WINDOW_MINUTES = 30;
/** Events younger than this are left to the webhook's own judging (it runs right after). */
export const RING_CATCH_UP_MIN_AGE_MS = 10_000;
/** How often the sweep runs. A night door incident lost to a crash is caught within this. */
export const RING_CATCH_UP_INTERVAL_MS = 30_000;

/**
 * Crash-safe catch-up for Ring care judging (decision 0011). The webhook records the
 * event durably, answers Ring, and only then judges it (after the response). A crash in
 * between would lose a night door incident, so on startup and every
 * RING_CATCH_UP_INTERVAL_MS this re-judges motion and doorbell events received in the
 * last RING_CATCH_UP_WINDOW_MINUTES that have no ring_care_decisions row.
 *
 * Idempotent: judging goes through RingCareService.handle(), serialized per family and
 * keyed on the event's decision row, and an incident already opened for the event is
 * reused, so an event judged twice (webhook and sweep, or two sweeps) opens one incident.
 * Like the visit no-show sweep, it is safe on a single backend instance.
 */
@Injectable()
export class RingCareCatchUpService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RingCareCatchUpService.name);
  private running: Promise<number> | null = null;

  constructor(
    @Inject(RING_REPOSITORY) private readonly repo: RingRepository,
    private readonly ringCare: RingCareService,
  ) {}

  onApplicationBootstrap(): void {
    // Startup catch-up, without holding up boot.
    void this.sweep(Date.now());
  }

  @Interval(RING_CATCH_UP_INTERVAL_MS)
  async scheduledSweep(): Promise<void> {
    await this.sweep(Date.now());
  }

  /** One pass; returns how many events it judged. Overlapping calls share one pass. */
  sweep(nowMs: number): Promise<number> {
    if (!this.running) {
      this.running = this.pass(nowMs).finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async pass(nowMs: number): Promise<number> {
    let judged = 0;
    try {
      const from = new Date(nowMs - RING_CATCH_UP_WINDOW_MINUTES * 60_000).toISOString();
      const to = new Date(nowMs - RING_CATCH_UP_MIN_AGE_MS).toISOString();
      const events = await this.repo.listActivityReceivedBetween(from, to);
      for (const event of events) {
        if (await this.ringCare.isJudged(event.id)) continue;
        if (await this.judge(event)) judged++;
      }
      if (judged > 0) this.logger.warn(`Ring catch-up judged ${judged} unjudged event(s)`);
    } catch (error) {
      // Nothing is marked done on failure, so the next pass retries.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Ring catch-up sweep failed: ${message}`);
    }
    return judged;
  }

  private async judge(event: RingEventRecord): Promise<boolean> {
    if (!event.ringCameraId || (event.kind !== 'motion' && event.kind !== 'ding')) return false;
    const camera = await this.repo.findCamera(event.familyId, event.ringCameraId);
    if (!camera) return false;
    this.logger.warn(`Ring event ${event.id} was recorded but never judged; judging it now`);
    await this.ringCare.handle(
      {
        familyId: event.familyId,
        ringCameraId: camera.id,
        ringEventId: event.id,
        placement: camera.placement,
        subType: event.subType,
        occurredAt: event.occurredAt,
        receivedAt: event.receivedAt,
        source: event.source,
      },
      event.kind,
    );
    return true;
  }
}
