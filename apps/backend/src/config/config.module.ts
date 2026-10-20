import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { AppConfig, validateEnv } from './env.validation';

/**
 * Global config module. Loads and validates the environment once, then exposes
 * the typed {@link AppConfig} everywhere without re-importing.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Tests (Jest sets NODE_ENV=test) see only the environment they set themselves, never
      // a developer's apps/backend/.env: with the demo .env in place, e2e runs would write
      // into the demo database and collide with their own earlier sign-ups.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: validateEnv,
    }),
  ],
  providers: [AppConfig],
  exports: [AppConfig],
})
export class ConfigModule {}
