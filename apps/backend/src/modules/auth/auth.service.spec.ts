import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { FamiliesService } from '../families/families.service';
import { InMemoryFamilyRepository } from '../families/in-memory-family.repository';
import { AuthService } from './auth.service';
import { InMemoryUserRepository } from './in-memory-user.repository';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

describe('AuthService', () => {
  let auth: AuthService;
  let tokens: TokenService;

  beforeEach(() => {
    const families = new FamiliesService(new InMemoryFamilyRepository(), new EventEmitter2());
    tokens = new TokenService(
      new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '1h' } }),
    );
    auth = new AuthService(new InMemoryUserRepository(), new PasswordService(), tokens, families);
  });

  it('signs up: creates a family, returns a token whose claims point at the family', async () => {
    const res = await auth.signup({
      email: 'ana@example.com',
      password: 'password123',
      familyName: 'Silva family',
    });

    expect(res.user.email).toBe('ana@example.com');
    expect(res.family.name).toBe('Silva family');
    expect(res.token).toEqual(expect.any(String));

    const claims = await tokens.verify(res.token);
    expect(claims.fam).toBe(res.family.id);
  });

  it('rejects a duplicate email (case-insensitive)', async () => {
    await auth.signup({ email: 'ana@example.com', password: 'password123', familyName: 'Silva' });
    await expect(
      auth.signup({ email: 'ANA@example.com', password: 'password123', familyName: 'Other' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('logs in with the correct password', async () => {
    await auth.signup({ email: 'ana@example.com', password: 'password123', familyName: 'Silva' });
    const res = await auth.login({ email: 'ana@example.com', password: 'password123' });
    expect(res.user.email).toBe('ana@example.com');
    expect(res.token).toEqual(expect.any(String));
  });

  it('rejects a wrong password', async () => {
    await auth.signup({ email: 'ana@example.com', password: 'password123', familyName: 'Silva' });
    await expect(
      auth.login({ email: 'ana@example.com', password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unknown email with the same error (no account enumeration)', async () => {
    await expect(
      auth.login({ email: 'nobody@example.com', password: 'whatever' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
