import { X509Certificate } from 'node:crypto';
import forge from 'node-forge';
import { signDeviceCertificate } from './certificate-authority.service';

const DEVICE_ID = '11111111-1111-4111-8111-111111111111';

/** A throwaway in-memory CA (like the dev PKI, without touching the filesystem). */
function makeCa(cn = 'Test Root CA'): { caCertPem: string; caKeyPem: string } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const attrs = [
    { name: 'organizationName', value: 'Obrigada' },
    { name: 'commonName', value: cn },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    caCertPem: forge.pki.certificateToPem(cert),
    caKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

describe('signDeviceCertificate', () => {
  it('issues a client cert with CN = deviceId, signed by the CA, with clientAuth', () => {
    const ca = makeCa();

    const issued = signDeviceCertificate(ca.caCertPem, ca.caKeyPem, DEVICE_ID);

    // The CN is the device id — EMQX turns this into the MQTT username for its ACL.
    expect(issued.metadata.deviceId).toBe(DEVICE_ID);
    // Actually signed by the CA (the whole point — EMQX trusts the CA, not the device).
    const caCert = new X509Certificate(ca.caCertPem);
    const deviceCert = new X509Certificate(issued.certPem);
    expect(deviceCert.verify(caCert.publicKey)).toBe(true);
    // clientAuth extended key usage, so EMQX accepts it as a client certificate.
    const parsed = forge.pki.certificateFromPem(issued.certPem);
    expect(parsed.getExtension('extKeyUsage')).toMatchObject({ clientAuth: true });
    // The private key is returned once (for the phone's keystore); the CA cert is echoed.
    expect(issued.keyPem).toContain('PRIVATE KEY');
    expect(issued.caCertPem).toBe(ca.caCertPem);
    expect(issued.metadata.fingerprintSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a cert from one CA does not verify against a different CA', () => {
    const ca = makeCa('CA One');
    const other = makeCa('CA Two');

    const issued = signDeviceCertificate(ca.caCertPem, ca.caKeyPem, DEVICE_ID);

    const otherCa = new X509Certificate(other.caCertPem);
    expect(new X509Certificate(issued.certPem).verify(otherCa.publicKey)).toBe(false);
  });
});
