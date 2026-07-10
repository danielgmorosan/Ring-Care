import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AppConfig } from '../../config/env.validation';
import type { CheckinLanguage } from '../families/checkin-language';
import { FamiliesService } from '../families/families.service';
import { CertificateAuthorityService } from './certificate-authority.service';
import { CLAIM_CODE_REPOSITORY, type ClaimCodeRepository } from './claim-code.repository';
import { DEVICE_REPOSITORY, type DeviceRepository } from './device.repository';
import { generateClaimCode, generateDeviceToken, hashClaimCode } from './provisioning';

export interface IssuedClaimCode {
  /** The plaintext code, shown to the caregiver once. Never persisted. */
  code: string;
  expiresAt: string;
}

/** What a guardian phone needs to start running after it binds to a family. */
export interface ProvisionResult {
  deviceId: string;
  familyId: string;
  /** The device's check-in secret, returned once. Presented on every heartbeat. */
  deviceToken: string;
  mqttUrl: string | null;
  heartbeatIntervalSeconds: number;
  /**
   * The elder-facing voice check-in language for this household (F1.3). The guardian
   * speaks its "Are you okay?" check-in in this language — a safety setting, not
   * localization. The phone re-reads it whenever it re-provisions.
   */
  checkinLanguage: CheckinLanguage;
  /**
   * The mutual-TLS identity for the MQTT device link (F2.6), when the CA is configured.
   * Returned once, over TLS; the phone stores the key in its hardware-backed keystore.
   * Absent when the CA is not configured — the device then reports over HTTP with its
   * token only, until certs are enabled.
   */
  deviceCert?: string;
  deviceKey?: string;
  caCert?: string;
}

/**
 * Device provisioning (F2.6): the "drawer phone -> guardian" pairing. A caregiver
 * issues a short-lived claim code from the family app; the phone redeems it once to
 * bind to the family and receive its connection config — including its mutual-TLS
 * certificate when the CA is configured.
 */
@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    @Inject(CLAIM_CODE_REPOSITORY) private readonly claimCodes: ClaimCodeRepository,
    private readonly config: AppConfig,
    private readonly ca: CertificateAuthorityService,
    private readonly families: FamiliesService,
  ) {}

  /** Issue a fresh claim code for one of the caller's own guardians. */
  async issueClaimCode(familyId: string, deviceId: string): Promise<IssuedClaimCode> {
    const device = await this.devices.findById(deviceId);
    if (!device || device.familyId !== familyId) {
      throw new NotFoundException(`Device ${deviceId} not found in family ${familyId}`);
    }
    const { code, codeHash } = generateClaimCode();
    const expiresAt = new Date(Date.now() + this.config.claimCodeTtlSeconds * 1000).toISOString();
    await this.claimCodes.create({ deviceId, codeHash, expiresAt });
    return { code, expiresAt };
  }

  /**
   * Redeem a claim code from a phone. Single-use and expiring. Every failure mode
   * returns the same generic error so the endpoint is not a code-guessing oracle.
   */
  async provision(code: string): Promise<ProvisionResult> {
    const record = await this.claimCodes.findByCodeHash(hashClaimCode(code));
    const invalid = new UnauthorizedException('Invalid or expired claim code');
    if (!record || record.consumedAt) throw invalid;
    if (new Date(record.expiresAt).getTime() <= Date.now()) throw invalid;

    const device = await this.devices.findById(record.deviceId);
    if (!device) throw invalid;

    await this.claimCodes.consume(record.id, new Date().toISOString());
    await this.devices.updateStatus(device.id, 'provisioning');

    // Issue the device's check-in secret. Store only the hash; return the plaintext
    // once so the guardian can present it on every heartbeat.
    const { token, tokenHash } = generateDeviceToken();
    await this.devices.setHeartbeatTokenHash(device.id, tokenHash);

    // Issue the device's mutual-TLS identity when the CA is configured. The CN is the
    // device id, so EMQX's per-device ACL scopes it to only its own topics.
    let certMaterial: Pick<ProvisionResult, 'deviceCert' | 'deviceKey' | 'caCert'> = {};
    if (this.config.hasDeviceCa) {
      const issued = this.ca.issue(device.id);
      certMaterial = {
        deviceCert: issued.certPem,
        deviceKey: issued.keyPem,
        caCert: issued.caCertPem,
      };
      // Rule #7: the fingerprint is the auditable identity; the key is never logged.
      this.logger.log(
        `Issued mutual-TLS cert for device ${device.id} ` +
          `(sha256 ${issued.metadata.fingerprintSha256.slice(0, 16)}…)`,
      );
    }

    // The elder-facing check-in language (F1.3): the phone speaks its safety check-in in
    // the household's language, so it must know it from provisioning onward.
    const family = await this.families.findByIdOrFail(device.familyId);

    // Rule #7: provisioning binds a physical device to a family — log it.
    this.logger.log(`Provisioned device ${device.id} for family ${device.familyId}`);

    return {
      deviceId: device.id,
      familyId: device.familyId,
      deviceToken: token,
      // The public broker address for external phones (falls back to the backend's own URL).
      mqttUrl: this.config.deviceMqttUrl ?? null,
      heartbeatIntervalSeconds: Math.max(
        15,
        Math.floor(this.config.deviceOfflineThresholdSeconds / 3),
      ),
      checkinLanguage: family.checkinLanguage,
      ...certMaterial,
    };
  }
}
