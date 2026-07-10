/**
 * A zone the family drew on a guardian's camera view (F2.3): a stove area, a doorway,
 * the top of the stairs. The device runs pure geometry — are the person's pose
 * keypoints inside this polygon — entirely on-device (built on F1.2); the backend only
 * stores the definition and syncs it down. No pixels ever leave (rule #1); a polygon is
 * coordinates, not an image.
 *
 * Editable configuration, not the append-only safety trail. Removal is a soft
 * deactivate so historical zone.entry/zone.exit events still resolve to a zone name;
 * the row is never deleted.
 */
export interface Zone {
  id: string;
  /** The camera this zone is drawn on. Zones are per-device, not per-family. */
  deviceId: string;
  familyId: string;
  /** What the family calls it, e.g. "Stove", "Front door", "Stairs". */
  name: string;
  kind: ZoneKind;
  /** The polygon, as points normalized to [0,1] in the device frame. */
  points: ZonePoint[];
  active: boolean;
  createdAt: string;
}

/** A polygon vertex, normalized to the frame so it survives resolution changes. */
export interface ZonePoint {
  x: number;
  y: number;
}

/**
 * How a zone behaves. A `hazard` zone (stove, stairs, balcony) alerts on entry. A
 * `door` zone drives the wandering logic — an exit that isn't followed by a return,
 * or a crossing at an unusual hour. The bounded set is what the evaluator branches on.
 */
export const ZONE_KINDS = ['hazard', 'door'] as const;

export type ZoneKind = (typeof ZONE_KINDS)[number];
