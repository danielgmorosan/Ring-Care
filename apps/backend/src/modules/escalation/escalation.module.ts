import { Module } from '@nestjs/common';
import { Client, Connection } from '@temporalio/client';
import { Pool } from 'pg';
import { AppConfig } from '../../config/env.validation';
import { PG_POOL } from '../../database/database.tokens';
import { AiModule } from '../ai/ai.module';
import { DevicesModule } from '../devices/devices.module';
import { EventsModule } from '../events/events.module';
import { FamiliesModule } from '../families/families.module';
import { PushTokensModule } from '../push/push-tokens.module';
import { VisitsModule } from '../visits/visits.module';
import { ZonesModule } from '../zones/zones.module';
import { ALERT_REPOSITORY } from './alert.repository';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { InMemoryAlertRepository } from './in-memory-alert.repository';
import { PgAlertRepository } from './pg-alert.repository';
import { CONTACT_REPOSITORY } from './contact.repository';
import { DailySummaryController } from './daily-summary.controller';
import { DailySummaryService } from './daily-summary.service';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { EscalationController } from './escalation.controller';
import { EscalationService } from './escalation.service';
import { EscalationTriggerService } from './escalation-trigger.service';
import { EscalationWorkerService } from './escalation-worker.service';
import { INCIDENT_REPOSITORY } from './incident.repository';
import { IncidentsController } from './incidents.controller';
import { IncidentsQueryService } from './incidents-query.service';
import { InMemoryContactRepository } from './in-memory-contact.repository';
import { InMemoryIncidentRepository } from './in-memory-incident.repository';
import { BedrockNarrationAdapter } from './narration/bedrock-narration.adapter';
import { ClaudeNarrationAdapter } from './narration/claude-narration.adapter';
import { InMemoryNarrativeRepository } from './narration/in-memory-narrative.repository';
import { MockNarrationAdapter } from './narration/mock-narration.adapter';
import { NARRATION_PORT } from './narration/narration.port';
import { NarrationService } from './narration/narration.service';
import { NARRATIVE_REPOSITORY } from './narration/narrative.repository';
import { PgNarrativeRepository } from './narration/pg-narrative.repository';
import { selectNarrator } from './narration/select-narrator';
import { CompositeNotificationAdapter } from './notifications/composite-notification.adapter';
import { FcmPushAdapter } from './notifications/fcm-push.adapter';
import { MockNotificationAdapter } from './notifications/mock-notification.adapter';
import { MockPushAdapter } from './notifications/mock-push.adapter';
import { NOTIFICATION_PORT } from './notifications/notification.port';
import { PUSH_PORT, type PushPort } from './notifications/push.port';
import { TwilioNotificationAdapter } from './notifications/twilio-notification.adapter';
import { InMemorySightingRepository } from './in-memory-sighting.repository';
import { PgContactRepository } from './pg-contact.repository';
import { PgIncidentRepository } from './pg-incident.repository';
import { PgSightingRepository } from './pg-sighting.repository';
import { SIGHTING_REPOSITORY } from './sighting.repository';
import { SightingsController } from './sightings.controller';
import { SightingsService } from './sightings.service';
import { StrangerEvaluatorService } from './stranger-evaluator.service';
import { InMemoryWanderWatchRepository } from './in-memory-wander-watch.repository';
import { PgWanderWatchRepository } from './pg-wander-watch.repository';
import { WANDER_WATCH_REPOSITORY } from './wander-watch.repository';
import { WanderWatchService } from './wander-watch.service';
import { ZoneAlertEvaluatorService } from './zone-alert-evaluator.service';
import { TEMPORAL_CLIENT } from './temporal/temporal.tokens';

/**
 * Escalation: the deterministic safety core. Temporal workflows run the ladder
 * (detection → voice check-in → family calls → emergency); everything is logged to
 * the append-only incident trail. Dormant until Temporal is configured.
 */
