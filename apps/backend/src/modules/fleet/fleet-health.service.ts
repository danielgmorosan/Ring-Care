import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AppConfig } from '../../config/env.validation';
import type { DeviceStatus } from '../devices/device.entity';
import { DevicesService } from '../devices/devices.service';
import { HEARTBEAT_REPOSITORY, type HeartbeatRepository } from './heartbeat.repository';

/** How many recent heartbeats the history endpoint returns at most. */
const HISTORY_LIMIT = 200;

/** One point on a guardian's battery/thermal trend. */
export interface FleetHistoryPoint {
  at: string;
  batteryPct: number | null;
  thermalC: number | null;
}

/** One guardian's health for the family fleet view. */
export interface FleetGuardian {
  id: string;
  name: string;
  /** Provisioning lifecycle status (registered | provisioning | online | offline). */
  status: DeviceStatus;
  /** True when the last heartbeat is recent enough (within the offline threshold). */
  online: boolean;
  /** ISO time of the most recent heartbeat, or null if it has never beaten. */
  lastSeenAt: string | null;
  batteryPct: number | null;
  thermalC: number | null;
  appVersion: string | null;
  /** On-device model versions from the latest heartbeat (name → version), or null. */
  models: Record<string, string> | null;
}

/**
 * The family-facing fleet health view (F2.6). Combines the device roster with each
 * guardian's latest heartbeat (battery, thermal, app version) and derives online-ness
 * from heartbeat recency. Naturally family-scoped: it only ever reads the caller's
 * own devices. Uses the durable heartbeat table (survives a restart), while the
 * offline-alerting path keeps using ephemeral presence with server-side time.
 */
@Injectable()
export class FleetHealthService {
  constructor(
    private readonly devices: DevicesService,
    @Inject(HEARTBEAT_REPOSITORY) private readonly heartbeats: HeartbeatRepository,
    private readonly config: AppConfig,
  ) {}

  async forFamily(familyId: string, nowMs: number = Date.now()): Promise<FleetGuardian[]> {
    const thresholdMs = this.config.deviceOfflineThresholdSeconds * 1000;
    const devices = await this.devices.findByFamily(familyId);

    return Promise.all(
      devices.map(async (device) => {
        const latest = await this.heartbeats.latestByDevice(device.id);
        const lastSeenMs = latest ? new Date(latest.time).getTime() : null;
        return {
          id: device.id,
          name: device.name,
          status: device.status,
          online: lastSeenMs !== null && nowMs - lastSeenMs < thresholdMs,
          lastSeenAt: latest?.time ?? null,
          batteryPct: latest?.batteryPct ?? null,
          thermalC: latest?.thermalC ?? null,
          appVersion: latest?.appVersion ?? null,
          models: latest?.models ?? null,
        };
      }),
    );
  }

  /**
   * A guardian's recent battery/thermal trend for the dashboard, newest first. Requires
   * owning the device — another family's guardian is a 404, never a leak.
   */
  async historyForFamily(familyId: string, deviceId: string): Promise<FleetHistoryPoint[]> {
    const device = await this.devices.findById(deviceId);
    if (!device || device.familyId !== familyId) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }
    const beats = await this.heartbeats.recentByDevice(deviceId, HISTORY_LIMIT);
    return beats.map((b) => ({ at: b.time, batteryPct: b.batteryPct, thermalC: b.thermalC }));
  }
}
