import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { Alert } from './alert.entity';
import { AlertRepository, NewAlert } from './alert.repository';

@Injectable()
export class InMemoryAlertRepository implements AlertRepository {
  private readonly byFamily = new Map<string, Alert[]>();
  private readonly seen = new Set<string>();
  private seq = 0;

  async append(alert: NewAlert): Promise<void> {
    const key = `${alert.ref}|${alert.kind}`;
    if (this.seen.has(key)) return; // idempotent on (ref, kind)
    this.seen.add(key);
    const record: Alert = {
      id: uuidv4(),
      ...alert,
      // Monotonic synthetic timestamp; avoids Date.now() for stable test ordering.
      createdAt: new Date(this.seq++).toISOString(),
    };
    const list = this.byFamily.get(alert.familyId) ?? [];
    list.push(record);
    this.byFamily.set(alert.familyId, list);
  }

  async listByFamily(familyId: string): Promise<Alert[]> {
    return [...(this.byFamily.get(familyId) ?? [])].sort((a, b) => b.at.localeCompare(a.at));
  }

  async existsByRefKind(ref: string, kind: string): Promise<boolean> {
    return this.seen.has(`${ref}|${kind}`);
  }
}
