import { Injectable } from '@nestjs/common';

/**
 * Tracks whether the app is draining for shutdown. The bootstrap signal handler
 * flips this to draining on SIGTERM/SIGINT, keeps the HTTP server up for a grace
 * window (so a load balancer polling /health/ready sees 503 and stops routing new
 * traffic), then closes the app. That ordering — drain first, close second — is what
 * makes a rolling deploy zero-downtime.
 */
@Injectable()
export class ReadinessService {
  private draining = false;

  /** True until shutdown begins; gates the readiness probe. */
  isReady(): boolean {
    return !this.draining;
  }

  /** Marks the app as draining, so /health/ready starts reporting 503. */
  beginDraining(): void {
    this.draining = true;
  }
}
