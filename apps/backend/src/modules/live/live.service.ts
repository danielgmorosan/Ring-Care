import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AccessToken } from 'livekit-server-sdk';
import { AppConfig } from '../../config/env.validation';

/** A minted LiveKit grant the family app uses to join and watch a guardian's live camera. */
export interface LiveGrant {
  /** The LiveKit server URL to connect to (self-hosted EU or LiveKit Cloud EU region). */
  url: string;
  /** A short-lived, scoped access token. */
  token: string;
  /** The room this token is scoped to (one room per guardian). */
  room: string;
  /** The viewer's stable identity in the room. */
  identity: string;
  /** How long the token is valid, in seconds. */
  expiresInSeconds: number;
}

/** One LiveKit room per guardian; the guardian publishes into it, the family subscribes. */
export function roomForDevice(deviceId: string): string {
  return `guardian-${deviceId}`;
}

/** A viewing session token lives 30 minutes — long enough to watch, short enough that a
 * leaked token is not a standing key. The family re-requests to look again. */
const VIEWER_TTL_SECONDS = 60 * 30;

/** A guardian's publish token lives an hour; the guardian fetches one when a viewer arrives
 * and drops the camera when they leave, so streaming only happens while someone is watching. */
const PUBLISHER_TTL_SECONDS = 60 * 60;

/**
 * Mints scoped LiveKit tokens for live view (F2.5). The family member gets a **view-only**
 * token (subscribe, never publish); the guardian publishes its camera with its own
 * device-scoped token. Media is end-to-end encrypted between the devices — LiveKit only
 * relays it and cannot decrypt (rule #1's live-channel exception). This service holds the
 * LiveKit API secret; no media ever passes through the backend.
 *
 * Off unless the full LiveKit credential set is configured (rule #6, gated on
 * docs/decisions/0010-live-view-camera.md). When off, callers get a clear 503 and the
 * safety core is unaffected.
 */
@Injectable()
export class LiveService {
  constructor(private readonly config: AppConfig) {}

  get enabled(): boolean {
    return this.config.hasLiveKit;
  }

  /** A view-only token for a family member to watch one guardian's live camera. */
  async mintViewerToken(deviceId: string, viewerId: string): Promise<LiveGrant> {
    if (!this.enabled) {
      throw new ServiceUnavailableException('Live view is not configured.');
    }
    const room = roomForDevice(deviceId);
    const at = new AccessToken(this.config.livekitApiKey!, this.config.livekitApiSecret!, {
      identity: viewerId,
      ttl: VIEWER_TTL_SECONDS,
    });
    at.addGrant({
      room,
      roomJoin: true,
      canSubscribe: true,
      // View-only: the family never publishes into the elder's room (rule of least authority).
      canPublish: false,
      canPublishData: false,
    });
    return {
      url: this.config.livekitUrl!,
      token: await at.toJwt(),
      room,
      identity: viewerId,
      expiresInSeconds: VIEWER_TTL_SECONDS,
    };
  }

  /** A publish token for a guardian to stream its camera into its own room. Publish-only:
   * the guardian pushes video, it never subscribes to (watches) the room. Identity is the
   * device id. Requested on demand when a viewer arrives. */
  async mintPublisherToken(deviceId: string): Promise<LiveGrant> {
    if (!this.enabled) {
      throw new ServiceUnavailableException('Live view is not configured.');
    }
    const room = roomForDevice(deviceId);
    const at = new AccessToken(this.config.livekitApiKey!, this.config.livekitApiSecret!, {
      identity: deviceId,
      ttl: PUBLISHER_TTL_SECONDS,
    });
    at.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      // Publish-only: the guardian streams its camera and never watches the room.
      canSubscribe: false,
      // Allow a data channel for the E2EE key handshake / lightweight signaling.
      canPublishData: true,
    });
    return {
      url: this.config.livekitUrl!,
      token: await at.toJwt(),
      room,
      identity: deviceId,
      expiresInSeconds: PUBLISHER_TTL_SECONDS,
    };
  }
}
