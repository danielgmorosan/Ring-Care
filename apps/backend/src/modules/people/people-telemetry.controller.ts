import { Controller, Get, Headers, Query, UnauthorizedException } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { DevicesService } from '../devices/devices.service';
import type { HouseholdRole } from './person.entity';
import { PeopleService } from './people.service';

/**
 * One roster entry the guardian needs to label a face during enrollment. Labels only:
 * the id (so the on-device face gallery keys to the same person the family app manages),
 * the household title to show, and the role. The face embedding and photo are computed
 * and stored on the device and never travel (CLAUDE.md rules #1/#4).
 */
export interface RosterEntry {
  id: string;
  title: string;
  role: HouseholdRole;
}

/**
 * Device-facing roster read (F2.2). When the caregiver enrolls faces on the guardian,
 * the guardian pulls the household roster it already built in the family app so they pick
 * a name for each captured face instead of typing it a second time — the person id links
 * the on-device gallery to the roster, so a later `person.known` resolves to the right
 * role for narration.
 *
 * Only labels cross the wire (down to the family's own paired phone); no biometric ever
 * does. Public to the JWT guard: a guardian has no user token and authenticates with its
 * per-device secret (Authorization: Bearer <deviceToken>), the same credential as the
 * heartbeat and zones-sync paths.
 */
@Controller('telemetry/roster')
export class PeopleTelemetryController {
  constructor(
    private readonly people: PeopleService,
    private readonly devices: DevicesService,
  ) {}

  /** The active household roster for the guardian's family, labels only. */
  @Public()
  @Get()
  async list(
    @Query('deviceId') deviceId: string,
    @Headers('authorization') authorization?: string,
  ): Promise<RosterEntry[]> {
    const familyId = await this.authenticateDevice(deviceId, authorization);
    const roster = await this.people.list(familyId);
    return roster
      .filter((person) => person.active)
      .map((person) => ({ id: person.id, title: person.title, role: person.role }));
  }

  /** Authenticate a guardian by its per-device token and return its family id. Generic
   * error either way — no oracle for probing device ids. */
  private async authenticateDevice(deviceId: string, authorization?: string): Promise<string> {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!deviceId || !token || !(await this.devices.verifyHeartbeatToken(deviceId, token))) {
      throw new UnauthorizedException('Invalid device credentials');
    }
    const device = await this.devices.findById(deviceId);
    if (!device) {
      throw new UnauthorizedException('Invalid device credentials');
    }
    return device.familyId;
  }
}
