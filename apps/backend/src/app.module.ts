import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CareModule } from './modules/care/care.module';
import { DevicesModule } from './modules/devices/devices.module';
import { EscalationModule } from './modules/escalation/escalation.module';
import { EventsModule } from './modules/events/events.module';
import { FamiliesModule } from './modules/families/families.module';
import { FleetModule } from './modules/fleet/fleet.module';
import { LiveModule } from './modules/live/live.module';
import { PeopleModule } from './modules/people/people.module';
import { VisitsModule } from './modules/visits/visits.module';
import { ZonesModule } from './modules/zones/zones.module';
import { QaModule } from './modules/qa/qa.module';
import { GdprModule } from './modules/gdpr/gdpr.module';
import { PushTokensModule } from './modules/push/push-tokens.module';
import { CanaryModule } from './modules/canary/canary.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { MqttModule } from './modules/mqtt/mqtt.module';
import { ThrottlingModule } from './modules/throttling/throttling.module';

@Module({
  imports: [
    // Cross-cutting
    ConfigModule,
    DatabaseModule,
    EventEmitterModule.forRoot(), // in-process bus between modules; no HTTP between them
    ScheduleModule.forRoot(), // drives the offline-detection sweep
    ThrottlingModule, // per-IP rate limiting (global default + strict auth/provision)
    HealthModule,
    AuthModule, // registers the global JwtAuthGuard

    // Domain modules (isolated; communicate via the internal bus or explicit service imports)
    FamiliesModule,
    DevicesModule,
    EventsModule,
    EscalationModule,
    CareModule,
    FleetModule,
    PeopleModule, // enrolled-people roster and roles (F2.2); biometrics stay on device
    VisitsModule, // pre-logged expected visits (F2.4); trusted context for stranger logic
    ZonesModule, // red zones and doorways drawn on guardians (F2.3)
    LiveModule, // family live view via E2EE LiveKit tokens (F2.5); off unless configured
    QaModule, // family Q&A over the structured logs (F3.3)
    GdprModule, // data rights: export now, erasure next (docs/decisions/0005)
    PushTokensModule, // device push-token registry for critical alerts (F1.6)
    AuditModule, // access log + activity history (rule #7)
    MqttModule, // device link (F0.3)
    CanaryModule, // synthetic canary (F1.6)
    MetricsModule, // Prometheus /metrics endpoint + HTTP/domain metrics
  ],
})
export class AppModule {}
