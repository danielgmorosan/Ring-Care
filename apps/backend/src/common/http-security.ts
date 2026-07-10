import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';

/**
 * Applies standard HTTP security to the app: security headers via helmet (HSTS,
 * X-Content-Type-Options nosniff, frame-deny, …) and a CORS policy. `corsOrigins`
 * locks CORS to an allowlist of browser origins; `undefined` reflects any origin,
 * which is fine in dev but should be set in production. Native apps ignore CORS and
 * every route stays JWT-guarded — this only limits which sites may attempt a request.
 */
export function applyHttpSecurity(app: INestApplication, corsOrigins: string[] | undefined): void {
  app.use(helmet());
  app.enableCors({ origin: corsOrigins ?? true, credentials: true });
}
