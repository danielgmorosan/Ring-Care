import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { ProvisionDto } from './dto/provision.dto';
import { ProvisioningService, type ProvisionResult } from './provisioning.service';

/**
 * Device-facing provisioning. Public because a guardian phone has no user token — the
 * claim code is the credential. The code is single-use, short-lived, and high-entropy.
 * Throttled hard (10/min per IP) so the claim-code space cannot be brute-forced.
 */
@Controller('provision')
export class ProvisioningController {
  constructor(private readonly provisioning: ProvisioningService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  provision(@Body() dto: ProvisionDto): Promise<ProvisionResult> {
    return this.provisioning.provision(dto.code);
  }
}
