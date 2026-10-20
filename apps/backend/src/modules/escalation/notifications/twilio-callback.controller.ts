import { Body, Controller, Header, Headers, HttpCode, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AppConfig } from '../../../config/env.validation';
import { Public } from '../../auth/public.decorator';
import { CallConfirmationService } from './call-confirmation.service';

/**
 * Twilio's press-1 callback for family calls (decision 0003, follow-up). Public to the
 * JWT guard: authenticated by the HMAC-signed link and by Twilio's X-Twilio-Signature
 * instead (see CallConfirmationService). Replies with TwiML for Twilio to read aloud.
 */
@Controller('twilio/calls')
export class TwilioCallbackController {
  constructor(
    private readonly config: AppConfig,
    private readonly confirmations: CallConfirmationService,
  ) {}

  @Public()
  @Post('confirm')
  @HttpCode(200)
  @Header('Content-Type', 'text/xml')
  confirm(
    @Req() req: Request,
    @Query() query: Record<string, unknown>,
    @Body() body: Record<string, unknown>,
    @Headers('x-twilio-signature') signature?: string,
  ): Promise<string> {
    // Twilio signs the exact URL it requested: our public origin plus the path and query.
    const origin = this.config.publicBaseUrl ?? `${req.protocol}://${req.get('host') ?? ''}`;
    return this.confirmations.handle({
      url: `${origin}${req.originalUrl}`,
      query,
      body,
      twilioSignature: signature,
    });
  }
}
