import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import type { DoseConfirmation } from './dose-confirmation.entity';
import { DoseService } from './dose.service';
import { CreateMedicationDto, UpdateMedicationDto } from './dto/medication.dto';
import type { Medication } from './medication.entity';
import { MedicationsService } from './medications.service';

/** The elder's medication schedule for the signed-in caregiver's family. */
@Controller('me/medications')
export class MedicationsController {
  constructor(
    private readonly medications: MedicationsService,
    private readonly doses: DoseService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Medication[]> {
    return this.medications.list(user.familyId);
  }

  /** The dose-confirmation (adherence) history for one medication (F3.4). */
  @Get(':medicationId/doses')
  doseHistory(
    @CurrentUser() user: AuthUser,
    @Param('medicationId') medicationId: string,
  ): Promise<DoseConfirmation[]> {
    return this.doses.listForMedication(user.familyId, medicationId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMedicationDto): Promise<Medication> {
    return this.medications.create(user.familyId, dto);
  }

  @Patch(':medicationId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('medicationId') medicationId: string,
    @Body() dto: UpdateMedicationDto,
  ): Promise<Medication> {
    return this.medications.update(user.familyId, medicationId, dto);
  }

  @Delete(':medicationId')
  @HttpCode(204)
  async delete(
    @CurrentUser() user: AuthUser,
    @Param('medicationId') medicationId: string,
  ): Promise<void> {
    await this.medications.delete(user.familyId, medicationId);
  }
}
