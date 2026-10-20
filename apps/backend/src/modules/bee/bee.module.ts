import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { Pool } from 'pg';
import { AppConfig } from '../../config/env.validation';
import { PG_POOL } from '../../database/database.tokens';
import { AiModule } from '../ai/ai.module';
import { CareModule } from '../care/care.module';
import { FamiliesModule } from '../families/families.module';
import { BEE_API_PORT } from './bee-api.port';
import { BeeIngestService } from './bee-ingest.service';
import { BeeWebhookController } from './bee-webhook.controller';
import { CARE_PROPOSAL_REPOSITORY } from './care-proposal.repository';
import { CareProposalsController } from './care-proposals.controller';
import { CareProposalsService } from './care-proposals.service';
import { CareExtractorService } from './extraction/care-extractor.service';
import { HttpBeeApiAdapter } from './http-bee-api.adapter';
import { InMemoryCareProposalRepository } from './in-memory-care-proposal.repository';
import { MockBeeApiAdapter } from './mock-bee-api.adapter';
import { PgCareProposalRepository } from './pg-care-proposal.repository';
import { rawTextBody } from './raw-text-body.middleware';

/**
 * Bee integration (decision 0012): the caregiver's own Bee voice notes become proposed
 * care-plan changes the caregiver approves; approved items update the care module and
 * come back to her wrist as Bee todos. See docs/hackathon/bee.md.
 *
 * LLM output only ever creates proposals. The care plan changes on a human approval.
 * LLM_PORT comes from AiModule when it provides one; otherwise extraction falls back to
 * the deterministic rules extractor.
 */
@Module({
  imports: [FamiliesModule, CareModule, AiModule],
  controllers: [BeeWebhookController, CareProposalsController],
  providers: [
    BeeIngestService,
    CareProposalsService,
    CareExtractorService,
    {
      provide: BEE_API_PORT,
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        config.beeApiToken
          ? new HttpBeeApiAdapter(config.beeApiBaseUrl, config.beeApiToken)
          : new MockBeeApiAdapter(),
    },
    {
      provide: CARE_PROPOSAL_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool
          ? new PgCareProposalRepository(pool)
          : new InMemoryCareProposalRepository(),
    },
  ],
  exports: [CareProposalsService],
})
export class BeeModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(rawTextBody).forRoutes({ path: 'bee/webhook', method: RequestMethod.POST });
  }
}
