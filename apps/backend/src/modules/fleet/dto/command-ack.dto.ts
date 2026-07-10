import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { DeviceCommandAckStatus } from '../device-command-ack.entity';

/** A guardian's acknowledgement that it carried out a command (F2.6). */
export class CommandAckDto {
  @IsUUID()
  deviceId!: string;

  @IsUUID()
  commandId!: string;

  @IsIn(['executed', 'failed'])
  status!: DeviceCommandAckStatus;

  /** A short, non-identifying note (e.g. an error reason). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  detail?: string;
}
