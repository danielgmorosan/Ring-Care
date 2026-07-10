import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import { CreatePersonDto, UpdatePersonDto } from './dto/person.dto';
import { PeopleService } from './people.service';
import type { Person } from './person.entity';

/** The enrolled-people roster for the signed-in caregiver's family (F2.2). */
@Controller('me/people')
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Person[]> {
    return this.people.list(user.familyId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePersonDto): Promise<Person> {
    return this.people.create(user.familyId, dto);
  }

  @Patch(':personId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('personId') personId: string,
    @Body() dto: UpdatePersonDto,
  ): Promise<Person> {
    return this.people.update(user.familyId, personId, dto);
  }

  @Delete(':personId')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('personId') personId: string): Promise<void> {
    await this.people.remove(user.familyId, personId);
  }
}
