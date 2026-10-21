import { StartOutboundVoiceContactCommand } from '@aws-sdk/client-connect';
import { SendTextMessageCommand } from '@aws-sdk/client-pinpoint-sms-voice-v2';
import { Logger } from '@nestjs/common';
import { AppConfig } from '../../../config/env.validation';
import type {
  ContactMessageInput,
  DeviceAlertInput,
  NotifyEmergencyInput,
  PlaceCallInput,
  PlaceCallResult,
} from '../temporal/types';
import { GENERIC_CALL_MESSAGE } from './call-confirmation';
import { ConnectConfirmationPoller } from './connect-confirmation.poller';
import { describeAwsError, speechSafe, type ConnectSender, type SmsSender } from './connect.client';
import { NotificationPort } from './notification.port';

/** StartOutboundVoiceContact accepts a ring timeout between 15 and 60 seconds. */
const MIN_RING_SECONDS = 15;
const MAX_RING_SECONDS = 60;

/**
 * Family calls through Amazon Connect in an EU region (decision 0014). No Lambda and no
 * public URL: StartOutboundVoiceContact dials the contact into the imported flow
 * (docs/hackathon/amazon-connect/obrigada-family-call.json), which reads the call text from
 * the `message` attribute, asks "Press 1 if you are handling this." and stores a press as
 * the attribute `confirmed` = "1". The ConnectConfirmationPoller reads it back.
 *
 * Rule #1 holds: the request carries text, ids and phone numbers, never pixels or audio.
 * The attributes are the same words the Twilio call speaks plus the incident and contact
 * ids (opaque UUIDs); no name, role or other personal detail is added. Logs carry ids and
 * AWS error names only, never phone numbers or the call text.
 *
 * Never crashes the ladder: an AWS failure falls back to Twilio when it is configured,
 * otherwise reports a call that nobody will confirm, and the workflow moves on to the next
 * contact (and, in the end, SMS, push and emergency), the safe default.
 */
export class ConnectNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger(ConnectNotificationAdapter.name);

  constructor(
    private readonly client: ConnectSender | null,
    private readonly sms: SmsSender | null,
    private readonly config: AppConfig,
    private readonly poller: ConnectConfirmationPoller,
    /** Twilio when it is configured too: used when a Connect call or SMS cannot be made. */
    private readonly fallback: NotificationPort | null,
  ) {}

  async placeCall(input: PlaceCallInput): Promise<PlaceCallResult> {
    if (!input.contact.phone) {
      this.logger.warn(`No phone for ${input.contact.role}; cannot place call`);
      return { answered: false };
    }
    if (!this.client) {
      // Should never happen: the module wires this adapter only when Connect is configured.
      throw new Error('ConnectNotificationAdapter requires a Connect client');
    }

    const command = new StartOutboundVoiceContactCommand(this.callRequest(input));
    let connectContactId: string | undefined;
    try {
      const out = await this.client.send(command);
      connectContactId = out.ContactId;
    } catch (err) {
      return this.callFailed(input, describeAwsError(err));
    }
    if (!connectContactId) return this.callFailed(input, 'no ContactId returned');

    this.poller.watch({
      incidentId: input.incidentId,
      contactId: input.contact.id,
      connectContactId,
      windowSeconds: input.ringSeconds,
    });
    this.logger.log(
      `Placed Connect call to ${input.contact.role} for incident ${input.incidentId} (press 1 to confirm)`,
    );
    return { answered: false, awaitsConfirmation: true };
  }

  /** The StartOutboundVoiceContact request. Exported shape is asserted by the tests. */
  callRequest(input: PlaceCallInput): StartOutboundVoiceContactCommand['input'] {
    const message = speechSafe(input.message ?? GENERIC_CALL_MESSAGE);
    return {
      InstanceId: this.config.connectInstanceId,
      ContactFlowId: this.config.connectContactFlowId,
      SourcePhoneNumber: this.config.connectSourcePhoneNumber,
      DestinationPhoneNumber: input.contact.phone!,
      // Temporal may retry the activity; the same token returns the same contact instead of
      // ringing the person twice. Valid for 7 days, far longer than any incident.
      ClientToken: `${input.incidentId}:${input.contact.id}`.slice(0, 500),
      RingTimeoutInSeconds: Math.min(
        MAX_RING_SECONDS,
        Math.max(MIN_RING_SECONDS, Math.round(input.ringSeconds)),
      ),
      Attributes: {
        message,
        incidentId: input.incidentId,
        contactId: input.contact.id,
      },
    };
  }

  private async callFailed(input: PlaceCallInput, reason: string): Promise<PlaceCallResult> {
    if (this.fallback) {
      this.logger.warn(
        `Connect call for incident ${input.incidentId} failed (${reason}); trying Twilio`,
      );
      return this.fallback.placeCall(input);
    }
    this.logger.error(
      `Connect call for incident ${input.incidentId} failed (${reason}); the ladder moves on`,
    );
    return { answered: false };
  }

  /**
   * Amazon Connect sends no SMS. With CONNECT_SMS_ORIGINATION set, texts go through AWS End
   * User Messaging SMS in the same EU region; otherwise through Twilio when configured;
   * otherwise they are skipped (logged) and the critical push carries the alert.
   */
  async sendSms(input: ContactMessageInput): Promise<void> {
    if (!input.contact.phone) {
      this.logger.warn(`No phone for ${input.contact.role}; cannot send SMS`);
      return;
    }
    const origination = this.config.connectSmsOrigination;
    if (this.sms && origination) {
      try {
        await this.sms.send(
          new SendTextMessageCommand({
            DestinationPhoneNumber: input.contact.phone,
            OriginationIdentity: origination,
            MessageBody: input.message,
            MessageType: 'TRANSACTIONAL',
          }),
        );
        this.logger.log(`Sent AWS SMS to ${input.contact.role} for incident ${input.incidentId}`);
        return;
      } catch (err) {
        // Never fail the activity over a text: the ladder must still reach its last steps.
        this.logger.warn(
          `AWS SMS for incident ${input.incidentId} failed (${describeAwsError(err)})` +
            (this.fallback ? '; trying Twilio' : '; push carries it'),
        );
        if (!this.fallback) return;
      }
    }
    if (this.fallback) return this.fallback.sendSms(input);
    this.logger.warn(
      `SMS skipped for ${input.contact.role} on incident ${input.incidentId}: ` +
        'Connect sends no SMS and neither CONNECT_SMS_ORIGINATION nor Twilio is configured; push carries it',
    );
  }

  async pushCriticalAlert(input: ContactMessageInput): Promise<void> {
    // Push is FCM/APNs, not Connect: the composite routes push to the FCM adapter.
    this.logger.log(`[not connect] critical alert for ${input.contact.role}`);
  }

  async pushDeviceAlert(input: DeviceAlertInput): Promise<void> {
    this.logger.log(`[not connect] critical alert for a device on incident ${input.incidentId}`);
  }

  async notifyEmergency(input: NotifyEmergencyInput): Promise<void> {
    // Emergency-services dialing is a deliberate, separately-reviewed integration.
    this.logger.warn(`[emergency not wired] would notify for incident ${input.incidentId}`);
  }
}
