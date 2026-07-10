import type { DeviceCommandAck, DeviceCommandAckStatus } from './device-command-ack.entity';

/** An ack to record. `id`/`createdAt` are assigned by the store. */
export interface NewDeviceCommandAck {
  commandId: string;
  deviceId: string;
  status: DeviceCommandAckStatus;
  detail: string | null;
  ackedAt: string;
}

/**
 * Append-only store of command acknowledgements (F2.6). The only write is append();
 * no update or delete (rule #2). Idempotent on commandId so a re-sent ack records once.
 */
export interface DeviceCommandAckRepository {
  append(ack: NewDeviceCommandAck): Promise<void>;
  /** The latest ack per command id, for enriching the command history. */
  latestByCommandIds(commandIds: string[]): Promise<Map<string, DeviceCommandAck>>;
}

export const DEVICE_COMMAND_ACK_REPOSITORY = Symbol('DEVICE_COMMAND_ACK_REPOSITORY');
