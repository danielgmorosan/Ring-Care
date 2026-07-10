import { Device, DeviceStatus } from './device.entity';

/**
 * Repository port for devices. The service depends on this, not on a database.
 * F0.2 provides the Postgres/TimescaleDB adapter.
 */
export interface DeviceRepository {
  create(device: Device): Promise<Device>;
  findById(id: string): Promise<Device | null>;
  findByFamily(familyId: string): Promise<Device[]>;
  findAll(): Promise<Device[]>;
  /** Transition a device's lifecycle status. Returns the updated device, or null. */
  updateStatus(id: string, status: DeviceStatus): Promise<Device | null>;
  /** Store the hash of the device's check-in token (set at provisioning). */
  setHeartbeatTokenHash(id: string, tokenHash: string): Promise<void>;
  /** The stored check-in token hash for a device, or null if none/unknown device. */
  getHeartbeatTokenHash(id: string): Promise<string | null>;
  /**
   * Redact device names for a family (GDPR Art. 17). The rows stay — the append-only
   * event/incident trail references them — but any caregiver-chosen name (which may
   * describe a room or person) is cleared. See docs/decisions/0005.
   */
  redactNamesByFamily(familyId: string): Promise<void>;
}

/** DI token for the DeviceRepository port. */
export const DEVICE_REPOSITORY = Symbol('DEVICE_REPOSITORY');
