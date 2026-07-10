import { Inject, Injectable, Optional } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../database/database.tokens';

const LAST_SEEN_KEY = 'obrigada:presence:lastseen';
const OFFLINE_KEY = 'obrigada:presence:offline';

/**
 * Abstracts where presence lives. Redis when configured (shared across instances),
 * in-memory otherwise. Presence is ephemeral state and never the sole copy of
 * anything — losing it just means devices re-announce on the next heartbeat.
 */
interface PresenceStore {
  setLastSeen(deviceId: string, atMs: number): Promise<void>;
  lastSeenAll(): Promise<Map<string, number>>;
  addOffline(deviceId: string): Promise<void>;
  removeOffline(deviceId: string): Promise<boolean>;
  isOffline(deviceId: string): Promise<boolean>;
}

class MemoryPresenceStore implements PresenceStore {
  private readonly lastSeen = new Map<string, number>();
  private readonly offline = new Set<string>();

  async setLastSeen(deviceId: string, atMs: number): Promise<void> {
    this.lastSeen.set(deviceId, atMs);
  }
  async lastSeenAll(): Promise<Map<string, number>> {
    return new Map(this.lastSeen);
  }
  async addOffline(deviceId: string): Promise<void> {
    this.offline.add(deviceId);
  }
  async removeOffline(deviceId: string): Promise<boolean> {
    return this.offline.delete(deviceId);
  }
  async isOffline(deviceId: string): Promise<boolean> {
    return this.offline.has(deviceId);
  }
}

class RedisPresenceStore implements PresenceStore {
  constructor(private readonly redis: Redis) {}

  async setLastSeen(deviceId: string, atMs: number): Promise<void> {
    await this.redis.hset(LAST_SEEN_KEY, deviceId, atMs);
  }
  async lastSeenAll(): Promise<Map<string, number>> {
    const raw = await this.redis.hgetall(LAST_SEEN_KEY);
    return new Map(Object.entries(raw).map(([k, v]) => [k, Number(v)]));
  }
  async addOffline(deviceId: string): Promise<void> {
    await this.redis.sadd(OFFLINE_KEY, deviceId);
  }
  async removeOffline(deviceId: string): Promise<boolean> {
    return (await this.redis.srem(OFFLINE_KEY, deviceId)) > 0;
  }
  async isOffline(deviceId: string): Promise<boolean> {
    return (await this.redis.sismember(OFFLINE_KEY, deviceId)) === 1;
  }
}

/** A device that has just crossed from online to offline (missed heartbeats). */
export interface NewlyOffline {
  deviceId: string;
  lastSeenAt: number | null;
}

@Injectable()
export class PresenceService {
  private readonly store: PresenceStore;

  constructor(@Optional() @Inject(REDIS_CLIENT) redis: Redis | null) {
    this.store = redis ? new RedisPresenceStore(redis) : new MemoryPresenceStore();
  }

  /** Record a heartbeat. Returns true if this recovered a device that was offline. */
  async touch(deviceId: string, atMs: number): Promise<boolean> {
    await this.store.setLastSeen(deviceId, atMs);
    return this.store.removeOffline(deviceId);
  }

  /**
   * Find devices whose last heartbeat is older than the threshold and that are not
   * already flagged offline, marking them offline so each transition fires once.
   */
  async claimNewlyOffline(thresholdMs: number, nowMs: number): Promise<NewlyOffline[]> {
    const lastSeen = await this.store.lastSeenAll();
    const result: NewlyOffline[] = [];
    for (const [deviceId, at] of lastSeen) {
      if (nowMs - at < thresholdMs) continue;
      if (await this.store.isOffline(deviceId)) continue;
      await this.store.addOffline(deviceId);
      result.push({ deviceId, lastSeenAt: at });
    }
    return result;
  }
}
