import { Injectable } from '@nestjs/common';
import type { ClaimCodeRepository, NewClaimCode } from './claim-code.repository';
import type { ClaimCodeRecord } from './provisioning';

@Injectable()
export class InMemoryClaimCodeRepository implements ClaimCodeRepository {
  private readonly codes = new Map<string, ClaimCodeRecord>();
  private seq = 0;

  async create(input: NewClaimCode): Promise<ClaimCodeRecord> {
    const record: ClaimCodeRecord = {
      id: `claim-${this.seq++}`,
      deviceId: input.deviceId,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
      consumedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.codes.set(record.id, record);
    return record;
  }

  async findByCodeHash(codeHash: string): Promise<ClaimCodeRecord | null> {
    for (const record of this.codes.values()) {
      if (record.codeHash === codeHash) return record;
    }
    return null;
  }

  async consume(id: string, consumedAt: string): Promise<void> {
    const record = this.codes.get(id);
    if (record) record.consumedAt = consumedAt;
  }
}
