import type { WanderWatch } from './wander-watch.entity';

/** A watch to open when someone leaves through a door zone. */
export interface NewWanderWatch {
  deviceId: string;
  familyId: string;
  doorZoneId: string;
  doorName: string;
  startedAt: string;
  dueAt: string;
}

/**
 * The wander watches in flight. Operational state (not the append-only trail). At most
 * one watch is `watching` per device: a fresh door exit refreshes the window rather
 * than stacking watches, so the family is never alerted twice for one trip out.
 */
export interface WanderWatchRepository {
  /** Open a watch for the device, or refresh the window if one is already watching. */
  openOrRefresh(watch: NewWanderWatch): Promise<void>;
  /** Watches whose window has closed (dueAt <= now) and are still watching. */
  listDue(now: string): Promise<WanderWatch[]>;
  /** Close a watch with its outcome so the sweep never processes it twice. */
  resolve(id: string, status: 'returned' | 'alerted'): Promise<void>;
}

export const WANDER_WATCH_REPOSITORY = Symbol('WANDER_WATCH_REPOSITORY');
