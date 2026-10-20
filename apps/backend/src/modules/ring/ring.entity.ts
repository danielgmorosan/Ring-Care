import type { RingPlacement } from '../../internal-events/internal-events';

export type { RingPlacement };

export const RING_PLACEMENTS: readonly RingPlacement[] = ['front_door', 'indoor', 'other'];

/** What a Ring webhook means to us. 'other' is recorded but drives nothing. */
export type RingEventKind = 'motion' | 'ding' | 'online' | 'offline' | 'other';

export type RingEventSource = 'ring' | 'simulator';

/** A linked Ring camera or doorbell (editable configuration). */
export interface RingCamera {
  id: string;
  familyId: string;
  ringDeviceId: string;
  /** Empty until a device sync names it; webhook auto-created cameras start unnamed. */
  name: string;
  placement: RingPlacement;
  online: boolean;
  lastEventAt: string | null;
  createdAt: string;
}

/** One accepted Ring webhook in the append-only trail. Labels and ids only (rule #1). */
export interface RingEventRecord {
  id: string;
  familyId: string;
  ringCameraId: string | null;
  /** Ring's event id (or a body digest); the idempotency key. */
  ringEventKey: string;
  kind: RingEventKind;
  subType: string | null;
  source: RingEventSource;
  occurredAt: string;
  receivedAt: string;
  rawType: string;
}

/** The caregiver-facing camera shape from the API contract. */
export interface RingCameraView {
  id: string;
  ringDeviceId: string;
  name: string;
  placement: RingPlacement;
  online: boolean;
  lastEventAt: string | null;
}

/** The caregiver-facing activity row from the API contract. */
export interface RingActivity {
  id: string;
  cameraId: string;
  cameraName: string;
  placement: RingPlacement;
  kind: 'motion' | 'ding' | 'online' | 'offline';
  subType: string | null;
  occurredAt: string;
  source: RingEventSource;
  /** Filled by the care-logic workstream later; always null from this module. */
  interpretation: 'night_door' | 'visit_arrival' | null;
}

export interface RingStatus {
  mode: 'oauth' | 'playground' | 'off';
  webhooks: boolean;
  cameras: RingCameraView[];
}

export function toCameraView(c: RingCamera): RingCameraView {
  return {
    id: c.id,
    ringDeviceId: c.ringDeviceId,
    name: c.name,
    placement: c.placement,
    online: c.online,
    lastEventAt: c.lastEventAt,
  };
}
