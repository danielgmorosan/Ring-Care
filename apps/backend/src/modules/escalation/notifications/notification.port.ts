import type {
  ContactMessageInput,
  DeviceAlertInput,
  NotifyEmergencyInput,
  PlaceCallInput,
  PlaceCallResult,
} from '../temporal/types';

/**
 * The outbound-communication port used by escalation activities. The real adapter
 * (Twilio Programmable Voice/SMS, FCM/APNs) implements this; dev/CI use a mock that
 * places no real calls. Credentials come from the vault, never the repo.
 */
export interface NotificationPort {
  placeCall(input: PlaceCallInput): Promise<PlaceCallResult>;
  sendSms(input: ContactMessageInput): Promise<void>;
  pushCriticalAlert(input: ContactMessageInput): Promise<void>;
  /** Critical-alert a registered caregiver device (routed to the push channel). */
  pushDeviceAlert(input: DeviceAlertInput): Promise<void>;
  notifyEmergency(input: NotifyEmergencyInput): Promise<void>;
}

export const NOTIFICATION_PORT = Symbol('NOTIFICATION_PORT');
