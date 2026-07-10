import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { Pool } from 'pg';
import { AppConfig } from '../../config/env.validation';
import { PG_POOL } from '../../database/database.tokens';
import { FamiliesModule } from '../families/families.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { InMemoryUserRepository } from './in-memory-user.repository';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordService } from './password.service';
import { PgUserRepository } from './pg-user.repository';
import { TokenService } from './token.service';
import { USER_REPOSITORY } from './user.repository';

/**
 * Authentication and the global auth guard. Every route is guarded unless marked
 * @Public. Users derive their family from the token, so a caregiver can only ever
 * reach their own family's data.
 */
@Module({
  imports: [
    FamiliesModule,
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.jwtSecret,
        // jwtTtl is a validated non-empty string (e.g. "7d"); the exact format is
        // an operator responsibility. @nestjs/jwt types expiresIn as ms StringValue.
        signOptions: { expiresIn: config.jwtTtl } as unknown as JwtSignOptions,
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    {
      provide: USER_REPOSITORY,
      inject: [AppConfig, PG_POOL],
      useFactory: (config: AppConfig, pool: Pool | null) =>
        config.hasDatabase && pool ? new PgUserRepository(pool) : new InMemoryUserRepository(),
    },
    // Global guard — protects every route not marked @Public.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [TokenService, USER_REPOSITORY],
})
export class AuthModule {}
