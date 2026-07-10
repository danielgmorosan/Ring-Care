import { createSign } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../config/env.validation';
import type { ContactMessageInput, DeviceAlertInput } from '../temporal/types';
import { PushPort } from './push.port';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TITLE = 'Obrigada safety alert';

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * The FCM v1 message for a critical alert. Pure and exported so the exact shape —
 * high-priority on Android, `interruption-level: critical` + critical sound on iOS
 * (what makes it sound through silent/DND) — is unit-tested without any network.
 */
export function buildCriticalAlertMessage(token: string, body: string): Record<string, unknown> {
  return {
    message: {
      token,
      notification: { title: TITLE, body },
      android: {
        priority: 'HIGH',
        notification: { channelId: 'critical', sound: 'default' },
      },
      apns: {
        headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
        payload: {
          aps: {
            alert: { title: TITLE, body },
            sound: { critical: 1, name: 'default', volume: 1.0 },
            'interruption-level': 'critical',
          },
        },
      },
    },
  };
}

/**
 * The real critical-alert adapter: FCM HTTP v1 over fetch (no SDK dependency),
 * authenticated with the service account via a signed JWT → OAuth2 access token
 * (cached until it expires). Enabled only when the full FCM credential set is
 * configured — gated on a recorded founder decision (rule #6, docs/decisions/0004).
 * Rule #1 is preserved: only alert text and an opaque device token leave.
 */
@Injectable()
export class FcmPushAdapter implements PushPort {
  private readonly logger = new Logger(FcmPushAdapter.name);
  private cachedToken: { value: string; expiresAtMs: number } | null = null;

  constructor(private readonly config: AppConfig) {}

  async pushCriticalAlert(input: ContactMessageInput): Promise<void> {
    if (!input.contact.pushToken) {
      this.logger.log(`No device token for ${input.contact.role}; cannot send critical alert`);
      return;
    }
    await this.send(input.contact.pushToken, input.message);
    this.logger.log(`Sent critical alert to ${input.contact.role}`);
  }

  async pushToDevice(input: DeviceAlertInput): Promise<void> {
    await this.send(input.token, input.message);
    this.logger.log(`Sent critical alert to a registered device`);
  }

  /** POST one critical-alert message to a device token via FCM v1. */
  private async send(token: string, body: string): Promise<void> {
    const accessToken = await this.accessToken();
    const projectId = this.config.fcmProjectId!;
    const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildCriticalAlertMessage(token, body)),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // Throwing lets the Temporal activity retry delivery.
      throw new Error(`FCM send failed (${res.status}): ${detail.slice(0, 200)}`);
    }
  }

  /** A cached OAuth2 access token for the service account (JWT-bearer grant). */
  private async accessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAtMs > now + 60_000) {
      return this.cachedToken.value;
    }

    const clientEmail = this.config.fcmClientEmail;
    const privateKey = this.config.fcmPrivateKey;
    if (!clientEmail || !privateKey) {
      // Should never happen: the module only wires this adapter when hasPush.
      throw new Error('FcmPushAdapter requires FCM_CLIENT_EMAIL and FCM_PRIVATE_KEY');
    }

    const iat = Math.floor(now / 1000);
    const claims = {
      iss: clientEmail,
      scope: FCM_SCOPE,
      aud: TOKEN_URL,
      iat,
      exp: iat + 3600,
    };
    const signingInput = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(
      JSON.stringify(claims),
    )}`;
    const signature = base64url(createSign('RSA-SHA256').update(signingInput).sign(privateKey));
    const assertion = `${signingInput}.${signature}`;

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`FCM token exchange failed (${res.status}): ${detail.slice(0, 200)}`);
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.cachedToken = {
      value: data.access_token,
      expiresAtMs: now + data.expires_in * 1000,
    };
    return data.access_token;
  }
}
