import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

/** The device push token the app obtained after the caregiver granted permission. */
export class RegisterPushTokenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  token!: string;

  @IsIn(['ios', 'android', 'web'])
  platform!: 'ios' | 'android' | 'web';
}
