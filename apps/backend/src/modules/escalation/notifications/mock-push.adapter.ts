import { Injectable, Logger } from '@nestjs/common';
import type { ContactMessageInput, DeviceAlertInput } from '../temporal/types';
import { PushPort } from './push.port';

/**
 * Dev/CI push adapter. Notifies NO device — it logs intent so the escalation ladder
 * can run end-to-end without FCM credentials or a native app build. The real
 * FcmPushAdapter implements the same port (F1.6).
 */
@Injectable()
export class MockPushAdapter implements PushPort {
  private readonly logger = new Logger(MockPushAdapter.name);

  async pushCriticalAlert(input: ContactMessageInput): Promise<void> {
    const target = input.contact.pushToken
      ? input.contact.role
      : `${input.contact.role} (no device)`;
    this.logger.log(`[mock] would send critical alert to ${target}: ${input.message}`);
  }

  async pushToDevice(input: DeviceAlertInput): Promise<void> {
    this.logger.log(`[mock] would send critical alert to device ${input.token}: ${input.message}`);
  }
}
