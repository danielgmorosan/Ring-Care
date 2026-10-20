import { signRingBody, verifyRingSignature } from './ring-signature';

const SECRET = 'test-ring-hmac-secret';
const body = Buffer.from('{"event_type":"motion_detected","device_id":"d1"}');

describe('Ring webhook signature', () => {
  it('accepts a body signed exactly like Ring (sha256=<hex HMAC>)', () => {
    expect(verifyRingSignature(body, signRingBody(body, SECRET), SECRET)).toBe(true);
  });

  it('accepts upper-case hex and surrounding whitespace', () => {
    const sig = signRingBody(body, SECRET).replace(/[a-f]/g, (c) => c.toUpperCase());
    expect(verifyRingSignature(body, `  sha256=${sig.slice(7)} `, SECRET)).toBe(true);
  });

  it('rejects a signature made with another secret', () => {
    expect(verifyRingSignature(body, signRingBody(body, 'other-secret'), SECRET)).toBe(false);
  });

  it('rejects a body changed by a single byte', () => {
    const sig = signRingBody(body, SECRET);
    const tampered = Buffer.from(body.toString().replace('d1', 'd2'));
    expect(verifyRingSignature(tampered, sig, SECRET)).toBe(false);
  });

  it('rejects a missing, empty or malformed header', () => {
    const hex = signRingBody(body, SECRET).slice(7);
    expect(verifyRingSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyRingSignature(body, '', SECRET)).toBe(false);
    expect(verifyRingSignature(body, hex, SECRET)).toBe(false); // no sha256= prefix
    expect(verifyRingSignature(body, `sha1=${hex}`, SECRET)).toBe(false);
    expect(verifyRingSignature(body, `sha256=${hex.slice(2)}`, SECRET)).toBe(false); // short
    expect(verifyRingSignature(body, `sha256=${'z'.repeat(64)}`, SECRET)).toBe(false);
  });
});
