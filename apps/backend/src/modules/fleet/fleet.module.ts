import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { AppConfig } from '../../config/env.validation';
import { PG_POOL } from '../../database/database.tokens';
import { DevicesModule } from '../devices/devices.module';
import { EventsModule } from '../events/events.module';
import { DEVICE_COMMAND_ACK_REPOSITORY } from './device-command-ack.repository';
import { DEVICE_COMMAND_REPOSITORY } from './device-command.repository';
import { DeviceCommandsService } from './device-commands.service';
import { FleetController } from './fleet.controller';
import { FleetHealthService } from './fleet-health.service';
import { FleetListener } from './fleet.listener';
import { FleetService } from './fleet.service';
import { HEARTBEAT_REPOSITORY } from './heartbeat.repository';
import { InMemoryDeviceCommandAckRepository } from './in-memory-device-command-ack.repository';
import { InMemoryDeviceCommandRepository } from './in-memory-device-command.repository';
import { InMemoryHeartbeatRepository } from './in-memory-heartbeat.repository';
import { OfflineSweepService } from './offline-sweep.service';
import { PgDeviceCommandAckRepository } from './pg-device-command-ack.repository';
import { PgDeviceCommandRepository } from './pg-device-command.repository';
import { PgHeartbeatRepository } from './pg-heartbeat.repository';
import { PresenceService } from './presence.service';
import { TelemetryController } from './telemetry.controller';

/**
 * Fleet: per-device health, presence, the "guardian offline" detector, and device
 * control (remote wipe). Exposes the family fleet health view (F2.6).
 */
@Module({
  imports: [EventsModule, DevicesModule],
  controllers: [FleetController, TelemetryController],
  providers: [
    FleetService,
    FleetHealthService,
    DeviceCommandsService,
    PresenceService,
    OfflineSweepService,
    FleetListener,
    {
      provide: HEARTBEAT_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool
          ? new PgHeartbeatRepository(pool)
          : new InMemoryHeartbeatRepository(),
    },
    {
      provide: DEVICE_COMMAND_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool
          ? new PgDeviceCommandRepository(pool)
          : new InMemoryDeviceCommandRepository(),
    },
    {
      provide: DEVICE_COMMAND_ACK_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool
          ? new PgDeviceCommandAckRepository(pool)
          : new InMemoryDeviceCommandAckRepository(),
    },
  ],
  exports: [FleetService, OfflineSweepService, FleetHealthService, DeviceCommandsService],
})
export class FleetModule {}
