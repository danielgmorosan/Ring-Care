import { ConnectClient } from '@aws-sdk/client-connect';
import { PinpointSMSVoiceV2Client } from '@aws-sdk/client-pinpoint-sms-voice-v2';
import { Logger } from '@nestjs/common';
import type { AppConfig } from '../../../config/env.validation';
import { assertEuConnectRegion, type ConnectSender, type SmsSender } from './connect.client';
import type { NotificationPort } from './notification.port';

const logger = new Logger('CallProvider');

/**
 * The real Connect client only when CALL_PROVIDER=connect; null otherwise. The EU region
 * guard runs whenever Connect is asked for, configured or not, so a non-EU region is
 * refused at boot (rule #6) instead of surfacing later.
 */
export function createConnectClient(config: AppConfig): ConnectSender | null {
  if (config.callProviderRequested !== 'connect') return null;
  assertEuConnectRegion(config.connectRegion);
  if (!config.hasConnect) {
    logger.error(
      'CALL_PROVIDER=connect but CONNECT_INSTANCE_ID, CONNECT_CONTACT_FLOW_ID or ' +
        `CONNECT_SOURCE_PHONE_NUMBER is missing; calls go through ${config.callProvider} instead`,
    );
    return null;
  }
  // Credentials resolve through the default AWS provider chain, never from code.
  return new ConnectClient({ region: config.connectRegion, maxAttempts: 3 });
}

/** The End User Messaging SMS client only for Connect with an origination identity. */
export function createSmsClient(config: AppConfig): SmsSender | null {
  if (config.callProvider !== 'connect' || !config.connectSmsOrigination) return null;
  return new PinpointSMSVoiceV2Client({ region: config.connectRegion, maxAttempts: 3 });
}

/** Pick the calls/SMS adapter for the configured provider. Exported for tests. */
export function selectComms(
  config: AppConfig,
  adapters: { mock: NotificationPort; twilio: NotificationPort; connect: NotificationPort },
): NotificationPort {
  switch (config.callProvider) {
    case 'connect':
      return adapters.connect;
    case 'twilio':
      return adapters.twilio;
    default:
      return adapters.mock;
  }
}
