import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { AppConfig } from '../../config/env.validation';
import { PG_POOL } from '../../database/database.tokens';
import { FamiliesModule } from '../families/families.module';
import { CertificateAuthorityService } from './certificate-authority.service';
import { CLAIM_CODE_REPOSITORY } from './claim-code.repository';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { DEVICE_REPOSITORY } from './device.repository';
import { InMemoryClaimCodeRepository } from './in-memory-claim-code.repository';
import { InMemoryDeviceRepository } from './in-memory-device.repository';
import { PgClaimCodeRepository } from './pg-claim-code.repository';
import { PgDeviceRepository } from './pg-device.repository';
import { ProvisioningController } from './provisioning.controller';
import { ProvisioningService } from './provisioning.service';

@Module({
  imports: [FamiliesModule],
  controllers: [DevicesController, ProvisioningController],
  providers: [
    DevicesService,
    ProvisioningService,
    CertificateAuthorityService,
    {
      provide: DEVICE_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool ? new PgDeviceRepository(pool) : new InMemoryDeviceRepository(),
    },
    {
      provide: CLAIM_CODE_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool
          ? new PgClaimCodeRepository(pool)
          : new InMemoryClaimCodeRepository(),
    },
  ],
  exports: [DevicesService, CertificateAuthorityService],
})
export class DevicesModule {}
