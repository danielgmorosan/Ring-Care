import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { AppConfig } from '../../config/env.validation';
import { PG_POOL } from '../../database/database.tokens';
import { DevicesModule } from '../devices/devices.module';
import { FamiliesModule } from '../families/families.module';
import { InMemoryPeopleRepository } from './in-memory-people.repository';
import { PEOPLE_REPOSITORY } from './people.repository';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';
import { PeopleTelemetryController } from './people-telemetry.controller';
import { PgPeopleRepository } from './pg-people.repository';

/**
 * People: the household roster of enrolled members and their roles (F2.2). The
 * "who belongs" list that stranger/uniform logic (F2.4) builds on. Caregiver-managed
 * configuration, family-scoped. The backend holds only titles and roles — face
 * embeddings and photos never leave the device (CONTRIBUTING.md rule #4).
 */
@Module({
  imports: [FamiliesModule, DevicesModule],
  controllers: [PeopleController, PeopleTelemetryController],
  providers: [
    PeopleService,
    {
      provide: PEOPLE_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool ? new PgPeopleRepository(pool) : new InMemoryPeopleRepository(),
    },
  ],
  exports: [PeopleService],
})
export class PeopleModule {}
