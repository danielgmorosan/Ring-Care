import { Inject, Injectable, Logger } from '@nestjs/common';
import { PushTokensService } from '../push/push-tokens.service';
import type { Alert } from './alert.entity';
import { ALERT_REPOSITORY, type AlertRepository, type NewAlert } from './alert.repository';
import { PUSH_PORT, type PushPort } from './notifications/push.port';

/**
 * The one path every family-facing alert goes through (F2). raise() records the alert
 * to the append-only trail and delivers it to the family's devices, so the stranger,
 * red-zone, and wander evaluators all report through a single, consistent seam instead
 * of each repeating a push loop.
 *
 * Delivery is per-token best-effort: one device failing never stops the others, and a
 * delivery failure never loses the record. The push channel is incident-agnostic
 * (pushToDevice uses only token + message), so the alert's ref rides as the opaque
 * correlation id; no incident is invented.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @Inject(ALERT_REPOSITORY) private readonly alerts: AlertRepository,
    private readonly pushTokens: PushTokensService,
    @Inject(PUSH_PORT) private readonly push: PushPort,
  ) {}

  async raise(alert: NewAlert): Promise<void> {
    await this.alerts.append(alert);
    const tokens = await this.pushTokens.listForFamily(alert.familyId);
    for (const registered of tokens) {
      try {
        await this.push.pushToDevice({
          incidentId: alert.ref,
          token: registered.token,
          message: alert.message,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.error(`${alert.kind} alert to a device failed: ${detail}`);
      }
    }
  }

  list(familyId: string): Promise<Alert[]> {
    return this.alerts.listByFamily(familyId);
  }

  /**
   * Whether an alert with this (ref, kind) was already raised. A caller that runs on a
   * schedule (the missed-dose sweep) checks this before raising, so a recurring
   * condition alerts the family once, not on every pass.
   */
  alreadyRaised(ref: string, kind: NewAlert['kind']): Promise<boolean> {
    return this.alerts.existsByRefKind(ref, kind);
  }
}
