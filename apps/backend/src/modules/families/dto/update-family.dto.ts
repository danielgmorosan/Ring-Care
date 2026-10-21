import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CHECKIN_LANGUAGES, type CheckinLanguage } from '../checkin-language';
import type { ElderRelation } from '../elder';
import { ElderNameField, ElderRelationField } from './elder-fields';

/** Editable household settings. All fields optional; only what changed is sent. */
export class UpdateFamilyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  /** IANA timezone; validated and normalized by the service. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  /** Elder-facing voice check-in language (a safety setting; must match the elder). */
  @IsOptional()
  @IsIn(CHECKIN_LANGUAGES)
  checkinLanguage?: CheckinLanguage;

  /** The protected person's display name, e.g. "Maria". Null or blank clears it. */
  @ElderNameField()
  elderName?: string | null;

  /** The caregiver's relationship word for them, e.g. "mother". Null clears it. */
  @ElderRelationField()
  elderRelation?: ElderRelation | null;
}
