import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { MqttModule } from '../modules/mqtt/mqtt.module';
import { DatabaseHealthIndicator } from './database.health';
import { HealthController } from './health.controller';
import { MqttHealthIndicator } from './mqtt.health';
import { ReadinessService } from './readiness.service';
import { ShutdownHealthIndicator } from './shutdown.health';

@Module({
  imports: [TerminusModule, MqttModule],
  controllers: [HealthController],
  providers: [
    DatabaseHealthIndicator,
    MqttHealthIndicator,
    ReadinessService,
    ShutdownHealthIndicator,
  ],
})
export class HealthModule {}
