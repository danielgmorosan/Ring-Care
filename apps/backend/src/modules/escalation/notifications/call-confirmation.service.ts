import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../config/env.validation';
import { EscalationService } from '../escalation.service';
import {
  buildConfirmReplyTwiml,
  deriveCallbackKey,
  verifyConfirmToken,
  verifyTwilioSignature,
} from './call-confirmation';

export interface ConfirmCallbackRequest {
  /** The full URL Twilio requested (PUBLIC_BASE_URL + path + query), for its signature. */
  url: string;
  query: Record<string, unknown>;
  /** Twilio's form-encoded POST parameters. */
  body: Record<string, unknown>;
  twilioSignature: string | undefined;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/**
 * Handles Twilio's press-1 callback (decision 0003, follow-up). Two independent checks
 * before anything reaches the safety core: our own HMAC on the link (binds incident,
 * contact and expiry, so a confirmation cannot be forged or replayed onto another
 * incident), and Twilio's X-Twilio-Signature when the auth token is configured (proves
 * the request came from Twilio). A valid "1" signals the workflow, which records it on
 * the append-only incident trail and stops the ladder. Anything else changes nothing:
 * the workflow's own timer moves on.
 */
@Injectable()
export class CallConfirmationService {
  private readonly logger = new Logger(CallConfirmationService.name);

  constructor(
    private readonly config: AppConfig,
    private readonly escalation: EscalationService,
  ) {}

  async handle(req: ConfirmCallbackRequest, nowMs: number = Date.now()): Promise<string> {
    const incidentId = str(req.query.incident);
    const contactId = str(req.query.contact);
    const key = deriveCallbackKey({
      callbackSigningSecret: this.config.callbackSigningSecret,
      jwtSecret: this.config.jwtSecret,
    });
    const check = verifyConfirmToken(
      key,
      { incidentId, contactId, exp: str(req.query.exp), token: str(req.query.token) },
      Math.floor(nowMs / 1000),
    );
    if (check !== 'ok') {
      this.logger.warn(`Rejected call confirmation callback (${check})`);
      throw new ForbiddenException('Invalid confirmation link');
    }

    const authToken = this.config.twilioAuthToken;
    if (authToken) {
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.body ?? {})) {
        if (typeof v === 'string') params[k] = v;
      }
      if (!verifyTwilioSignature(authToken, req.url, params, req.twilioSignature)) {
        this.logger.warn(
          `Rejected call confirmation for incident ${incidentId}: bad Twilio signature`,
        );
        throw new ForbiddenException('Invalid Twilio signature');
      }
    }

    const digits = str(req.body?.Digits)?.trim() ?? '';
    if (digits !== '1') {
      this.logger.log(
        `Contact ${contactId} did not confirm incident ${incidentId} ` +
          `(${digits ? 'pressed another key' : 'no input'}); the ladder moves on`,
      );
      return buildConfirmReplyTwiml(digits ? 'other_digit' : 'no_input');
    }

    try {
      await this.escalation.confirmByCall(incidentId!, contactId!);
    } catch (error) {
      // The incident is unknown or its workflow already finished: nothing to stop.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Press 1 for incident ${incidentId} not delivered: ${message}`);
      return buildConfirmReplyTwiml('closed');
    }
    return buildConfirmReplyTwiml('confirmed');
  }
}
