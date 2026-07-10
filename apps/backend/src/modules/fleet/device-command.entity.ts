import type { DeviceCommandType } from '@obrigada/shared';

/**
 * A backend → device command a caregiver issued (F2.6), e.g. a remote wipe. Append-only:
 * a wipe is irreversible, so who wiped which guardian and when is a permanent record
 * (rule #7). The audit interceptor only knows the route pattern, not the target device,
 * so this is where the target and the actor are captured.
 */
export interface DeviceCommand {
  id: string;
  deviceId: string;
  familyId: string;
  command: DeviceCommandType;
  /** The caregiver who issued it. */
  issuedByUserId: string;
  issuedAt: string;
  createdAt: string;
}
