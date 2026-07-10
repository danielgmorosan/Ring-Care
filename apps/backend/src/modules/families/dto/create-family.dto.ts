import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CHECKIN_LANGUAGES, type CheckinLanguage } from '../checkin-language';

export class CreateFamilyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  /** IANA timezone; validated and defaulted to UTC by the service. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  /** Elder-facing voice check-in language; defaults to English when omitted. */
  @IsOptional()
  @IsIn(CHECKIN_LANGUAGES)
  checkinLanguage?: CheckinLanguage;
}
