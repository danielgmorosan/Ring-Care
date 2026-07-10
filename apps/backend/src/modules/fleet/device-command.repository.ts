import type { DeviceCommandType } from '@obrigada/shared';
import type { DeviceCommand } from './device-command.entity';

/** A command to record. `id`/`createdAt` are assigned by the store. */
export interface NewDeviceCommand {
  deviceId: string;
  familyId: string;
  command: DeviceCommandType;
  issuedByUserId: string;
  issuedAt: string;
}

/**
 * Append-only store of issued device commands (F2.6). The only write is append(); no
 * update or delete (rule #2). The permanent record of decommission actions.
 */
export interface DeviceCommandRepository {
  append(command: NewDeviceCommand): Promise<DeviceCommand>;
  /** A device's command history, newest first. Family-scoped. */
  listByDevice(familyId: string, deviceId: string): Promise<DeviceCommand[]>;
  /** One command by id, or null. Used to check an ack targets a real command. */
  findById(id: string): Promise<DeviceCommand | null>;
}

export const DEVICE_COMMAND_REPOSITORY = Symbol('DEVICE_COMMAND_REPOSITORY');
