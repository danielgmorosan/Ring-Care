import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { EscalationModule } from '../escalation/escalation.module';
import { CanaryController } from './canary.controller';
import { CanaryHealthIndicator } from './canary.health';
import { CanaryService } from './canary.service';

/**
 * Synthetic canary (F1.6): runs a simulated fall through the pipeline on an
 * interval and exposes /health/canary for alerting.
 */
@Module({
  imports: [TerminusModule, EscalationModule],
  controllers: [CanaryController],
  providers: [CanaryService, CanaryHealthIndicator],
})
export class CanaryModule {}
