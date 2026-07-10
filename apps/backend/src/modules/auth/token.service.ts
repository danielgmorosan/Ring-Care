import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthUser } from './user.repository';

/** JWT claims we sign. sub = user id, fam = the user's family id. */
export interface TokenClaims {
  sub: string;
  fam: string;
}

@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  sign(user: AuthUser): Promise<string> {
    const claims: TokenClaims = { sub: user.id, fam: user.familyId };
    return this.jwt.signAsync(claims);
  }

  /** Verifies signature + expiry and returns the claims. Throws if invalid. */
  verify(token: string): Promise<TokenClaims> {
    return this.jwt.verifyAsync<TokenClaims>(token);
  }
}
