import { Inject, Injectable } from '@nestjs/common';
import { Heartbeat } from './heartbeat';
import { HEARTBEAT_REPOSITORY, type HeartbeatRepository } from './heartbeat.repository';
import { PresenceService } from './presence.service';

/**
 * Fleet: device health and roster. Records heartbeats and updates presence so the
 * offline sweep can detect a guardian that has gone dark.
 */
@Injectable()
export class FleetService {
  constructor(
    @Inject(HEARTBEAT_REPOSITORY) private readonly heartbeats: HeartbeatRepository,
    private readonly presence: PresenceService,
  ) {}

  /**
   * Persist a heartbeat and refresh presence. Presence uses the server receive
   * time (not the device clock) so offline detection is robust to device skew.
   */
  async recordHeartbeat(heartbeat: Heartbeat, receivedAtMs: number): Promise<void> {
    await this.heartbeats.record(heartbeat);
    await this.presence.touch(heartbeat.deviceId, receivedAtMs);
  }
}
