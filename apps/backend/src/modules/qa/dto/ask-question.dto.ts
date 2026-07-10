import { IsString, MaxLength, MinLength } from 'class-validator';

export class AskQuestionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  question!: string;
}
