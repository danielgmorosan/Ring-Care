import { IsString, MaxLength, MinLength } from 'class-validator';

/** A phone redeems a claim code to bind to a family. No auth token — the code is it. */
export class ProvisionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code!: string;
}
