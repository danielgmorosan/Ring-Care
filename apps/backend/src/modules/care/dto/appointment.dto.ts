import { IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAppointmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  /** ISO 8601 datetime, e.g. 2026-07-09T10:00:00.000Z. */
  @IsISO8601()
  at!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/** All fields optional; only those present are changed. */
export class UpdateAppointmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsISO8601()
  at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
