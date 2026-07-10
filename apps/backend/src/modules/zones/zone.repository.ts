import type { Zone, ZoneKind, ZonePoint } from './zone.entity';

/** A new zone to add to a device. */
export interface NewZone {
  deviceId: string;
  familyId: string;
  name: string;
  kind: ZoneKind;
  points: ZonePoint[];
}

/** Editable fields of a zone (never id/deviceId/familyId/active/createdAt). */
export type ZoneUpdate = Partial<Pick<Zone, 'name' | 'kind' | 'points'>>;

/**
 * The zones a family has drawn. Editable configuration (unlike the append-only incident
 * trail). Removal is a soft deactivate so historical zone events still resolve to a
 * zone; rows are never deleted. Family-scoped: every mutate-by-id op takes familyId so
 * one family can never touch another's zones.
 */
export interface ZoneRepository {
  /** Active zones across all of a family's devices, for the app. */
  listByFamily(familyId: string): Promise<Zone[]>;
  /** Active zones on one device — what the device syncs and the evaluator reads. */
  listActiveByDevice(deviceId: string): Promise<Zone[]>;
  findById(familyId: string, id: string): Promise<Zone | null>;
  create(zone: NewZone): Promise<Zone>;
  update(familyId: string, id: string, patch: ZoneUpdate): Promise<Zone | null>;
  /** Soft-delete: mark inactive. Returns false if not found or already inactive. */
  deactivate(familyId: string, id: string): Promise<boolean>;
}

export const ZONE_REPOSITORY = Symbol('ZONE_REPOSITORY');
