import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { timingSafeEqual } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { InternalEvent, type DeviceRegisteredPayload } from '../../internal-events/internal-events';
import { FamiliesService } from '../families/families.service';
import { Device } from './device.entity';
import { DEVICE_REPOSITORY, type DeviceRepository } from './device.repository';
import { hashDeviceToken } from './provisioning';

export interface RegisterDeviceInput {
  familyId: string;
  name: string;
}

@Injectable()
export class DevicesService {
  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    private readonly families: FamiliesService,
    private readonly bus: EventEmitter2,
  ) {}

  async register(input: RegisterDeviceInput): Promise<Device> {
    // A device must belong to a known family. Throws NotFound if the family is unknown.
    await this.families.findByIdOrFail(input.familyId);

    const device: Device = {
      id: uuidv4(),
      familyId: input.familyId,
      name: input.name,
      status: 'registered',
      registeredAt: new Date().toISOString(),
    };
    const saved = await this.devices.create(device);

    const payload: DeviceRegisteredPayload = {
      deviceId: saved.id,
      familyId: saved.familyId,
      registeredAt: saved.registeredAt,
    };
    this.bus.emit(InternalEvent.DeviceRegistered, payload);

    return saved;
  }

  async findByFamily(familyId: string): Promise<Device[]> {
    return this.devices.findByFamily(familyId);
  }

  /** Look up a single device by id (e.g. to resolve which family a fall belongs to). */
  async findById(deviceId: string): Promise<Device | null> {
    return this.devices.findById(deviceId);
  }

  /** GDPR erasure: clear caregiver-chosen device names for a family (decisions/0005). */
  async redactNamesForFamily(familyId: string): Promise<void> {
    await this.devices.redactNamesByFamily(familyId);
  }

  async findAll(): Promise<Device[]> {
    return this.devices.findAll();
  }

  /**
   * Whether a presented check-in token matches the one issued to this device at
   * provisioning. Constant-time compare; false for unknown or unprovisioned devices.
   */
  async verifyHeartbeatToken(deviceId: string, token: string): Promise<boolean> {
    const storedHash = await this.devices.getHeartbeatTokenHash(deviceId);
    if (!storedHash) return false;
    const presented = Buffer.from(hashDeviceToken(token));
    const stored = Buffer.from(storedHash);
    return presented.length === stored.length && timingSafeEqual(presented, stored);
  }
}
