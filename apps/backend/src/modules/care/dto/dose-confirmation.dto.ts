import { IsISO8601, IsOptional, IsUUID, Matches } from 'class-validator';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A guardian's report that the elder confirmed a medication dose (F3.4). */
export class DoseConfirmationDto {
  @IsUUID()
  deviceId!: string;

  /** Client-generated id so a replayed confirmation records once. */
  @IsUUID()
  doseId!: string;

  @IsUUID()
  medicationId!: string;

  /** Which scheduled dose, an "HH:MM" slot from the medication's times. Optional. */
  @IsOptional()
  @Matches(HH_MM, { message: 'slot must be HH:MM' })
  slot?: string;

  /** When the elder confirmed (device time). Defaults to the server receive time. */
  @IsOptional()
  @IsISO8601()
  confirmedAt?: string;
}
