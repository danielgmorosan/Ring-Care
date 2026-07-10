/**
 * A watch opened when someone leaves through a `door` zone (F2.3 wandering). If no one
 * is seen again on that guardian before the window closes, the family is alerted.
 *
 * Operational state, not the append-only safety trail: the status moves watching →
 * returned | alerted. It lives in Postgres (not Redis) precisely so it survives a crash
 * mid-wait — the sweep re-reads it on restart and still fires an overdue alert.
 */
export interface WanderWatch {
  id: string;
  deviceId: string;
  familyId: string;
  /** The door zone whose exit opened this watch. */
  doorZoneId: string;
  /** The family's label for that door, for the alert copy. */
  doorName: string;
  /** When they left (the door exit's device time). Presence is measured from here. */
  startedAt: string;
  /** When the window closes: startedAt + the wander window. */
  dueAt: string;
  status: WanderWatchStatus;
}

/** watching → someone returned (no alert) | the window closed with no return (alerted). */
export type WanderWatchStatus = 'watching' | 'returned' | 'alerted';
