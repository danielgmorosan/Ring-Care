import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { DeviceCommandAck } from './device-command-ack.entity';
import { DeviceCommandAckRepository, NewDeviceCommandAck } from './device-command-ack.repository';

@Injectable()
export class InMemoryDeviceCommandAckRepository implements DeviceCommandAckRepository {
  private readonly byCommand = new Map<string, DeviceCommandAck>();
  private seq = 0;

  async append(ack: NewDeviceCommandAck): Promise<void> {
    if (this.byCommand.has(ack.commandId)) return; // idempotent on commandId
    this.byCommand.set(ack.commandId, {
      id: uuidv4(),
      ...ack,
      // Monotonic synthetic timestamp; avoids Date.now() for stable test ordering.
      createdAt: new Date(this.seq++).toISOString(),
    });
  }

  async latestByCommandIds(commandIds: string[]): Promise<Map<string, DeviceCommandAck>> {
    const out = new Map<string, DeviceCommandAck>();
    for (const id of commandIds) {
      const ack = this.byCommand.get(id);
      if (ack) out.set(id, ack);
    }
    return out;
  }
}
