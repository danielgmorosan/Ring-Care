import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  InternalEvent,
  type DeviceCommandIssuedPayload,
} from '../../internal-events/internal-events';
import { DevicesService } from '../devices/devices.service';
import type { DeviceCommandAckStatus } from './device-command-ack.entity';
import {
  DEVICE_COMMAND_ACK_REPOSITORY,
  type DeviceCommandAckRepository,
} from './device-command-ack.repository';
import type { DeviceCommand } from './device-command.entity';
import {
  DEVICE_COMMAND_REPOSITORY,
  type DeviceCommandRepository,
} from './device-command.repository';

/** A command with the guardian's acknowledgement, for the family history view. */
export interface DeviceCommandView {
  id: string;
  command: DeviceCommand['command'];
  issuedAt: string;
  /** pending until the device acks, then executed or failed. */
  status: 'pending' | DeviceCommandAckStatus;
  ackedAt: string | null;
  ackDetail: string | null;
}

/**
 * Backend → device commands for the fleet (F2.6). Issuing a command requires owning the
 * device; it is recorded to the append-only trail (who, which guardian, when — rule #7)
 * and emitted on the internal bus, where the device link publishes it to the guardian's
 * command topic. The record is written before the command goes out, so a wipe is never
 * delivered without its audit.
 */
@Injectable()
export class DeviceCommandsService {
  constructor(
    private readonly devices: DevicesService,
    @Inject(DEVICE_COMMAND_REPOSITORY) private readonly commands: DeviceCommandRepository,
    @Inject(DEVICE_COMMAND_ACK_REPOSITORY) private readonly acks: DeviceCommandAckRepository,
    private readonly bus: EventEmitter2,
  ) {}

  /** Remote-wipe a guardian: clear its encrypted storage (biometrics included, rule #4). */
  async issueWipe(
    familyId: string,
    deviceId: string,
    issuedByUserId: string,
  ): Promise<{ commandId: string }> {
    const device = await this.devices.findById(deviceId);
    if (!device || device.familyId !== familyId) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }

    const issuedAt = new Date().toISOString();
    const record = await this.commands.append({
      deviceId,
      familyId,
      command: 'wipe',
      issuedByUserId,
      issuedAt,
    });

    const payload: DeviceCommandIssuedPayload = {
      deviceId,
      commandId: record.id,
      command: 'wipe',
      issuedAt,
    };
    this.bus.emit(InternalEvent.DeviceCommandIssued, payload);

    return { commandId: record.id };
  }

  /**
   * A guardian's own acknowledgement that it carried out a command (F2.6). Called from
   * the device-authenticated telemetry path. The ack must target a real command that
   * belongs to this device — a guardian cannot ack another's command.
   */
  async recordAck(
    deviceId: string,
    commandId: string,
    status: DeviceCommandAckStatus,
    detail: string | null,
  ): Promise<void> {
    const command = await this.commands.findById(commandId);
    if (!command || command.deviceId !== deviceId) {
      throw new NotFoundException(`Command ${commandId} not found for device ${deviceId}`);
    }
    await this.acks.append({
      commandId,
      deviceId,
      status,
      detail,
      ackedAt: new Date().toISOString(),
    });
  }

  /** A guardian's command history with each command's ack status, family-scoped. */
  async historyForFamily(familyId: string, deviceId: string): Promise<DeviceCommandView[]> {
    const device = await this.devices.findById(deviceId);
    if (!device || device.familyId !== familyId) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }
    const commands = await this.commands.listByDevice(familyId, deviceId);
    const acks = await this.acks.latestByCommandIds(commands.map((c) => c.id));
    return commands.map((c) => {
      const ack = acks.get(c.id);
      return {
        id: c.id,
        command: c.command,
        issuedAt: c.issuedAt,
        status: ack?.status ?? 'pending',
        ackedAt: ack?.ackedAt ?? null,
        ackDetail: ack?.detail ?? null,
      };
    });
  }
}
