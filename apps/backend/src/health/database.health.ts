import { Inject, Injectable, Optional } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { PG_POOL, REDIS_CLIENT } from '../database/database.tokens';

/**
 * Readiness indicators for the infrastructure connections. When a dependency is
 * not configured (in-memory / skeleton mode) it reports up with configured:false
 * rather than failing — absence of a DB is a valid mode, an unreachable DB is not.
 */
@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly health: HealthIndicatorService,
    @Optional() @Inject(PG_POOL) private readonly pool: Pool | null,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  async pingPostgres(key = 'postgres'): Promise<HealthIndicatorResult> {
    const indicator = this.health.check(key);
    if (!this.pool) {
      return indicator.up({ configured: false });
    }
    try {
      await this.pool.query('SELECT 1');
      return indicator.up();
    } catch (error) {
      return indicator.down({ message: (error as Error).message });
    }
  }

  async pingRedis(key = 'redis'): Promise<HealthIndicatorResult> {
    const indicator = this.health.check(key);
    if (!this.redis) {
      return indicator.up({ configured: false });
    }
    try {
      const pong = await this.redis.ping(); // lazyConnect connects on first command
      return pong === 'PONG' ? indicator.up() : indicator.down({ message: `unexpected: ${pong}` });
    } catch (error) {
      return indicator.down({ message: (error as Error).message });
    }
  }
}
