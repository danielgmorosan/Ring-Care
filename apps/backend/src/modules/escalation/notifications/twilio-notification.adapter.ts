import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../config/env.validation';
import type {
  ContactMessageInput,
  DeviceAlertInput,
  NotifyEmergencyInput,
  PlaceCallInput,
} from '../temporal/types';
import { NotificationPort } from './notification.port';

/**
 * The real outbound-comms adapter: Twilio Programmable SMS and Voice over the REST
 * API (fetch, no SDK dependency). Enabled only when the full Twilio credential set
 * is configured — itself gated on a recorded founder decision, because family phone
 * numbers and alert text pass through a new subprocessor (rule #6, docs/decisions/0003).
 *
 * Rule #1 is preserved: this carries text and phone numbers only, never pixels or
 * audio. The escalation workflow — never this adapter — decides who is contacted;
 * the append-only incident trail records every call/SMS regardless of adapter.
 *
 * Scope of this first pass: real SMS and calls. Push (FCM/APNs) and a dedicated
 * emergency-services integration are separate adapters; here they are logged so the
 * ladder still runs without silently claiming to have done something it did not.
 */
@Injectable()
export class TwilioNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger(TwilioNotificationAdapter.name);

  constructor(private readonly config: AppConfig) {}

  /**
   * Ring a contact. Twilio's call-creation REST call cannot synchronously report
   * whether a human answered, so this returns `answered: false` — the safety core
   * must never falsely believe a contact picked up and stop escalating. Real
   * answered-detection (status callback / AMD) is an additive follow-up.
   */
  async placeCall(input: PlaceCallInput): Promise<{ answered: boolean }> {
    if (!input.contact.phone) {
      this.logger.warn(`No phone for ${input.contact.role}; cannot place call`);
      return { answered: false };
    }
    // A minimal spoken message; TwiML read aloud by Twilio's TTS.
    const twiml =
      '<Response><Say voice="alice">This is an Obrigada safety alert. ' +
      'Please open your Obrigada app to check on your family member.</Say></Response>';
    await this.post('Calls.json', {
      To: input.contact.phone,
      From: this.from(),
      Twiml: twiml,
    });
    this.logger.log(`Placed Twilio call to ${input.contact.role} for incident ${input.incidentId}`);
    return { answered: false };
  }

  async sendSms(input: ContactMessageInput): Promise<void> {
    if (!input.contact.phone) {
      this.logger.warn(`No phone for ${input.contact.role}; cannot send SMS`);
      return;
    }
    await this.post('Messages.json', {
      To: input.contact.phone,
      From: this.from(),
      Body: input.message,
    });
    this.logger.log(`Sent Twilio SMS to ${input.contact.role} for incident ${input.incidentId}`);
  }

  async pushCriticalAlert(input: ContactMessageInput): Promise<void> {
    // Push is FCM/APNs, not Twilio — the composite routes push to the FCM adapter.
    this.logger.log(`[not twilio] critical alert for ${input.contact.role}`);
  }

  async pushDeviceAlert(input: DeviceAlertInput): Promise<void> {
    // Push is FCM/APNs, not Twilio — the composite routes push to the FCM adapter.
    this.logger.log(`[not twilio] critical alert for device ${input.token}`);
  }

  async notifyEmergency(input: NotifyEmergencyInput): Promise<void> {
    // Emergency-services dialing is a deliberate, separately-reviewed integration.
    this.logger.warn(`[emergency not wired] would notify for incident ${input.incidentId}`);
  }

  private from(): string {
    const from = this.config.twilioFromNumber;
    if (!from) {
      // Should never happen: the module only wires this adapter when hasTwilio.
      throw new Error('TwilioNotificationAdapter requires TWILIO_FROM_NUMBER');
    }
    return from;
  }

  /** One form-encoded, Basic-authenticated POST to a Twilio account resource. */
  private async post(resource: string, form: Record<string, string>): Promise<void> {
    const sid = this.config.twilioAccountSid;
    const token = this.config.twilioAuthToken;
    if (!sid || !token) {
      throw new Error(
        'TwilioNotificationAdapter requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN',
      );
    }
    const url = `${this.config.twilioApiBaseUrl}/2010-04-01/Accounts/${sid}/${resource}`;
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Basic ${auth}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(form).toString(),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // Throwing lets the Temporal activity retry the delivery.
      throw new Error(`Twilio ${resource} failed (${res.status}): ${body.slice(0, 200)}`);
    }
  }
}
