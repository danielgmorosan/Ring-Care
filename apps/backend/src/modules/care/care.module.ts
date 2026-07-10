import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { AppConfig } from '../../config/env.validation';
import { PG_POOL } from '../../database/database.tokens';
import { DevicesModule } from '../devices/devices.module';
import { EscalationModule } from '../escalation/escalation.module';
import { FamiliesModule } from '../families/families.module';
import { APPOINTMENT_REPOSITORY } from './appointment.repository';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { CareController } from './care.controller';
import { CareService } from './care.service';
import { DOSE_CONFIRMATION_REPOSITORY } from './dose-confirmation.repository';
import { DoseService } from './dose.service';
import { DoseTelemetryController } from './dose-telemetry.controller';
import { InMemoryAppointmentRepository } from './in-memory-appointment.repository';
import { InMemoryDoseConfirmationRepository } from './in-memory-dose-confirmation.repository';
import { InMemoryMedicationRepository } from './in-memory-medication.repository';
import { MEDICATION_REPOSITORY } from './medication.repository';
import { MedicationsController } from './medications.controller';
import { MedicationsService } from './medications.service';
import { MissedDoseSweepService } from './missed-dose-sweep.service';
import { PgAppointmentRepository } from './pg-appointment.repository';
import { PgDoseConfirmationRepository } from './pg-dose-confirmation.repository';
import { PgMedicationRepository } from './pg-medication.repository';

/**
 * Care: the elder's day-to-day care schedule — medications, appointments, and the
 * combined "Today" view. Caregiver-managed configuration, family-scoped. No medical
 * advice, no automation — a schedule the family keeps and the app surfaces.
 */
@Module({
  imports: [FamiliesModule, DevicesModule, EscalationModule],
  controllers: [
    MedicationsController,
    AppointmentsController,
    CareController,
    DoseTelemetryController,
  ],
  providers: [
    MedicationsService,
    AppointmentsService,
    CareService,
    DoseService,
    MissedDoseSweepService,
    {
      provide: MEDICATION_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool
          ? new PgMedicationRepository(pool)
          : new InMemoryMedicationRepository(),
    },
    {
      provide: DOSE_CONFIRMATION_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool
          ? new PgDoseConfirmationRepository(pool)
          : new InMemoryDoseConfirmationRepository(),
    },
    {
      provide: APPOINTMENT_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool
          ? new PgAppointmentRepository(pool)
          : new InMemoryAppointmentRepository(),
    },
  ],
  exports: [MedicationsService, AppointmentsService],
})
export class CareModule {}
