import { Logger, Module } from '@nestjs/common';
import { EscalationModule } from '../escalation/escalation.module';
import { Pool } from 'pg';
import { AppConfig } from '../../config/env.validation';
import { PG_POOL } from '../../database/database.tokens';
import { HttpRingClient } from './client/http-ring.client';
import { MockRingClient } from './client/mock-ring.client';
import { RING_CLIENT, type RingClient } from './client/ring-client.port';
import { OAuthRingTokenProvider, StaticRingTokenProvider } from './client/ring-token.provider';
import { InMemoryRingRepository } from './in-memory-ring.repository';
import { PgRingRepository } from './pg-ring.repository';
import { RingController } from './ring.controller';
import { RING_REPOSITORY } from './ring.repository';
import { RingService } from './ring.service';
import { RingCareCatchUpService } from './ring-care-catch-up.service';
import { RingWebhookController } from './ring-webhook.controller';
import { RingWebhookService } from './ring-webhook.service';

export function createRingClient(config: AppConfig): RingClient {
  switch (config.ringAuthMode) {
    case 'oauth':
      return new HttpRingClient(config.ringApiBaseUrl, new OAuthRingTokenProvider(config));
    case 'playground':
      Logger.warn(
        'Ring is using a Playground access token; it is short lived and cannot refresh',
        'RingModule',
      );
      return new HttpRingClient(
        config.ringApiBaseUrl,
        new StaticRingTokenProvider(config.ringAccessToken ?? ''),
      );
    default:
      return new MockRingClient();
  }
}

/**
 * Ring integration (decision 0011): Ring Partner API client, signed webhook intake,
 * linked cameras, live-view signalling proxy. Ring video never reaches this backend;
 * only event labels and ids are recorded (rule #1). Off unless configured: without
 * Ring credentials nothing is called, and without RING_HMAC_SECRET + RING_FAMILY_ID
 * the webhook answers 503.
 *
 * Emits InternalEvent.RingMotionDetected / RingButtonPressed (RingActivityPayload)
 * after an event is durably recorded; the care logic listens. RingCareCatchUpService
 * re-judges recorded events that a crash left without a decision.
 */
@Module({
  // EscalationModule exports RingCareService, which interprets events for the activity feed.
  imports: [EscalationModule],
  controllers: [RingController, RingWebhookController],
  providers: [
    RingService,
    RingWebhookService,
    RingCareCatchUpService,
    {
      provide: RING_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool ? new PgRingRepository(pool) : new InMemoryRingRepository(),
    },
    { provide: RING_CLIENT, inject: [AppConfig], useFactory: createRingClient },
  ],
  exports: [RingService, RING_REPOSITORY],
})
export class RingModule {}
