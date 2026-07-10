import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { WanderWatch } from './wander-watch.entity';
import { NewWanderWatch, WanderWatchRepository } from './wander-watch.repository';

@Injectable()
export class InMemoryWanderWatchRepository implements WanderWatchRepository {
  private readonly byId = new Map<string, WanderWatch>();

  async openOrRefresh(watch: NewWanderWatch): Promise<void> {
    const active = [...this.byId.values()].find(
      (w) => w.deviceId === watch.deviceId && w.status === 'watching',
    );
    if (active) {
      active.doorZoneId = watch.doorZoneId;
      active.doorName = watch.doorName;
      active.startedAt = watch.startedAt;
      active.dueAt = watch.dueAt;
      return;
    }
    const id = uuidv4();
    this.byId.set(id, { id, ...watch, status: 'watching' });
  }

  async listDue(now: string): Promise<WanderWatch[]> {
    return [...this.byId.values()].filter((w) => w.status === 'watching' && w.dueAt <= now);
  }

  async resolve(id: string, status: 'returned' | 'alerted'): Promise<void> {
    const watch = this.byId.get(id);
    if (watch) watch.status = status;
  }
}
