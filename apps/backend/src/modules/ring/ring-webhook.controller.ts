import { Controller, Headers, HttpCode, Post, Req, type RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { RingWebhookService } from './ring-webhook.service';

/**
 * Ring's signed webhook (decision 0011). Public to the JWT guard; authenticated by the
 * HMAC over the raw body instead. Records first, answers 200 well inside Ring's 5 s
 * budget, then emits on the internal bus. Needs `rawBody: true` on the Nest app.
 */
@Controller('ring')
export class RingWebhookController {
  constructor(private readonly webhooks: RingWebhookService) {}

  @Public()
  @Post('webhook')
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-signature') signature?: string,
    @Headers('x-obrigada-simulator') simulator?: string,
  ): Promise<{ ok: true; duplicate: boolean }> {
    const result = await this.webhooks.ingest(req.rawBody, signature, simulator === '1');
    setImmediate(() => this.webhooks.dispatch(result));
    return { ok: true, duplicate: !result.recorded };
  }
}
