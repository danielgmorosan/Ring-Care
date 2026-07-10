import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateMedicationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  dosage?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @Matches(HH_MM, { each: true, message: 'times must be HH:MM' })
  times?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/** All fields optional; only those present are changed. */
export class UpdateMedicationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  dosage?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @Matches(HH_MM, { each: true, message: 'times must be HH:MM' })
  times?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
