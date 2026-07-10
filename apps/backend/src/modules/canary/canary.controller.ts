import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../auth/public.decorator';
import { CanaryHealthIndicator } from './canary.health';

/** Exposes /health/canary for external alerting to watch. Public (no token). */
@Public()
@Controller('health')
export class CanaryController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly canary: CanaryHealthIndicator,
  ) {}

  @Get('canary')
  @HealthCheck()
  check() {
    return this.health.check([() => this.canary.check()]);
  }
}
