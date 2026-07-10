import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { Zone } from './zone.entity';
import { NewZone, ZoneRepository, ZoneUpdate } from './zone.repository';

@Injectable()
export class InMemoryZoneRepository implements ZoneRepository {
  private readonly byId = new Map<string, Zone>();
  private seq = 0;

  async listByFamily(familyId: string): Promise<Zone[]> {
    return [...this.byId.values()]
      .filter((z) => z.familyId === familyId && z.active)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listActiveByDevice(deviceId: string): Promise<Zone[]> {
    return [...this.byId.values()]
      .filter((z) => z.deviceId === deviceId && z.active)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async findById(familyId: string, id: string): Promise<Zone | null> {
    const zone = this.byId.get(id);
    return zone && zone.familyId === familyId ? zone : null;
  }

  async create(zone: NewZone): Promise<Zone> {
    const created: Zone = {
      id: uuidv4(),
      ...zone,
      active: true,
      // Monotonic synthetic timestamp; avoids Date.now() for stable test ordering.
      createdAt: new Date(this.seq++).toISOString(),
    };
    this.byId.set(created.id, created);
    return created;
  }

  async update(familyId: string, id: string, patch: ZoneUpdate): Promise<Zone | null> {
    const zone = this.byId.get(id);
    if (!zone || zone.familyId !== familyId || !zone.active) return null;
    const merged = { ...zone, ...patch };
    this.byId.set(id, merged);
    return merged;
  }

  async deactivate(familyId: string, id: string): Promise<boolean> {
    const zone = this.byId.get(id);
    if (!zone || zone.familyId !== familyId || !zone.active) return false;
    zone.active = false;
    return true;
  }
}
