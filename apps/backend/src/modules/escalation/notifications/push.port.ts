import type { ContactMessageInput, DeviceAlertInput } from '../temporal/types';

/**
 * The critical-alert push channel, separate from calls/SMS (which is the Twilio
 * NotificationPort). The real adapter is FCM (with APNs for iOS); dev/CI use a mock
 * that notifies no device. A push carries alert text and an opaque device token
 * only — never media (rule #1).
 */
export interface PushPort {
  /** Send a critical alert to the contact's registered device (if any). */
  pushCriticalAlert(input: ContactMessageInput): Promise<void>;
  /** Send a critical alert to a raw registered device token (a caregiver's app). */
  pushToDevice(input: DeviceAlertInput): Promise<void>;
}

export const PUSH_PORT = Symbol('PUSH_PORT');
