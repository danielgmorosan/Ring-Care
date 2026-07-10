import { Heartbeat } from './heartbeat';

export interface HeartbeatRepository {
  record(heartbeat: Heartbeat): Promise<void>;
  countByDevice(deviceId: string): Promise<number>;
  /** The most recent heartbeat for a device, or null if it has never beaten. */
  latestByDevice(deviceId: string): Promise<Heartbeat | null>;
  /** The device's most recent heartbeats, newest first, capped at `limit`. */
  recentByDevice(deviceId: string, limit: number): Promise<Heartbeat[]>;
}

export const HEARTBEAT_REPOSITORY = Symbol('HEARTBEAT_REPOSITORY');
