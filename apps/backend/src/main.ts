import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { applyHttpSecurity } from './common/http-security';
import { JsonLogger } from './common/json-logger';
import { requestIdMiddleware } from './common/request-id.middleware';
import { installRawWebhookBodies } from './common/webhook-raw-body';
import { AppConfig } from './config/env.validation';
import { ReadinessService } from './health/readiness.service';
import type { INestApplication } from '@nestjs/common';

/**
 * Zero-downtime drain: on SIGTERM/SIGINT, report readiness 503 but keep serving for
 * a grace window so a load balancer stops routing new traffic and in-flight requests
 * finish — then close the app (DB pool, MQTT, Temporal worker). Done here, not via
 * enableShutdownHooks, because Nest closes the HTTP server before its hooks run,
 * which would make the drain window unreachable.
 */
function installGracefulShutdown(app: INestApplication, config: AppConfig): void {
  const readiness = app.get(ReadinessService);
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    Logger.log(`${signal} received; draining (readiness now 503)`, 'Bootstrap');
    readiness.beginDraining();
    const graceMs = config.shutdownGraceSeconds * 1000;
    if (graceMs > 0) await new Promise((resolve) => setTimeout(resolve, graceMs));
    await app.close();
    Logger.log('Shutdown complete', 'Bootstrap');
    process.exit(0);
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

async function bootstrap(): Promise<void> {
  // Read the log format from the env directly (before AppConfig exists) so even
  // bootstrap logs are structured. Buffer early logs so they flush through it.
  const useJsonLogs = process.env.LOG_FORMAT === 'json';
  // rawBody keeps the exact request bytes beside the parsed JSON, so signed webhooks
  // (Ring: HMAC over the raw body) can be verified. Parsing is otherwise unchanged.
  const app = await NestFactory.create(AppModule, { bufferLogs: useJsonLogs, rawBody: true });
  if (useJsonLogs) app.useLogger(new JsonLogger());

  // Give every request a correlation id (echoed in an X-Request-Id header and
  // held in async-local storage) so the rest of the pipeline can reference it.
  app.use(requestIdMiddleware);

  // Signed webhooks (/ring/webhook, /bee/webhook) keep their exact bytes for any content
  // type (Ring may send application/vnd.api+json, Bee text/plain). Mounted before Nest's
  // JSON parser, which registers at init; every other route parses as before.
  installRawWebhookBodies(app);

  // Every error returns one consistent envelope carrying that correlation id.
  app.useGlobalFilters(new AllExceptionsFilter());

  // Never trust device or app input: strip unknown fields, reject unexpected ones,
  // and transform payloads into their typed DTOs on every endpoint.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  const config = app.get(AppConfig);

  // Security headers (helmet) + a CORS policy locked to the configured allowlist in
  // production (reflects any origin when CORS_ORIGINS is unset, for dev).
  applyHttpSecurity(app, config.corsOrigins);

  // Behind Caddy in production: trust the first proxy hop so req.ip reflects the
  // real client (from X-Forwarded-For), which per-IP rate limiting depends on.
  if (config.behindProxy) {
    const express = app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void };
    express.set('trust proxy', 1);
  }

  // Refuse to boot production with the insecure default JWT secret.
  if (config.isProduction && config.isJwtSecretInsecureDefault) {
    throw new Error('JWT_SECRET must be set to a real secret in production');
  }

  // Drain-then-close on SIGTERM/SIGINT (also runs onModuleDestroy via app.close).
  installGracefulShutdown(app, config);

  await app.listen(config.port, config.host);

  Logger.log(`Obrigada backend listening on http://${config.host}:${config.port}`, 'Bootstrap');
}

void bootstrap();
