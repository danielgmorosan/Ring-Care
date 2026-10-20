import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import { StartRingLiveDto, UpdateRingCameraDto } from './dto/ring.dto';
import type { RingActivity, RingCameraView, RingStatus } from './ring.entity';
import { RingService } from './ring.service';

/** Clamp `?limit=` to 1..200, defaulting to 50. */
export function parseLimit(raw: string | undefined): number {
  const n = raw === undefined ? 50 : Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return 50;
  return Math.min(200, Math.max(1, n));
}

/**
 * Ring for the signed-in caregiver's family (decision 0011). Family scoped through the
 * JWT; families without the Ring link see an empty, unlinked Ring and 404 on changes.
 * POST/PATCH/DELETE are recorded by the global AuditInterceptor (rule #7), including
 * every live-view open and close.
 */
@Controller('me/ring')
export class RingController {
  constructor(private readonly ring: RingService) {}

  @Get('status')
  status(@CurrentUser() user: AuthUser): Promise<RingStatus> {
    return this.ring.status(user.familyId);
  }

  @Get('cameras')
  cameras(@CurrentUser() user: AuthUser): Promise<RingCameraView[]> {
    return this.ring.cameras(user.familyId);
  }

  @Post('cameras/sync')
  @HttpCode(200)
  sync(@CurrentUser() user: AuthUser): Promise<RingCameraView[]> {
    return this.ring.sync(user.familyId);
  }

  @Patch('cameras/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRingCameraDto,
  ): Promise<RingCameraView> {
    return this.ring.setPlacement(user.familyId, id, dto.placement);
  }

  @Post('cameras/:id/live')
  openLive(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: StartRingLiveDto,
  ): Promise<{ sessionId: string; sdpAnswer: string }> {
    return this.ring.openLive(user.familyId, user.id, id, dto.sdpOffer);
  }

  @Delete('cameras/:id/live/:sessionId')
  @HttpCode(204)
  async closeLive(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
  ): Promise<void> {
    await this.ring.closeLive(user.familyId, user.id, id, sessionId);
  }

  @Get('activity')
  activity(@CurrentUser() user: AuthUser, @Query('limit') limit?: string): Promise<RingActivity[]> {
    return this.ring.activity(user.familyId, parseLimit(limit));
  }
}
