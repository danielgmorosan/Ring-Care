// Phone numbers for the demo contacts. The backend accepts E.164 only
// (/^\+[1-9]\d{6,14}$/, CreateContactDto); we check the same rule up front so a typo
// fails here with a clear message instead of as a 400 halfway through the seed.

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Normalise what people type ("+351 912 345 678", "00351-912-345-678") and validate it.
 * Returns { ok: true, value } or { ok: false, error }.
 */
export function parsePhone(raw, label = 'phone') {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { ok: false, error: `${label} is empty` };
  }
  // "+44 (0)7700 ..." is common in writing; the (0) trunk digit is not dialled from abroad.
  let v = String(raw)
    .trim()
    .replace(/\(0\)/g, '')
    .replace(/[\s().-]/g, '');
  if (v.startsWith('00')) v = `+${v.slice(2)}`;
  if (E164.test(v)) return { ok: true, value: v };
  return {
    ok: false,
    error:
      `${label} "${raw}" is not an international (E.164) number. ` +
      'Start with + and the country code, for example +351912345678.' +
      // PowerShell reads a bare +351... argument as a number and drops the plus.
      (/^\d+$/.test(v) ? ' In PowerShell, quote it: --sofia "+351912345678".' : ''),
  };
}

/**
 * Fictional numbers for runs without Twilio: Ofcom reserves +44 7700 900000-900999 for
 * drama, so nobody can ever be called by mistake. The mock dials no one anyway.
 */
export const FICTIONAL_PHONES = {
  sofia: '+447700900001',
  miguel: '+447700900002',
  rosa: '+447700900003',
};

export function isFictional(phone) {
  return typeof phone === 'string' && phone.startsWith('+447700900');
}
