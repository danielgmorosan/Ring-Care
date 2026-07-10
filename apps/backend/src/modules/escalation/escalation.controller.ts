import { Body, Controller, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import { DevicesService } from '../devices/devices.service';
import { AcknowledgeDto, CheckinDto, StartEscalationDto } from './dto/escalation.dto';
import { EscalationService } from './escalation.service';

/**
 * Operational surface for the escalation engine. Starting an incident here stands
 * in for the F1.2 fall-detection trigger (and powers the synthetic canary, F1.6).
 * Every endpoint is scoped to the caller's family: the device must be theirs, and
 * check-in/ack may only touch their own incident — otherwise a caregiver could stand
 * down or acknowledge another family's fall.
 */
@Controller('incidents')
export class EscalationController {
  constructor(
    private readonly escalation: EscalationService,
    private readonly devices: DevicesService,
  ) {}

  @Post()
  async start(
    @CurrentUser() user: AuthUser,
    @Body() dto: StartEscalationDto,
  ): Promise<{ incidentId: string }> {
    // The device must belong to the caller's family (a 404 hides foreign devices).
    const device = await this.devices.findById(dto.deviceId);
    if (!device || device.familyId !== user.familyId) {
      throw new NotFoundException(`Device ${dto.deviceId} not found`);
    }
    return this.escalation.startEscalation({ ...dto, familyId: user.familyId });
  }

  @Post(':id/checkin')
  @HttpCode(202)
  async checkin(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CheckinDto,
  ): Promise<{ ok: true }> {
    await this.escalation.deliverCheckin(id, dto.result, user.familyId);
    return { ok: true };
  }

  @Post(':id/ack')
  @HttpCode(202)
  async ack(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AcknowledgeDto,
  ): Promise<{ ok: true }> {
    await this.escalation.acknowledge(id, dto.contactId, user.familyId);
    return { ok: true };
  }

  /**
   * A caregiver acknowledges from the app — "I'm handling this" (F1.4, decision 0008).
   * Provisional: it holds escalation for a bounded window, then resumes unless a following
   * "resolve" (all-clear) arrives — so a one-tap ack can only ever delay help, never suppress it.
   */
  @Post(':id/acknowledge')
  @HttpCode(202)
  async acknowledgeByCaregiver(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.escalation.caregiverAcknowledge(id, user.familyId, user.id);
    return { ok: true };
  }

  /** A caregiver's "All clear" that resolves an acknowledged incident (decision 0008). */
  @Post(':id/resolve')
  @HttpCode(202)
  async resolve(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    await this.escalation.resolve(id, user.familyId);
    return { ok: true };
  }
}
