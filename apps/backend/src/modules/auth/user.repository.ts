/** The authenticated caregiver, as seen by the rest of the app. Never carries the password hash. */
export interface AuthUser {
  id: string;
  email: string;
  familyId: string;
  createdAt: string;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  familyId: string;
}

export interface UserWithHash {
  user: AuthUser;
  passwordHash: string;
}

/** Thrown when signing up with an email that already exists. */
export class EmailTakenError extends Error {
  constructor() {
    super('email already registered');
    this.name = 'EmailTakenError';
  }
}

/**
 * User accounts. The family is created first (by AuthService via FamiliesService)
 * and its id passed here. findByEmailWithHash is the only path that exposes the
 * password hash, and only for the login check.
 */
export interface UserRepository {
  create(input: CreateUserInput): Promise<AuthUser>;
  findByEmailWithHash(email: string): Promise<UserWithHash | null>;
  findById(id: string): Promise<AuthUser | null>;
  /**
   * Irreversibly erase the caregiver accounts of a family (GDPR Art. 17): the email
   * becomes an unrecoverable tombstone and the password hash is disabled, so the
   * account can never be logged into or linked back to a person. See decisions/0005.
   */
  redactByFamily(familyId: string): Promise<void>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
