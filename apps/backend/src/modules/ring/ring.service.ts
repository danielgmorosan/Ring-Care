import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppConfig } from '../../config/env.validation';
import {
  RING_CLIENT,
  RingApiError,
  RingDeviceOfflineError,
  type RingClient,
  type RingDevice,
} from './client/ring-client.port';
import {
  toCameraView,
  type RingActivity,
  type RingCamera,
  type RingCameraView,
  type RingPlacement,
  type RingStatus,
} from './ring.entity';
import { RING_REPOSITORY, type RingRepository } from './ring.repository';

const ACTIVITY_KINDS = new Set(['motion', 'ding', 'online', 'offline']);
const SESSION_ID = /^[A-Za-z0-9._~-]{1,200}$/;

interface OpenSession {
  familyId: string;
  cameraId: string;
  ringDeviceId: string;
  location: string;
  openedBy: string;
}

/** A doorbell is at a door by definition; anything else waits for the caregiver. */
export function suggestPlacement(device: Pick<RingDevice, 'kind' | 'name'>): RingPlacement {
  return /doorbell/i.test(device.kind ?? '') ? 'front_door' : 'other';
}

/**
 * Caregiver-facing Ring features: linked cameras, placement, the activity feed, and the
 * live-view signalling relay. Ring is bound to one household in the hackathon build
 * (RING_FAMILY_ID): every other family sees an unlinked, empty Ring.
 *
 * Live view is a window, not a recorder (rule #1): we pass the SDP offer and answer and
 * nothing else. Every open and close is a POST/DELETE, so the global AuditInterceptor
 * records it (rule #7, actions 'ring.live_open' / 'ring.live_close').
 */
@Injectable()
export class RingService {
  private readonly logger = new Logger(RingService.name);
  /** Ephemeral signalling state only; losing it just means close falls back to the path. */
  private readonly sessions = new Map<string, OpenSession>();

  constructor(
    private readonly config: AppConfig,
    @Inject(RING_REPOSITORY) private readonly repo: RingRepository,
    @Inject(RING_CLIENT) private readonly client: RingClient,
  ) {}

  private isLinked(familyId: string): boolean {
    return Boolean(this.config.ringFamilyId) && this.config.ringFamilyId === familyId;
  }

  private requireLinked(familyId: string): void {
    if (!this.isLinked(familyId)) throw new NotFoundException('Ring is not linked');
  }

  private requireApi(): void {
    if (this.config.ringAuthMode === 'off') {
      throw new ServiceUnavailableException('Ring account is not connected');
    }
  }

  async status(familyId: string): Promise<RingStatus> {
    if (!this.isLinked(familyId)) return { mode: 'off', webhooks: false, cameras: [] };
    return {
      mode: this.config.ringAuthMode,
      webhooks: this.config.hasRingWebhooks,
      cameras: await this.cameras(familyId),
    };
  }

  async cameras(familyId: string): Promise<RingCameraView[]> {
    if (!this.isLinked(familyId)) return [];
    return (await this.repo.listCameras(familyId)).map(toCameraView);
  }

  async sync(familyId: string): Promise<RingCameraView[]> {
    this.requireLinked(familyId);
    this.requireApi();
    const devices = await this.callRing(() => this.client.listDevices());
    for (const d of devices) {
      await this.repo.upsertFromSync(familyId, {
        ringDeviceId: d.id,
        name: d.name,
        online: d.online,
        placementIfNew: suggestPlacement(d),
      });
    }
    return this.cameras(familyId);
  }

  async setPlacement(
    familyId: string,
    cameraId: string,
    placement: RingPlacement,
  ): Promise<RingCameraView> {
    this.requireLinked(familyId);
    const updated = await this.repo.setPlacement(familyId, cameraId, placement);
    if (!updated) throw new NotFoundException('Camera not found');
    return toCameraView(updated);
  }

  async activity(familyId: string, limit: number): Promise<RingActivity[]> {
    if (!this.isLinked(familyId)) return [];
    const [events, cameras] = await Promise.all([
      this.repo.listEvents(familyId, limit),
      this.repo.listCameras(familyId),
    ]);
    const byId = new Map(cameras.map((c) => [c.id, c]));
    const out: RingActivity[] = [];
    for (const e of events) {
      const cam = e.ringCameraId ? byId.get(e.ringCameraId) : undefined;
      if (!cam || !ACTIVITY_KINDS.has(e.kind)) continue;
      out.push({
        id: e.id,
        cameraId: cam.id,
        cameraName: cam.name,
        placement: cam.placement,
        kind: e.kind as RingActivity['kind'],
        subType: e.subType,
        occurredAt: e.occurredAt,
        source: e.source,
        interpretation: null,
      });
    }
    return out;
  }

  async openLive(
    familyId: string,
    userId: string,
    cameraId: string,
    sdpOffer: string,
  ): Promise<{ sessionId: string; sdpAnswer: string }> {
    const camera = await this.cameraFor(familyId, cameraId);
    this.requireApi();
    let session;
    try {
      session = await this.client.startLiveView(camera.ringDeviceId, sdpOffer);
    } catch (err) {
      // Ring's 503 is the truth about the camera: reflect it in our camera list.
      if (err instanceof RingDeviceOfflineError) {
        await this.repo.setOnline(familyId, camera.id, false);
      }
      throw this.mapRingError(err);
    }
    this.sessions.set(session.sessionId, {
      familyId,
      cameraId: camera.id,
      ringDeviceId: camera.ringDeviceId,
      location: session.location,
      openedBy: userId,
    });
    this.logger.log(`Ring live view opened: camera ${camera.id} by user ${userId}`);
    return { sessionId: session.sessionId, sdpAnswer: session.sdpAnswer };
  }

  async closeLive(
    familyId: string,
    userId: string,
    cameraId: string,
    sessionId: string,
  ): Promise<void> {
    const camera = await this.cameraFor(familyId, cameraId);
    if (!SESSION_ID.test(sessionId)) throw new BadRequestException('Invalid session id');
    const known = this.sessions.get(sessionId);
    if (known && (known.familyId !== familyId || known.cameraId !== camera.id)) {
      throw new NotFoundException('Session not found');
    }
    this.requireApi();
    await this.callRing(() =>
      this.client.stopLiveView(camera.ringDeviceId, sessionId, known?.location),
    );
    this.sessions.delete(sessionId);
    this.logger.log(`Ring live view closed: camera ${camera.id} by user ${userId}`);
  }

  private async cameraFor(familyId: string, cameraId: string): Promise<RingCamera> {
    this.requireLinked(familyId);
    const camera = await this.repo.findCamera(familyId, cameraId);
    if (!camera) throw new NotFoundException('Camera not found');
    return camera;
  }

  private async callRing<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw this.mapRingError(err);
    }
  }

  /** Map Ring failures onto honest HTTP answers for the family app. */
  private mapRingError(err: unknown): unknown {
    if (err instanceof RingDeviceOfflineError) {
      return new ServiceUnavailableException('This camera is offline right now');
    }
    if (err instanceof RingApiError) {
      this.logger.warn(err.message);
      if (err.status === 429)
        return new ServiceUnavailableException('Ring is busy. Try again shortly');
      return new BadGatewayException('Ring did not respond as expected');
    }
    return err;
  }
}
