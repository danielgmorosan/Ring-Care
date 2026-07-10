import {
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * A guardian's liveness check-in over HTTP. The production guardian beats over MQTT
 * with mutual TLS; this simple HTTP path exists for lightweight guardians and
 * onboarding. Operational telemetry only — no media, no biometrics (rule #1).
 */
export class HeartbeatDto {
  @IsUUID()
  deviceId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  batteryPct?: number;

  @IsOptional()
  @IsNumber()
  thermalC?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;

  /** On-device model versions (name → version). Values are opaque labels. */
  @IsOptional()
  @IsObject()
  models?: Record<string, string>;
}
