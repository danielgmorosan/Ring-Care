import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { AppConfig } from '../../config/env.validation';
import { PG_POOL } from '../../database/database.tokens';
import { FamiliesModule } from '../families/families.module';
import { InMemoryPushTokenRepository } from './in-memory-push-token.repository';
import { PgPushTokenRepository } from './pg-push-token.repository';
import { PUSH_TOKEN_REPOSITORY } from './push-token.repository';
import { PushTokensController } from './push-tokens.controller';
import { PushTokensService } from './push-tokens.service';

/**
 * Push registry: the devices that may receive a critical alert. The family app
 * registers a token after the caregiver grants notification permission; escalation
 * reads a family's tokens to know which phones to alert. Exported so escalation can
 * consume it.
 */
@Module({
  imports: [FamiliesModule],
  controllers: [PushTokensController],
  providers: [
    PushTokensService,
    {
      provide: PUSH_TOKEN_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool
          ? new PgPushTokenRepository(pool)
          : new InMemoryPushTokenRepository(),
    },
  ],
  exports: [PushTokensService],
})
export class PushTokensModule {}
