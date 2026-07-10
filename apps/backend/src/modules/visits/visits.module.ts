import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { AppConfig } from '../../config/env.validation';
import { PG_POOL } from '../../database/database.tokens';
import { FamiliesModule } from '../families/families.module';
import { InMemoryVisitsRepository } from './in-memory-visits.repository';
import { VISITS_REPOSITORY } from './visits.repository';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';
import { PgVisitsRepository } from './pg-visits.repository';

/**
 * Visits: the family's pre-logged expected visits (F2.4). The trusted-context input
 * to the stranger/uniform rule (#5) — an unknown person is only "expected" when a
 * visit here covers the moment, or the system itself started an emergency. Caregiver-
 * managed configuration, family-scoped. Exports VisitsService so the stranger
 * evaluator (a later slice) can ask "was anyone expected at time T?".
 */
@Module({
  imports: [FamiliesModule],
  controllers: [VisitsController],
  providers: [
    VisitsService,
    {
      provide: VISITS_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool ? new PgVisitsRepository(pool) : new InMemoryVisitsRepository(),
    },
  ],
  exports: [VisitsService],
})
export class VisitsModule {}
