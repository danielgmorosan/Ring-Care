import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { HOUSEHOLD_ROLES, type HouseholdRole } from '../person.entity';

export class CreatePersonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsIn(HOUSEHOLD_ROLES)
  role!: HouseholdRole;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/** All fields optional; only those present are changed. */
export class UpdatePersonDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsIn(HOUSEHOLD_ROLES)
  role?: HouseholdRole;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
