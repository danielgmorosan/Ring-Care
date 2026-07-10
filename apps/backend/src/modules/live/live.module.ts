import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { LiveController } from './live.controller';
import { LiveService } from './live.service';
import { LiveTelemetryController } from './live-telemetry.controller';

/**
 * Live view (F2.5): mints scoped, E2EE LiveKit tokens so a family member can watch a
 * guardian's camera on demand. Off unless LiveKit is configured (rule #6). No media passes
 * through the backend. Imports DevicesModule to check a guardian belongs to the caller's
 * family before issuing a token.
 */
@Module({
  imports: [DevicesModule],
  controllers: [LiveController, LiveTelemetryController],
  providers: [LiveService],
  exports: [LiveService],
})
export class LiveModule {}
