import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { AppConfig } from '../../config/env.validation';
import { PG_POOL } from '../../database/database.tokens';
import { DevicesModule } from '../devices/devices.module';
import { InMemoryZoneRepository } from './in-memory-zone.repository';
import { PgZoneRepository } from './pg-zone.repository';
import { ZONE_REPOSITORY } from './zone.repository';
import { ZonesController } from './zones.controller';
import { ZonesService } from './zones.service';
import { ZonesTelemetryController } from './zones-telemetry.controller';

/**
 * Zones: the red zones and doorways a family draws on their guardians (F2.3). The
 * device runs the geometry on-device (pose keypoints inside a polygon); the backend
 * stores the definitions and, in a later slice, the evaluator turns zone events into
 * alerts. Caregiver-managed configuration, family-scoped. Exports ZonesService so the
 * zone evaluator can read a device's active zones.
 */
@Module({
  imports: [DevicesModule],
  controllers: [ZonesController, ZonesTelemetryController],
  providers: [
    ZonesService,
    {
      provide: ZONE_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool ? new PgZoneRepository(pool) : new InMemoryZoneRepository(),
    },
  ],
  exports: [ZonesService],
})
export class ZonesModule {}
