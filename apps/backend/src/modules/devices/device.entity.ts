/**
 * A device is one guardian phone bound to a family. The record here is the cloud
 * registry entry; per-device TLS certificates and provisioning arrive in F0.3/F2.6.
 * No biometric or media data ever lives on this record (CONTRIBUTING.md rules #1, #4).
 */
export type DeviceStatus = 'registered' | 'provisioning' | 'online' | 'offline';

export interface Device {
  id: string;
  familyId: string;
  /** Human label, e.g. "Kitchen shelf". */
  name: string;
  status: DeviceStatus;
  registeredAt: string;
}
