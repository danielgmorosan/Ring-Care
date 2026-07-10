import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../modules/auth/public.decorator';
import { DatabaseHealthIndicator } from './database.health';
import { MqttHealthIndicator } from './mqtt.health';
import { ShutdownHealthIndicator } from './shutdown.health';

/**
 * Liveness and readiness, split so an orchestrator can tell them apart:
 * - /health/live  — the process is up and serving. No dependency checks, so a DB
 *   blip never restarts an otherwise-healthy process.
 * - /health/ready — every configured dependency (Postgres, Redis, the MQTT device
 *   link) is reachable, and the app is not draining for shutdown. Gates whether
 *   traffic should be routed here.
 * - /health       — kept as an alias of readiness for existing monitors.
 *
 * Indicators report configured:false when a dependency is intentionally absent
 * (skeleton mode) and down when configured-but-unreachable. Public — monitoring
 * must reach it without a token.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
    private readonly mqtt: MqttHealthIndicator,
    private readonly shutdown: ShutdownHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.readiness();
  }

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.readiness();
  }

  private readiness() {
    return this.health.check([
      () => this.shutdown.check(),
      () => this.database.pingPostgres(),
      () => this.database.pingRedis(),
      () => this.mqtt.check(),
    ]);
  }
}
