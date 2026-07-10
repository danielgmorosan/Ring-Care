import { readFileSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { X509Certificate, createHash, randomBytes } from 'node:crypto';
import forge from 'node-forge';
import { AppConfig } from '../../config/env.validation';

/** How long an issued device certificate is valid (days). Matches the dev PKI. */
const VALIDITY_DAYS = 825;

/**
 * What the device registry stores about a device's identity certificate. The
 * private key never leaves the device after issuance; the cloud keeps only the
 * fingerprint and metadata, so a database compromise cannot impersonate a guardian.
 */
export interface DeviceCertificateMetadata {
  /** CN of the client cert — the device id (per-device mutual-TLS identity). */
  deviceId: string;
  fingerprintSha256: string;
  subject: string;
  validTo: string;
}

/** The material a guardian phone needs to open the mutual-TLS device link. */
export interface IssuedDeviceCertificate {
  /** The device's client certificate (CN = deviceId), signed by the CA. */
  certPem: string;
  /** The device's private key. Transits the provisioning response once, over TLS,
   * then lives only in the phone's hardware-backed keystore. */
  keyPem: string;
  /** The CA certificate, so the device can verify the broker it connects to. */
  caCertPem: string;
  metadata: DeviceCertificateMetadata;
}

/**
 * Certificate authority for the device link (F0.3/F2.6). Issues a per-device mutual-TLS
 * client certificate at provisioning: the CN is the device id, which EMQX turns into the
 * MQTT username so its ACL scopes each guardian to only its own topics (one compromised
 * cert cannot touch another device). The CA private key (from the vault in production)
 * does the signing; only the fingerprint is kept server-side.
 */
@Injectable()
export class CertificateAuthorityService {
  constructor(private readonly config: AppConfig) {}

  /**
   * Sign a fresh client certificate for a device. Requires the CA to be configured
   * (config.hasDeviceCa); the caller decides whether to fall back to token-only.
   */
  issue(deviceId: string): IssuedDeviceCertificate {
    if (!this.config.deviceCaCertPath || !this.config.deviceCaKeyPath) {
      throw new Error('Device CA is not configured (DEVICE_CA_CERT_PATH / DEVICE_CA_KEY_PATH)');
    }
    const caCertPem = readFileSync(this.config.deviceCaCertPath, 'utf8');
    const caKeyPem = readFileSync(this.config.deviceCaKeyPath, 'utf8');
    return signDeviceCertificate(caCertPem, caKeyPem, deviceId);
  }

  /** SHA-256 fingerprint of the certificate's DER encoding. */
  fingerprint(certPem: string): string {
    return fingerprintOf(certPem);
  }

  /** Extract the registry metadata (including the CN → deviceId) from a cert. */
  describe(certPem: string): DeviceCertificateMetadata {
    return describeCertificate(certPem);
  }
}

/**
 * Sign a device client certificate with the CA. Pure (no config or IO), so the exact
 * shape — CN = deviceId, clientAuth, CA-signed — is unit-tested with an in-memory CA.
 */
export function signDeviceCertificate(
  caCertPem: string,
  caKeyPem: string,
  deviceId: string,
): IssuedDeviceCertificate {
  const caCert = forge.pki.certificateFromPem(caCertPem);
  const caKey = forge.pki.privateKeyFromPem(caKeyPem);

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = randomSerial();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + VALIDITY_DAYS * 24 * 60 * 60 * 1000);
  cert.setSubject([
    { name: 'organizationName', value: 'Obrigada' },
    { name: 'commonName', value: deviceId },
  ]);
  cert.setIssuer(caCert.subject.attributes);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    // clientAuth so EMQX accepts it as a client cert (matches the dev PKI).
    { name: 'extKeyUsage', clientAuth: true },
  ]);
  cert.sign(caKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);
  return { certPem, keyPem, caCertPem, metadata: describeCertificate(certPem) };
}

function fingerprintOf(certPem: string): string {
  const cert = new X509Certificate(certPem);
  return createHash('sha256').update(cert.raw).digest('hex');
}

function describeCertificate(certPem: string): DeviceCertificateMetadata {
  const cert = new X509Certificate(certPem);
  const cn = /CN=([^,/\n]+)/.exec(cert.subject)?.[1]?.trim() ?? '';
  return {
    deviceId: cn,
    fingerprintSha256: fingerprintOf(certPem),
    subject: cert.subject,
    validTo: cert.validTo,
  };
}

/** A positive, high-entropy certificate serial as a hex string. */
function randomSerial(): string {
  const hex = randomBytes(16).toString('hex');
  // Force the top nibble below 8 so the DER integer is unambiguously positive.
  return ((parseInt(hex[0]!, 16) & 0x7).toString(16) + hex.slice(1)).toUpperCase();
}
