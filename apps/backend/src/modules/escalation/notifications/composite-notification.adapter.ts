import type {
  ContactMessageInput,
  DeviceAlertInput,
  NotifyEmergencyInput,
  PlaceCallInput,
} from '../temporal/types';
import { NotificationPort } from './notification.port';
import { PushPort } from './push.port';

/**
 * Routes each escalation channel to its own provider: calls and SMS go to the
 * comms adapter (Twilio or mock, decision 0003), critical push goes to the push
 * adapter (FCM or mock, decision 0004). This keeps the two concerns independent —
 * you can enable real push without real calls, or the reverse — while the workflow
 * still sees one NotificationPort.
 */
export class CompositeNotificationAdapter implements NotificationPort {
  constructor(
    private readonly comms: NotificationPort,
    private readonly push: PushPort,
  ) {}

  placeCall(input: PlaceCallInput): Promise<{ answered: boolean }> {
    return this.comms.placeCall(input);
  }

  sendSms(input: ContactMessageInput): Promise<void> {
    return this.comms.sendSms(input);
  }

  pushCriticalAlert(input: ContactMessageInput): Promise<void> {
    return this.push.pushCriticalAlert(input);
  }

  pushDeviceAlert(input: DeviceAlertInput): Promise<void> {
    return this.push.pushToDevice(input);
  }

  notifyEmergency(input: NotifyEmergencyInput): Promise<void> {
    return this.comms.notifyEmergency(input);
  }
}
