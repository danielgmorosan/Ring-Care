import { z } from 'zod';

/**
 * Heartbeat message a guardian device publishes to its heartbeat topic.
 * deviceId is NOT carried in the body — it is taken from the topic (and the
 * device's certificate CN), which is authoritative. Operational telemetry only.
 */
export const heartbeatMessageSchema = z.object({
  /** ISO 8601 device-side time. */
  time: z.string().datetime(),
  batteryPct: z.number().min(0).max(100).optional(),
  thermalC: z.number().optional(),
  appVersion: z.string().optional(),
  /**
   * On-device model versions, e.g. { pose: "movenet-1.2", face: "arcface-0.9",
   * vlm: "gemma-2b-q4" }. Lets the fleet view show which model each guardian runs —
   * the OTA and evaluation story. Labels only, never a model file.
   */
  models: z.record(z.string().max(40), z.string().max(60)).optional(),
});

export type HeartbeatMessage = z.infer<typeof heartbeatMessageSchema>;
