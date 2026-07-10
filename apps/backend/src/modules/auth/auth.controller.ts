import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthResult, AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto, SignupDto } from './dto/auth.dto';
import { Public } from './public.decorator';
import type { AuthUser } from './user.repository';

/** Auth is unauthenticated and a brute-force target, so login/signup are throttled
 * harder than the global default: 10 attempts per minute per IP. */
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('signup')
  signup(@Body() dto: SignupDto): Promise<AuthResult> {
    return this.auth.signup(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<AuthResult> {
    return this.auth.login(dto);
  }

  /** The signed-in caregiver and their family. Guarded by the global JwtAuthGuard. */
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<Omit<AuthResult, 'token'>> {
    return this.auth.me(user);
  }
}
