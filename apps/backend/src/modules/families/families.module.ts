import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { AppConfig } from '../../config/env.validation';
import { PG_POOL } from '../../database/database.tokens';
import { FamiliesService } from './families.service';
import { FamilyController } from './family.controller';
import { FAMILY_REPOSITORY } from './family.repository';
import { InMemoryFamilyRepository } from './in-memory-family.repository';
import { PgFamilyRepository } from './pg-family.repository';

// Families are created at signup. FamiliesService is consumed by auth, devices,
// and contacts; the controller exposes household settings (name, timezone).
@Module({
  controllers: [FamilyController],
  providers: [
    FamiliesService,
    {
      // Postgres-backed when a database is configured; in-memory otherwise. The
      // service and controller are unchanged — the repository port is the seam.
      provide: FAMILY_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool ? new PgFamilyRepository(pool) : new InMemoryFamilyRepository(),
    },
  ],
  exports: [FamiliesService],
})
export class FamiliesModule {}
