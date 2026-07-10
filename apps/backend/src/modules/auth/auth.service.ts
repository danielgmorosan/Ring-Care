import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { FamiliesService } from '../families/families.service';
import { LoginDto, SignupDto } from './dto/auth.dto';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { EmailTakenError, USER_REPOSITORY, type UserRepository } from './user.repository';

export interface AuthResult {
  token: string;
  user: { id: string; email: string };
  family: { id: string; name: string };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly families: FamiliesService,
  ) {}

  async signup(dto: SignupDto): Promise<AuthResult> {
    // Fail fast on a taken email before creating a family (the DB unique
    // constraint is the backstop against the rare race).
    if (await this.users.findByEmailWithHash(dto.email)) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await this.passwords.hash(dto.password);
    const family = await this.families.create({
      name: dto.familyName.trim(),
      timezone: dto.timezone,
    });
    try {
      const user = await this.users.create({ email: dto.email, passwordHash, familyId: family.id });
      // Audit (rule #7): account creation is an attributable event.
      this.logger.log(`Signup: user ${user.id} created family ${user.familyId}`);
      return this.result(user.id, user.email, user.familyId);
    } catch (error) {
      if (error instanceof EmailTakenError) {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const found = await this.users.findByEmailWithHash(dto.email);
    // Same message whether the email is unknown or the password is wrong — no
    // account enumeration.
    const invalid = new UnauthorizedException('Invalid email or password');
    if (!found) {
      // Spend comparable bcrypt time so a missing account is not detectable by
      // response timing (mitigates account enumeration).
      await this.passwords.hash(dto.password);
      throw invalid;
    }
    const ok = await this.passwords.verify(dto.password, found.passwordHash);
    if (!ok) throw invalid;

    this.logger.log(`Login: user ${found.user.id}`);
    return this.result(found.user.id, found.user.email, found.user.familyId);
  }

  /** The signed-in context (used by GET /auth/me). */
  async me(user: {
    id: string;
    email: string;
    familyId: string;
  }): Promise<Omit<AuthResult, 'token'>> {
    const family = await this.families.findByIdOrFail(user.familyId);
    return {
      user: { id: user.id, email: user.email },
      family: { id: family.id, name: family.name },
    };
  }

  private async result(userId: string, email: string, familyId: string): Promise<AuthResult> {
    const family = await this.families.findByIdOrFail(familyId);
    const token = await this.tokens.sign({ id: userId, email, familyId, createdAt: '' });
    return { token, user: { id: userId, email }, family: { id: family.id, name: family.name } };
  }
}
