import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import type { VoiceCheckinResult } from '../temporal/types';

const CHECKIN_VALUES: VoiceCheckinResult[] = ['i_am_fine', 'distress', 'silence', 'pending'];

export class StartEscalationDto {
  // familyId comes from the authenticated user, not the body.
  @IsUUID()
  deviceId!: string;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsUUID()
  triggeringEventId?: string;

  @IsOptional()
  @IsBoolean()
  confirmedFall?: boolean;

  @IsOptional()
  @IsIn(CHECKIN_VALUES)
  initialCheckin?: VoiceCheckinResult;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(300)
  ackWindowSeconds?: number;
}

export class CheckinDto {
  @IsIn(CHECKIN_VALUES)
  result!: VoiceCheckinResult;
}

export class AcknowledgeDto {
  @IsUUID()
  contactId!: string;
}
