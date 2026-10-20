import {
  Controller,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { AppConfig } from '../../config/env.validation';
import { Public } from '../auth/public.decorator';
import { BeeIngestService, type WebhookAck } from './bee-ingest.service';

/** Constant-time string comparison that does not leak length. */
export function secretsMatch(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = createHash('sha256').update(provided, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

function bearer(header: string | undefined): string | undefined {
  const m = /^Bearer\s+(.+)$/i.exec(header?.trim() ?? '');
  return m ? m[1]!.trim() : undefined;
}

/**
 * Receives events from `bee stream --webhook-endpoint` running for the caregiver's Bee
 * account (decision 0012; setup in docs/hackathon/bee.md). Authenticated by the shared
 * BEE_WEBHOOK_SECRET, as a bearer token or a `secret` query parameter. Acknowledges with
 * 202 at once; fetching and extraction happen after the response.
 */
@Controller('bee')
export class BeeWebhookController {
  constructor(
    private readonly config: AppConfig,
    private readonly ingest: BeeIngestService,
  ) {}

  @Public()
  @Post('webhook')
  @HttpCode(202)
  webhook(
    @Req() req: Request,
    @Headers('authorization') authorization?: string,
    @Query('secret') querySecret?: string,
  ): WebhookAck {
    const expected = this.config.beeWebhookSecret;
    if (!this.config.hasBee || !expected) {
      throw new ServiceUnavailableException('Bee is not configured');
    }
    const provided =
      bearer(authorization) ?? (typeof querySecret === 'string' ? querySecret : undefined);
    if (!secretsMatch(provided, expected)) throw new UnauthorizedException();
    // A Buffer when the raw webhook reader ran (any content type, see main.ts); otherwise
    // the parsed JSON or the text from rawTextBody. The parser takes strings and objects.
    const body: unknown = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
    return this.ingest.accept(body);
  }
}
