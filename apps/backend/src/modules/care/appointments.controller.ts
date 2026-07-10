import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import type { Appointment } from './appointment.entity';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto, UpdateAppointmentDto } from './dto/appointment.dto';

/** The elder's appointment calendar for the signed-in caregiver's family. */
@Controller('me/appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Appointment[]> {
    return this.appointments.list(user.familyId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAppointmentDto): Promise<Appointment> {
    return this.appointments.create(user.familyId, dto);
  }

  @Patch(':appointmentId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('appointmentId') appointmentId: string,
    @Body() dto: UpdateAppointmentDto,
  ): Promise<Appointment> {
    return this.appointments.update(user.familyId, appointmentId, dto);
  }

  @Delete(':appointmentId')
  @HttpCode(204)
  async delete(
    @CurrentUser() user: AuthUser,
    @Param('appointmentId') appointmentId: string,
  ): Promise<void> {
    await this.appointments.delete(user.familyId, appointmentId);
  }
}
