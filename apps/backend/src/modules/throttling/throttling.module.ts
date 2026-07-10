import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfig } from '../../config/env.validation';

/**
 * Rate limiting (per client IP). A default budget covers every route; auth and
 * provisioning carry stricter per-route limits (via @Throttle on the handlers) to
 * blunt brute-force against login, signup, and device claim codes.
 *
 * Skipped when THROTTLE_ENABLED='false' and always in tests — the suites fire many
 * requests from one address and would otherwise trip the limit; throttling itself is
 * proven by a dedicated standalone test.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ ttl: config.throttleTtlSeconds * 1000, limit: config.throttleLimit }],
        skipIf: () => process.env.NODE_ENV === 'test' || !config.throttleEnabled,
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class ThrottlingModule {}
