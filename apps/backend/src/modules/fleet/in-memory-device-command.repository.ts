import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { DeviceCommand } from './device-command.entity';
import { DeviceCommandRepository, NewDeviceCommand } from './device-command.repository';

@Injectable()
export class InMemoryDeviceCommandRepository implements DeviceCommandRepository {
  private readonly byDevice = new Map<string, DeviceCommand[]>();
  private seq = 0;

  async append(command: NewDeviceCommand): Promise<DeviceCommand> {
    const record: DeviceCommand = {
      id: uuidv4(),
      ...command,
      // Monotonic synthetic timestamp; avoids Date.now() for stable test ordering.
      createdAt: new Date(this.seq++).toISOString(),
    };
    const list = this.byDevice.get(command.deviceId) ?? [];
    list.push(record);
    this.byDevice.set(command.deviceId, list);
    return record;
  }

  async listByDevice(familyId: string, deviceId: string): Promise<DeviceCommand[]> {
    return (this.byDevice.get(deviceId) ?? [])
      .filter((c) => c.familyId === familyId)
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  }

  async findById(id: string): Promise<DeviceCommand | null> {
    for (const list of this.byDevice.values()) {
      const found = list.find((c) => c.id === id);
      if (found) return found;
    }
    return null;
  }
}
