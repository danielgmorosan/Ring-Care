import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DevicesService } from '../devices/devices.service';
import { CreateZoneDto, UpdateZoneDto } from './dto/zone.dto';
import type { Zone } from './zone.entity';
import { ZONE_REPOSITORY, type ZoneRepository, type ZoneUpdate } from './zone.repository';

/**
 * The zones a family has drawn on their guardians (F2.3). Caregiver-managed
 * configuration, always scoped to the caller's family. Creating a zone requires owning
 * the device it is drawn on; every other op is scoped by family id, so one family can
 * never see or touch another's zones. Removal is a soft deactivate, never a delete.
 */
@Injectable()
export class ZonesService {
  constructor(
    @Inject(ZONE_REPOSITORY) private readonly zones: ZoneRepository,
    private readonly devices: DevicesService,
  ) {}

  list(familyId: string): Promise<Zone[]> {
    return this.zones.listByFamily(familyId);
  }

  /** A device's active zones — what the guardian syncs and the zone evaluator reads. */
  activeOnDevice(deviceId: string): Promise<Zone[]> {
    return this.zones.listActiveByDevice(deviceId);
  }

  /**
   * A guardian saves a zone it drew on its own camera (F2.3). The caller has already
   * authenticated the device by its per-device token, so the family is the device's own
   * — no caregiver session is involved. Zones are drawn on the device because the frame
   * they are drawn over never leaves it (rule #1).
   */
  async createOnDevice(deviceId: string, dto: CreateZoneDto): Promise<Zone> {
    const device = await this.devices.findById(deviceId);
    if (!device) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }
    return this.zones.create({
      deviceId,
      familyId: device.familyId,
      name: dto.name,
      kind: dto.kind,
      points: dto.points,
    });
  }

  async create(familyId: string, dto: CreateZoneDto): Promise<Zone> {
    await this.assertOwnedDevice(familyId, dto.deviceId);
    return this.zones.create({
      deviceId: dto.deviceId,
      familyId,
      name: dto.name,
      kind: dto.kind,
      points: dto.points,
    });
  }

  async update(familyId: string, id: string, dto: UpdateZoneDto): Promise<Zone> {
    const patch: ZoneUpdate = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.kind !== undefined) patch.kind = dto.kind;
    if (dto.points !== undefined) patch.points = dto.points;
    const updated = await this.zones.update(familyId, id, patch);
    if (!updated) {
      throw new NotFoundException(`Zone ${id} not found in family ${familyId}`);
    }
    return updated;
  }

  async remove(familyId: string, id: string): Promise<void> {
    const removed = await this.zones.deactivate(familyId, id);
    if (!removed) {
      throw new NotFoundException(`Zone ${id} not found in family ${familyId}`);
    }
  }

  /** A zone may only be drawn on a device the caller's family owns. */
  private async assertOwnedDevice(familyId: string, deviceId: string): Promise<void> {
    const device = await this.devices.findById(deviceId);
    if (!device || device.familyId !== familyId) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }
  }
}
