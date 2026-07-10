import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ZONE_KINDS, type ZoneKind } from '../zone.entity';

/** One polygon vertex, normalized to [0,1] in the device frame. */
export class ZonePointDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  x!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  y!: number;
}

export class CreateZoneDto {
  @IsUUID()
  deviceId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsIn(ZONE_KINDS)
  kind!: ZoneKind;

  // A polygon needs at least three points; cap the vertex count to keep it sane.
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => ZonePointDto)
  points!: ZonePointDto[];
}

/** All fields optional; only those present are changed. deviceId is fixed at creation. */
export class UpdateZoneDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsIn(ZONE_KINDS)
  kind?: ZoneKind;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => ZonePointDto)
  points?: ZonePointDto[];
}
