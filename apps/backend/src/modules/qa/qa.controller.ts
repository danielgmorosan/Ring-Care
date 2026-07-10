import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import { AskQuestionDto } from './dto/ask-question.dto';
import { QaService, type AskResult } from './qa.service';

/** Ask Obrigada a question about the signed-in caregiver's family. Read-only (Tier 1). */
@Controller('me/ask')
export class QaController {
  constructor(private readonly qa: QaService) {}

  @Post()
  ask(@CurrentUser() user: AuthUser, @Body() dto: AskQuestionDto): Promise<AskResult> {
    return this.qa.ask(user.familyId, dto.question);
  }
}
