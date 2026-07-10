/**
 * A guardian's acknowledgement that it carried out a command (F2.6). Closes the loop
 * behind remote wipe: the family issued a command, the device did it (or could not),
 * and this is the durable proof of which. Append-only, like the command it answers.
 */
export interface DeviceCommandAck {
  id: string;
  commandId: string;
  deviceId: string;
  status: DeviceCommandAckStatus;
  /** A short, non-identifying note from the device (e.g. an error reason). */
  detail: string | null;
  ackedAt: string;
  createdAt: string;
}

/** The device did it, or tried and failed. */
export type DeviceCommandAckStatus = 'executed' | 'failed';
