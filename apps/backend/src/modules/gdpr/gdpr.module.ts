import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { BeeModule } from '../bee/bee.module';
import { CareModule } from '../care/care.module';
import { DevicesModule } from '../devices/devices.module';
import { EscalationModule } from '../escalation/escalation.module';
import { FamiliesModule } from '../families/families.module';
import { PushTokensModule } from '../push/push-tokens.module';
import { RingModule } from '../ring/ring.module';
import { VisitsModule } from '../visits/visits.module';
import { ErasureService } from './erasure.service';
import { ExportService } from './export.service';
import { GdprController } from './gdpr.controller';

/**
 * GDPR data rights (Art. 15/17/20). Composes the family-scoped reads owned by other
 * modules into a full data export; erasure follows (docs/decisions/0005). No data of
 * its own — a coordination layer, like the Q&A module.
 */
@Module({
  imports: [
    FamiliesModule,
    DevicesModule,
    CareModule,
    EscalationModule,
    PushTokensModule,
    AuditModule,
    AuthModule,
    BeeModule,
    VisitsModule,
    RingModule,
  ],
  controllers: [GdprController],
  providers: [ExportService, ErasureService],
})
export class GdprModule {}
