import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { RingCamera, RingEventRecord, RingPlacement } from './ring.entity';
import type { NewRingEvent, RecordResult, RingRepository, SyncedDevice } from './ring.repository';

/** In-memory adapter (skeleton mode). Dedups events on ring_event_key like the DB. */
@Injectable()
export class InMemoryRingRepository implements RingRepository {
  private readonly cameras: RingCamera[] = [];
  private readonly events: RingEventRecord[] = [];

  async listCameras(familyId: string): Promise<RingCamera[]> {
    return this.cameras
      .filter((c) => c.familyId === familyId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => ({ ...c }));
  }

  async findCamera(familyId: string, id: string): Promise<RingCamera | null> {
    const c = this.cameras.find((x) => x.familyId === familyId && x.id === id);
    return c ? { ...c } : null;
  }

  private byDevice(familyId: string, ringDeviceId: string): RingCamera | undefined {
    return this.cameras.find((c) => c.familyId === familyId && c.ringDeviceId === ringDeviceId);
  }

  private create(familyId: string, ringDeviceId: string, init: Partial<RingCamera>): RingCamera {
    const camera: RingCamera = {
      id: uuidv4(),
      familyId,
      ringDeviceId,
      name: '',
      placement: 'other',
      online: true,
      lastEventAt: null,
      createdAt: new Date().toISOString(),
      ...init,
    };
    this.cameras.push(camera);
    return camera;
  }

  async ensureCamera(
    familyId: string,
    ringDeviceId: string,
    placementIfNew: RingPlacement = 'other',
  ): Promise<RingCamera> {
    const existing = this.byDevice(familyId, ringDeviceId);
    return { ...(existing ?? this.create(familyId, ringDeviceId, { placement: placementIfNew })) };
  }

  async upsertFromSync(familyId: string, device: SyncedDevice): Promise<RingCamera> {
    const existing = this.byDevice(familyId, device.ringDeviceId);
    if (existing) {
      existing.name = device.name;
      existing.online = device.online;
      return { ...existing };
    }
    return {
      ...this.create(familyId, device.ringDeviceId, {
        name: device.name,
        online: device.online,
        placement: device.placementIfNew,
      }),
    };
  }

  async setPlacement(
    familyId: string,
    id: string,
    placement: RingPlacement,
  ): Promise<RingCamera | null> {
    const c = this.cameras.find((x) => x.familyId === familyId && x.id === id);
    if (!c) return null;
    c.placement = placement;
    return { ...c };
  }

  async touchCamera(familyId: string, id: string, at: string, online?: boolean): Promise<void> {
    const c = this.cameras.find((x) => x.familyId === familyId && x.id === id);
    if (!c) return;
    if (!c.lastEventAt || c.lastEventAt < at) c.lastEventAt = at;
    if (online !== undefined) c.online = online;
  }

  async setOnline(familyId: string, id: string, online: boolean): Promise<void> {
    const c = this.cameras.find((x) => x.familyId === familyId && x.id === id);
    if (c) c.online = online;
  }

  async recordEvent(event: NewRingEvent): Promise<RecordResult> {
    if (this.events.some((e) => e.ringEventKey === event.ringEventKey)) {
      return { inserted: false, event: null };
    }
    const record: RingEventRecord = {
      id: uuidv4(),
      ...event,
      receivedAt: new Date().toISOString(),
    };
    this.events.push(record);
    return { inserted: true, event: { ...record } };
  }

  async listActivityReceivedBetween(from: string, to: string): Promise<RingEventRecord[]> {
    return this.events
      .filter(
        (e) =>
          (e.kind === 'motion' || e.kind === 'ding') &&
          e.ringCameraId !== null &&
          e.receivedAt >= from &&
          e.receivedAt <= to,
      )
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
      .map((e) => ({ ...e }));
  }

  async listEvents(familyId: string, limit: number): Promise<RingEventRecord[]> {
    return this.events
      .filter((e) => e.familyId === familyId)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, limit)
      .map((e) => ({ ...e }));
  }
}
