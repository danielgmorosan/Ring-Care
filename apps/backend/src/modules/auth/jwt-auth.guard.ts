import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { REQUEST_USER_KEY } from './current-user.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { TokenService } from './token.service';
import { USER_REPOSITORY, type AuthUser, type UserRepository } from './user.repository';

/**
 * Global guard: every route requires a valid Bearer token unless marked @Public.
 * Verifies the JWT, loads the user, and attaches it to the request so handlers
 * derive the family from the token — never from client-supplied ids.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { [REQUEST_USER_KEY]?: AuthUser }>();
    const token = this.extractBearer(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let claims;
    try {
      claims = await this.tokens.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.users.findById(claims.sub);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    request[REQUEST_USER_KEY] = user;
    return true;
  }

  private extractBearer(header: string | undefined): string | null {
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme === 'Bearer' && value ? value : null;
  }
}
