import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { AccessLogEntry, AccessLogRepository, NewAccessLog } from './access-log.repository';

@Injectable()
export class InMemoryAccessLogRepository implements AccessLogRepository {
  private readonly entries: AccessLogEntry[] = [];
  private seq = 0;

  async record(entry: NewAccessLog): Promise<void> {
    this.entries.push({
      id: uuidv4(),
      ...entry,
      // Monotonic synthetic timestamp; avoids Date.now() for stable test ordering.
      at: new Date(this.seq++).toISOString(),
    });
  }

  async listByFamily(familyId: string, limit: number): Promise<AccessLogEntry[]> {
    return this.entries
      .filter((e) => e.familyId === familyId)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, limit);
  }
}
