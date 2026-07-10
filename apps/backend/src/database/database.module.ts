import { Global, Injectable, Module, OnModuleDestroy, Inject, Optional } from '@nestjs/common';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { AppConfig } from '../config/env.validation';
import { PG_POOL, REDIS_CLIENT } from './database.tokens';

/**
 * Infrastructure connections. Both are optional: when DATABASE_URL / REDIS_URL are
 * unset the providers resolve to null and repositories fall back to in-memory
 * adapters. This keeps unit/e2e suites DB-free while real deployments get Postgres.
 */
@Injectable()
class ConnectionLifecycle implements OnModuleDestroy {
  constructor(
    @Optional() @Inject(PG_POOL) private readonly pool: Pool | null,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
    this.redis?.disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [AppConfig],
      useFactory: (config: AppConfig): Pool | null =>
        config.hasDatabase ? new Pool({ connectionString: config.databaseUrl }) : null,
    },
    {
      provide: REDIS_CLIENT,
      inject: [AppConfig],
      useFactory: (config: AppConfig): Redis | null =>
        config.redisUrl
          ? new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 })
          : null,
    },
    ConnectionLifecycle,
  ],
  exports: [PG_POOL, REDIS_CLIENT],
})
export class DatabaseModule {}
