import type { RingCamera, RingEventRecord, RingPlacement } from './ring.entity';

export interface NewRingEvent {
  familyId: string;
  ringCameraId: string | null;
  ringEventKey: string;
  kind: RingEventRecord['kind'];
  subType: string | null;
  source: RingEventRecord['source'];
  occurredAt: string;
  rawType: string;
}

/** Inserted=false means Ring redelivered an event we already hold (idempotent). */
export interface RecordResult {
  inserted: boolean;
  event: RingEventRecord | null;
}

/** A device as seen by a sync from Ring's device list. */
export interface SyncedDevice {
  ringDeviceId: string;
  name: string;
  online: boolean;
  /** Placement to use only when the camera is new; an existing placement is kept. */
  placementIfNew: RingPlacement;
}

/**
 * Ring cameras (editable configuration) and the append-only Ring event trail. The only
 * write on events is record(); there is no update or delete (rule #2), mirroring the DB
 * trigger.
 */
export interface RingRepository {
  listCameras(familyId: string): Promise<RingCamera[]>;
  findCamera(familyId: string, id: string): Promise<RingCamera | null>;
  /**
   * Returns the camera for this Ring device, creating an unnamed one if unknown, with
   * `placementIfNew` (default 'other'). An existing camera's placement is never changed.
   */
  ensureCamera(
    familyId: string,
    ringDeviceId: string,
    placementIfNew?: RingPlacement,
  ): Promise<RingCamera>;
  /** Insert or refresh name/online from a device sync; never overwrites a set placement. */
  upsertFromSync(familyId: string, device: SyncedDevice): Promise<RingCamera>;
  setPlacement(familyId: string, id: string, placement: RingPlacement): Promise<RingCamera | null>;
  /** Record activity on a camera: bumps last_event_at and optionally sets online. */
  touchCamera(familyId: string, id: string, at: string, online?: boolean): Promise<void>;
  setOnline(familyId: string, id: string, online: boolean): Promise<void>;

  recordEvent(event: NewRingEvent): Promise<RecordResult>;
  /** Newest first. */
  listEvents(familyId: string, limit: number): Promise<RingEventRecord[]>;
}

export const RING_REPOSITORY = Symbol('RING_REPOSITORY');
