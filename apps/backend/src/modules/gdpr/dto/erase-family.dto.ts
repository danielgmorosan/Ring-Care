import { IsString, MinLength } from 'class-validator';

/** Erasure is irreversible, so the caregiver must type their exact family name back. */
export class EraseFamilyDto {
  @IsString()
  @MinLength(1)
  confirmName!: string;
}
