import { Injectable, Logger } from '@nestjs/common';
import type {
  ContactMessageInput,
  DeviceAlertInput,
  NotifyEmergencyInput,
  PlaceCallInput,
} from '../temporal/types';
import { NotificationPort } from './notification.port';

/**
 * Dev/CI notification adapter. Places NO real calls or messages — it logs intent
 * so the ladder can be exercised end-to-end without Twilio credentials or dialing
 * anyone. Calls report "not answered" so escalation proceeds through the chain.
 * The real Twilio/FCM/APNs adapter (F1.5) implements the same port.
 */
@Injectable()
export class MockNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger(MockNotificationAdapter.name);

  async placeCall(input: PlaceCallInput): Promise<{ answered: boolean }> {
    this.logger.log(
      `[mock] would ring ${input.contact.role} (${input.contact.phone ?? 'no phone'})`,
    );
    return { answered: false };
  }

  async sendSms(input: ContactMessageInput): Promise<void> {
    this.logger.log(`[mock] would SMS ${input.contact.phone ?? 'no phone'}: ${input.message}`);
  }

  async pushCriticalAlert(input: ContactMessageInput): Promise<void> {
    this.logger.log(`[mock] would push critical alert to ${input.contact.role}`);
  }

  async pushDeviceAlert(input: DeviceAlertInput): Promise<void> {
    this.logger.log(`[mock] would push critical alert to device ${input.token}`);
  }

  async notifyEmergency(input: NotifyEmergencyInput): Promise<void> {
    this.logger.warn(`[mock] would notify emergency services for incident ${input.incidentId}`);
  }
}
