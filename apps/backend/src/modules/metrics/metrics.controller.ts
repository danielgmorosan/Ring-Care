import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { MetricsService } from './metrics.service';

/**
 * The Prometheus scrape target. Public (no token) so Prometheus can scrape it; in
 * production it is reachable only on the internal network, never the public internet.
 * Exposes no personal data — process health and label/count metrics only.
 */
@Public()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  scrape(): Promise<string> {
    return this.metrics.metrics();
  }
}
