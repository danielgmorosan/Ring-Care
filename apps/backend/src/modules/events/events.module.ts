import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { AppConfig } from '../../config/env.validation';
import { PG_POOL } from '../../database/database.tokens';
import { EVENT_STREAM_REPOSITORY } from './event-stream.repository';
import { EventsService } from './events.service';
import { InMemoryEventStreamRepository } from './in-memory-event-stream.repository';
import { PgEventStreamRepository } from './pg-event-stream.repository';

/**
 * Events: ingestion and the append-only device event stream (rule #1: labels,
 * timestamps, keypoints, confidences only — never pixels/audio; rule #2: append
 * only). Consumed by the MQTT device link (F0.3).
 */
@Module({
  providers: [
    EventsService,
    {
      provide: EVENT_STREAM_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool
          ? new PgEventStreamRepository(pool)
          : new InMemoryEventStreamRepository(),
    },
  ],
  exports: [EventsService],
})
export class EventsModule {}
