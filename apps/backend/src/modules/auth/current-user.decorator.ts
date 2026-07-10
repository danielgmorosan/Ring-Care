import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './user.repository';

/** The JwtAuthGuard attaches the authenticated user to the request under this key. */
export const REQUEST_USER_KEY = 'authUser';

/** Injects the authenticated {@link AuthUser} into a controller handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<Request & { [REQUEST_USER_KEY]?: AuthUser }>();
    const user = request[REQUEST_USER_KEY];
    if (!user) {
      // Should never happen: routes are guarded unless explicitly @Public.
      throw new Error('CurrentUser used on a route without the JwtAuthGuard');
    }
    return user;
  },
);
