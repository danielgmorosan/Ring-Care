import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import type { CareProposal } from './care-proposal.entity';
import { CareProposalsService, type ApproveResult } from './care-proposals.service';
import { ApproveCareProposalDto, ListCareProposalsQueryDto } from './dto/care-proposal.dto';

/**
 * The caregiver's review queue for care changes proposed from her Bee voice notes.
 * Decisions are audit-logged by the global AuditInterceptor (rule #7) and recorded in
 * the append-only care_proposal_decisions trail.
 */
@Controller('me/care/proposals')
export class CareProposalsController {
  constructor(private readonly proposals: CareProposalsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListCareProposalsQueryDto,
  ): Promise<CareProposal[]> {
    return this.proposals.list(user.familyId, query.status);
  }

  @Post(':proposalId/approve')
  @HttpCode(200)
  approve(
    @CurrentUser() user: AuthUser,
    @Param('proposalId', new ParseUUIDPipe()) proposalId: string,
    @Body() dto: ApproveCareProposalDto,
  ): Promise<ApproveResult> {
    return this.proposals.approve(user.familyId, user.id, proposalId, dto.itemIds);
  }

  @Post(':proposalId/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('proposalId', new ParseUUIDPipe()) proposalId: string,
  ): Promise<CareProposal> {
    return this.proposals.reject(user.familyId, user.id, proposalId);
  }
}
