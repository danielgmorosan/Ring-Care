import { Injectable } from '@nestjs/common';
import { Device } from './device.entity';
import { DeviceRepository } from './device.repository';

/** In-memory adapter for the skeleton phase. Replaced by TimescaleDB in F0.2. */
@Injectable()
export class InMemoryDeviceRepository implements DeviceRepository {
  private readonly devices = new Map<string, Device>();
  private readonly tokenHashes = new Map<string, string>();

  async create(device: Device): Promise<Device> {
    this.devices.set(device.id, device);
    return device;
  }

  async findById(id: string): Promise<Device | null> {
    return this.devices.get(id) ?? null;
  }

  async findByFamily(familyId: string): Promise<Device[]> {
    return [...this.devices.values()].filter((d) => d.familyId === familyId);
  }

  async findAll(): Promise<Device[]> {
    return [...this.devices.values()];
  }

  async updateStatus(id: string, status: Device['status']): Promise<Device | null> {
    const device = this.devices.get(id);
    if (!device) return null;
    const updated: Device = { ...device, status };
    this.devices.set(id, updated);
    return updated;
  }

  async setHeartbeatTokenHash(id: string, tokenHash: string): Promise<void> {
    this.tokenHashes.set(id, tokenHash);
  }

  async getHeartbeatTokenHash(id: string): Promise<string | null> {
    return this.tokenHashes.get(id) ?? null;
  }

  async redactNamesByFamily(familyId: string): Promise<void> {
    for (const [id, device] of this.devices) {
      if (device.familyId === familyId) {
        this.devices.set(id, { ...device, name: 'Erased device' });
      }
    }
  }
}
