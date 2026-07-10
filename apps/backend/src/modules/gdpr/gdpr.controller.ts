import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import { EraseFamilyDto } from './dto/erase-family.dto';
import { ErasureService } from './erasure.service';
import { ExportService, type FamilyDataExport } from './export.service';

/**
 * GDPR data rights for the signed-in caregiver's family. Both are POSTs so the
 * data-access and erasure requests are recorded on the append-only activity trail
 * (rule #7). See docs/decisions/0005.
 */
@Controller('me')
export class GdprController {
  constructor(
    private readonly exports: ExportService,
    private readonly erasure: ErasureService,
  ) {}

  @Post('export')
  export(@CurrentUser() user: AuthUser): Promise<FamilyDataExport> {
    return this.exports.exportFamily(user);
  }

  @Post('erase')
  erase(@CurrentUser() user: AuthUser, @Body() dto: EraseFamilyDto): Promise<{ erased: true }> {
    return this.erasure.erase(user, dto.confirmName);
  }
}
