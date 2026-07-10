import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Pool } from 'pg';
import { AppConfig } from '../../config/env.validation';
import { PG_POOL } from '../../database/database.tokens';
import { FamiliesModule } from '../families/families.module';
import { ACCESS_LOG_REPOSITORY } from './access-log.repository';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { AuditInterceptor } from './audit.interceptor';
import { InMemoryAccessLogRepository } from './in-memory-access-log.repository';
import { PgAccessLogRepository } from './pg-access-log.repository';

/**
 * Audit: the append-only access log (rule #7) and the caregiver-facing activity
 * history. A global interceptor records every authenticated mutation of family data;
 * the log is the audit trail and the source of the activity feed.
 */
@Module({
  imports: [FamiliesModule],
  controllers: [ActivityController],
  providers: [
    ActivityService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    {
      provide: ACCESS_LOG_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool
          ? new PgAccessLogRepository(pool)
          : new InMemoryAccessLogRepository(),
    },
  ],
  exports: [ActivityService],
})
export class AuditModule {}
