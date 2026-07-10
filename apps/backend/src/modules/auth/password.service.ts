import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

/** bcrypt password hashing. Cost 10 is a sensible default for interactive login. */
@Injectable()
export class PasswordService {
  private readonly cost = 10;

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.cost);
  }

  verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
