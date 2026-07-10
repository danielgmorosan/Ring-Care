/** A device liveness heartbeat. Operational telemetry only — no media, no biometrics. */
export interface Heartbeat {
  deviceId: string;
  /** ISO 8601 device-side time. */
  time: string;
  batteryPct: number | null;
  thermalC: number | null;
  appVersion: string | null;
  /** On-device model versions (name → version), or null if the guardian did not report. */
  models: Record<string, string> | null;
}
