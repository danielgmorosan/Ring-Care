import { Module } from '@nestjs/common';
import { CareModule } from '../care/care.module';
import { EscalationModule } from '../escalation/escalation.module';
import { FamiliesModule } from '../families/families.module';
import { FleetModule } from '../fleet/fleet.module';
import { QaController } from './qa.controller';
import { QaService } from './qa.service';

/**
 * Q&A (F3.3): the caregiver asks a question and gets an answer grounded only in the
 * family's structured record. Composes the read services from escalation, fleet, and
 * care; the AI-over-logs work lives in the narration port (mock by default).
 */
@Module({
  imports: [FamiliesModule, EscalationModule, FleetModule, CareModule],
  controllers: [QaController],
  providers: [QaService],
})
export class QaModule {}
