import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PushToken } from './push-token.entity';
import { PushTokenRepository, UpsertPushToken } from './push-token.repository';

/** In-memory adapter for dev/CI. Keyed by token so re-registering upserts. */
@Injectable()
export class InMemoryPushTokenRepository implements PushTokenRepository {
  private readonly byToken = new Map<string, PushToken>();

  async upsert(input: UpsertPushToken): Promise<PushToken> {
    const existing = this.byToken.get(input.token);
    const record: PushToken = {
      id: existing?.id ?? uuidv4(),
      userId: input.userId,
      familyId: input.familyId,
      token: input.token,
      platform: input.platform,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    this.byToken.set(input.token, record);
    return record;
  }

  async listByFamily(familyId: string): Promise<PushToken[]> {
    return [...this.byToken.values()].filter((t) => t.familyId === familyId);
  }

  async deleteByToken(familyId: string, token: string): Promise<void> {
    const existing = this.byToken.get(token);
    if (existing && existing.familyId === familyId) {
      this.byToken.delete(token);
    }
  }
}
