import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { AppConfig } from '../../config/env.validation';
import type { FamiliesService } from '../families/families.service';
import type { Family } from '../families/family.entity';
import type { CertificateAuthorityService } from './certificate-authority.service';
import type { Device } from './device.entity';
import { InMemoryClaimCodeRepository } from './in-memory-claim-code.repository';
import { InMemoryDeviceRepository } from './in-memory-device.repository';
import { hashDeviceToken } from './provisioning';
import { ProvisioningService } from './provisioning.service';

const FAMILY = '00000000-0000-4000-8000-00000000fa11';
const OTHER_FAMILY = '00000000-0000-4000-8000-00000000fa22';
const DEVICE = '00000000-0000-4000-8000-0000000000d1';

function config(ttlSeconds: number, hasDeviceCa = false): AppConfig {
  return {
    claimCodeTtlSeconds: ttlSeconds,
    mqttUrl: 'mqtts://broker.obrigada.eu:8883',
    deviceOfflineThresholdSeconds: 90,
    hasDeviceCa,
  } as unknown as AppConfig;
}

/** A FamiliesService stub whose household speaks the given check-in language. */
function families(checkinLanguage: Family['checkinLanguage'] = 'pt-PT'): FamiliesService {
  return {
    findByIdOrFail: async (id: string): Promise<Family> => ({
      id,
      name: 'Silva family',
      timezone: 'Europe/Lisbon',
      checkinLanguage,
      createdAt: '2026-07-01T00:00:00.000Z',
    }),
  } as unknown as FamiliesService;
}

/** A CA stub that issues a fixed, obvious certificate bundle. */
function ca(): CertificateAuthorityService {
  return {
    issue: () => ({
      certPem: 'CERT',
      keyPem: 'KEY',
      caCertPem: 'CA',
      metadata: {
        deviceId: DEVICE,
        fingerprintSha256: 'a'.repeat(64),
        subject: `CN=${DEVICE}`,
        validTo: '2030-01-01',
      },
    }),
  } as unknown as CertificateAuthorityService;
}

describe('ProvisioningService', () => {
  let devices: InMemoryDeviceRepository;
  let claimCodes: InMemoryClaimCodeRepository;
  let service: ProvisioningService;

  async function seedDevice(): Promise<void> {
    const device: Device = {
      id: DEVICE,
      familyId: FAMILY,
      name: 'Kitchen shelf',
      status: 'registered',
      registeredAt: '2026-07-01T00:00:00.000Z',
    };
    await devices.create(device);
  }

  beforeEach(async () => {
    devices = new InMemoryDeviceRepository();
    claimCodes = new InMemoryClaimCodeRepository();
    service = new ProvisioningService(devices, claimCodes, config(900), ca(), families());
    await seedDevice();
  });

  it('issues a formatted, future-dated claim code for an owned device', async () => {
    const issued = await service.issueClaimCode(FAMILY, DEVICE);
    expect(issued.code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(new Date(issued.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('will not issue a code for another family’s device', async () => {
    await expect(service.issueClaimCode(OTHER_FAMILY, DEVICE)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('provisions a phone: consumes the code, binds it, returns connection config', async () => {
    const { code } = await service.issueClaimCode(FAMILY, DEVICE);

    const result = await service.provision(code);

    expect(result).toMatchObject({
      deviceId: DEVICE,
      familyId: FAMILY,
      mqttUrl: 'mqtts://broker.obrigada.eu:8883',
      heartbeatIntervalSeconds: 30,
      // The elder-facing check-in language travels with provisioning (F1.3).
      checkinLanguage: 'pt-PT',
    });
    // A check-in secret is issued (returned once); only its hash is stored.
    expect(typeof result.deviceToken).toBe('string');
    expect(result.deviceToken.length).toBeGreaterThan(20);
    expect(await devices.getHeartbeatTokenHash(DEVICE)).toBe(hashDeviceToken(result.deviceToken));
    expect((await devices.findById(DEVICE))?.status).toBe('provisioning');
  });

  it('omits the mutual-TLS material when the CA is not configured', async () => {
    const { code } = await service.issueClaimCode(FAMILY, DEVICE);
    const result = await service.provision(code);
    // Token-only fallback: no cert, no key, no CA cert until the CA is enabled.
    expect(result.deviceCert).toBeUndefined();
    expect(result.deviceKey).toBeUndefined();
    expect(result.caCert).toBeUndefined();
  });

  it('issues the mutual-TLS identity when the CA is configured', async () => {
    const withCa = new ProvisioningService(
      devices,
      claimCodes,
      config(900, true),
      ca(),
      families(),
    );
    const { code } = await withCa.issueClaimCode(FAMILY, DEVICE);

    const result = await withCa.provision(code);

    // The phone gets its client cert, private key (once), and the CA to trust the broker.
    expect(result.deviceCert).toBe('CERT');
    expect(result.deviceKey).toBe('KEY');
    expect(result.caCert).toBe('CA');
  });

  it('is single-use: the same code cannot be redeemed twice', async () => {
    const { code } = await service.issueClaimCode(FAMILY, DEVICE);
    await service.provision(code);
    await expect(service.provision(code)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unknown code without leaking which part was wrong', async () => {
    await expect(service.provision('ZZZZ-ZZZZ')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired code', async () => {
    const expiring = new ProvisioningService(devices, claimCodes, config(-10), ca(), families());
    const { code } = await expiring.issueClaimCode(FAMILY, DEVICE);
    await expect(expiring.provision(code)).rejects.toBeInstanceOf(UnauthorizedException);
    // The device stays registered; a failed redemption changes nothing.
    expect((await devices.findById(DEVICE))?.status).toBe('registered');
  });

  it('accepts the code case-insensitively and ignoring separators', async () => {
    const { code } = await service.issueClaimCode(FAMILY, DEVICE);
    const messy = code.replace('-', '').toLowerCase();
    const result = await service.provision(messy);
    expect(result.deviceId).toBe(DEVICE);
  });
});
