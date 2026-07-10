import { IsString, MaxLength, MinLength } from 'class-validator';

/** The family the device belongs to comes from the authenticated user, not the body. */
export class RegisterDeviceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}
