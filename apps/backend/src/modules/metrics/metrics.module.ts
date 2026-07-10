import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsListener } from './metrics.listener';
import { MetricsService } from './metrics.service';

/**
 * Observability: a Prometheus /metrics endpoint plus a global interceptor that
 * records HTTP traffic and a listener that turns fall/canary events into counters.
 * Self-hosted — Prometheus scrapes it; no external service or account.
 */
@Module({
  controllers: [MetricsController],
  providers: [
    MetricsService,
    MetricsListener,
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
