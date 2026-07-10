import { IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateVisitDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  visitorLabel!: string;

  /** ISO 8601 datetime the visit window opens. */
  @IsISO8601()
  startsAt!: string;

  /** ISO 8601 datetime the visit window closes; must be after startsAt. */
  @IsISO8601()
  endsAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/** All fields optional; only those present are changed. */
export class UpdateVisitDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  visitorLabel?: string;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
