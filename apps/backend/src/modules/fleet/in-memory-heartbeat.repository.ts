import { Injectable } from '@nestjs/common';
import { Heartbeat } from './heartbeat';
import { HeartbeatRepository } from './heartbeat.repository';

@Injectable()
export class InMemoryHeartbeatRepository implements HeartbeatRepository {
  private readonly beats: Heartbeat[] = [];

  async record(heartbeat: Heartbeat): Promise<void> {
    this.beats.push(heartbeat);
  }

  async countByDevice(deviceId: string): Promise<number> {
    return this.beats.filter((b) => b.deviceId === deviceId).length;
  }

  async latestByDevice(deviceId: string): Promise<Heartbeat | null> {
    let latest: Heartbeat | null = null;
    for (const b of this.beats) {
      if (b.deviceId !== deviceId) continue;
      if (!latest || b.time > latest.time) latest = b;
    }
    return latest;
  }

  async recentByDevice(deviceId: string, limit: number): Promise<Heartbeat[]> {
    return this.beats
      .filter((b) => b.deviceId === deviceId)
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, limit);
  }
}