@Module({
  imports: [
    FamiliesModule,
    DevicesModule,
    PushTokensModule,
    VisitsModule,
    ZonesModule,
    EventsModule,
    AiModule,
  ],
  controllers: [
    EscalationController,
    ContactsController,
    IncidentsController,
    DailySummaryController,
    SightingsController,
    AlertsController,
  ],
  providers: [
    EscalationService,
    EscalationTriggerService,
    AlertsService,
    StrangerEvaluatorService,
    ZoneAlertEvaluatorService,
    WanderWatchService,
    SightingsService,
    ContactsService,
    IncidentsQueryService,
    DailySummaryService,
    EscalationWorkerService,
    NarrationService,
    MockNarrationAdapter,
    ClaudeNarrationAdapter,
    BedrockNarrationAdapter,
    MockNotificationAdapter,
    TwilioNotificationAdapter,
    MockPushAdapter,
    FcmPushAdapter,
    {
      // Real FCM critical alerts only when the full credential set is configured (and,
      // per rule #6, a recorded founder decision — docs/decisions/0004); otherwise the
      // mock notifies no device and the escalation ladder still runs.
      provide: PUSH_PORT,
      inject: [AppConfig, MockPushAdapter, FcmPushAdapter],
      useFactory: (config: AppConfig, mock: MockPushAdapter, fcm: FcmPushAdapter) =>
        config.hasPush ? fcm : mock,
    },
    {
      // The workflow sees one NotificationPort; the composite routes calls/SMS to
      // Twilio-or-mock (0003) and critical push to FCM-or-mock (0004), each enabled
      // independently by its own credentials. All-mock by default: the ladder runs
      // end-to-end while contacting no one for real.
      provide: NOTIFICATION_PORT,
      inject: [AppConfig, MockNotificationAdapter, TwilioNotificationAdapter, PUSH_PORT],
      useFactory: (
        config: AppConfig,
        mock: MockNotificationAdapter,
        twilio: TwilioNotificationAdapter,
        push: PushPort,
      ) => new CompositeNotificationAdapter(config.hasTwilio ? twilio : mock, push),
    },
    {
      // Follows config.aiProvider: Bedrock in an EU region (0013), the Claude API
      // (gated on 0002), or the deterministic local mock and nothing leaves the backend.
      provide: NARRATION_PORT,
      inject: [AppConfig, MockNarrationAdapter, ClaudeNarrationAdapter, BedrockNarrationAdapter],
      useFactory: (
        config: AppConfig,
        mock: MockNarrationAdapter,
        claude: ClaudeNarrationAdapter,
        bedrock: BedrockNarrationAdapter,
      ) => selectNarrator(config, { mock, claude, bedrock }),
    },
    {
      provide: NARRATIVE_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool
          ? new PgNarrativeRepository(pool)
          : new InMemoryNarrativeRepository(),
    },
    {
      provide: INCIDENT_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool
          ? new PgIncidentRepository(pool)
          : new InMemoryIncidentRepository(),
    },
    {
      provide: SIGHTING_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool
          ? new PgSightingRepository(pool)
          : new InMemorySightingRepository(),
    },
    {
      provide: ALERT_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool ? new PgAlertRepository(pool) : new InMemoryAlertRepository(),
    },
    {
      provide: WANDER_WATCH_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool
          ? new PgWanderWatchRepository(pool)
          : new InMemoryWanderWatchRepository(),
    },
    {
      provide: CONTACT_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool
          ? new PgContactRepository(pool)
          : new InMemoryContactRepository(),
    },
    {
      provide: TEMPORAL_CLIENT,
      inject: [AppConfig],
      useFactory: async (config: AppConfig): Promise<Client | null> => {
        if (!config.hasTemporal) return null;
        const connection = await Connection.connect({ address: config.temporalAddress });
        return new Client({ connection, namespace: config.temporalNamespace });
      },
    },
  ],
  exports: [
    EscalationService,
    NarrationService,
    IncidentsQueryService,
    ContactsService,
    AlertsService,
  ],
})
export class EscalationModule {}
