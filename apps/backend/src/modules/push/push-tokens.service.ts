import { Inject, Injectable } from '@nestjs/common';
import { FamiliesService } from '../families/families.service';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { PushToken } from './push-token.entity';
import { PUSH_TOKEN_REPOSITORY, type PushTokenRepository } from './push-token.repository';

/**
 * Registry of the devices that may receive a critical alert. The family app
 * registers a token after the caregiver grants notification permission; the
 * escalation ladder reads a family's tokens to know which phones to alert.
 */
@Injectable()
export class PushTokensService {
  constructor(
    @Inject(PUSH_TOKEN_REPOSITORY) private readonly tokens: PushTokenRepository,
    private readonly families: FamiliesService,
  ) {}

  async register(userId: string, familyId: string, dto: RegisterPushTokenDto): Promise<PushToken> {
    // Confirm the family exists (and, by the guard, belongs to the caller).
    await this.families.findByIdOrFail(familyId);
    return this.tokens.upsert({ userId, familyId, token: dto.token, platform: dto.platform });
  }

  /** Every device registered for a family (escalation alerts them all). */
  async listForFamily(familyId: string): Promise<PushToken[]> {
    return this.tokens.listByFamily(familyId);
  }

  async unregister(familyId: string, token: string): Promise<void> {
    await this.tokens.deleteByToken(familyId, token);
  }
}
