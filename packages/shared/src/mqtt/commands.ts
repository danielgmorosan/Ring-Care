import { z } from 'zod';

/**
 * Backend → device commands (F2.6), published on the per-device command topic
 * (`mqttTopics.commands(deviceId)`). The topic is per-device and ACL-scoped, so a
 * command only ever reaches its target guardian.
 *
 * `wipe` is a factory-reset / decommission: the device clears its encrypted storage,
 * including the face embeddings that never left it (rule #4). More command kinds (OTA
 * trigger, config) join this enum as they land.
 */
export const deviceCommandTypeSchema = z.enum(['wipe']);

export type DeviceCommandType = z.infer<typeof deviceCommandTypeSchema>;

/** The message body a command carries. `commandId` lets the device ack and de-duplicate. */
export const deviceCommandMessageSchema = z.object({
  commandId: z.string().uuid(),
  command: deviceCommandTypeSchema,
  issuedAt: z.string().datetime(),
});

export type DeviceCommandMessage = z.infer<typeof deviceCommandMessageSchema>;
