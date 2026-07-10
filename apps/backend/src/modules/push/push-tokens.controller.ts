import { Body, Controller, Delete, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/user.repository';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import type { PushToken } from './push-token.entity';
import { PushTokensService } from './push-tokens.service';

/** Device push-token registration for the signed-in caregiver's family. */
@Controller('me/push-tokens')
export class PushTokensController {
  constructor(private readonly pushTokens: PushTokensService) {}

  @Post()
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterPushTokenDto): Promise<PushToken> {
    return this.pushTokens.register(user.id, user.familyId, dto);
  }

  @Delete(':token')
  @HttpCode(204)
  async unregister(@CurrentUser() user: AuthUser, @Param('token') token: string): Promise<void> {
    await this.pushTokens.unregister(user.familyId, token);
  }
}
