import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class QuietHoursDto {
  @Matches(HH_MM, { message: 'start must be HH:MM' })
  start!: string;

  @Matches(HH_MM, { message: 'end must be HH:MM' })
  end!: string;

  @IsBoolean()
  wakeForConfirmedFallOnly!: boolean;
}

export class CreateContactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  role!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phone must be E.164, e.g. +351912345678' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  pushToken?: string;

  @IsInt()
  @Min(0)
  priority!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => QuietHoursDto)
  quietHours?: QuietHoursDto;
}

export class UpdateContactDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  role?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phone must be E.164, e.g. +351912345678' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  pushToken?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => QuietHoursDto)
  quietHours?: QuietHoursDto | null;
}
