import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import { ContactsService } from './contacts.service';
import { CreateContactDto, UpdateContactDto } from './dto/contact.dto';
import type { EscalationContact } from './temporal/types';

/** The escalation contact chain for the signed-in caregiver's family. */
@Controller('me/contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<EscalationContact[]> {
    return this.contacts.list(user.familyId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateContactDto): Promise<EscalationContact> {
    return this.contacts.create(user.familyId, dto);
  }

  @Patch(':contactId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('contactId') contactId: string,
    @Body() dto: UpdateContactDto,
  ): Promise<EscalationContact> {
    return this.contacts.update(user.familyId, contactId, dto);
  }

  @Delete(':contactId')
  @HttpCode(204)
  async delete(
    @CurrentUser() user: AuthUser,
    @Param('contactId') contactId: string,
  ): Promise<void> {
    await this.contacts.delete(user.familyId, contactId);
  }
}
