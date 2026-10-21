// Which provider the backend will use for family calls, from the same env it boots with.
// Mirrors AppConfig.callProvider (apps/backend/src/config/env.validation.ts, decision 0014).
// Pure: the tests feed it env objects.

export const CONNECT_KEYS = [
  'CONNECT_INSTANCE_ID',
  'CONNECT_CONTACT_FLOW_ID',
  'CONNECT_SOURCE_PHONE_NUMBER',
];
const TWILIO_KEYS = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'];
const E164 = /^\+[1-9]\d{1,14}$/;
const EU_REGION = /^eu-[a-z]+-\d+$/;

/**
 * @returns {{
 *   provider: 'connect' | 'twilio' | 'mock',
 *   requested: string | undefined,
 *   region: string,
 *   missing: string[],
 *   problems: string[],
 *   pressOne: boolean,
 *   sms: 'aws' | 'twilio' | 'none' | null,
 * }}
 */
export function callProviderOf(env) {
  const requested = env.CALL_PROVIDER || undefined;
  const region = env.CONNECT_REGION || 'eu-central-1';
  const hasTwilio = TWILIO_KEYS.every((k) => env[k]);
  const missing = requested === 'connect' ? CONNECT_KEYS.filter((k) => !env[k]) : [];
  const problems = [];
  if (requested && requested !== 'connect' && requested !== 'twilio') {
    problems.push(
      `CALL_PROVIDER=${requested} is not valid (connect or twilio): the backend will not boot.`,
    );
  }
  if (requested === 'connect' && !EU_REGION.test(region)) {
    problems.push(`CONNECT_REGION=${region} is not an EU region: the backend refuses to boot.`);
  }
  if (env.CONNECT_SOURCE_PHONE_NUMBER && !E164.test(env.CONNECT_SOURCE_PHONE_NUMBER)) {
    problems.push('CONNECT_SOURCE_PHONE_NUMBER must be E.164 (+49...): the backend will not boot.');
  }
  const provider =
    requested === 'connect' && missing.length === 0 ? 'connect' : hasTwilio ? 'twilio' : 'mock';
  if (requested === 'connect' && provider !== 'connect') {
    problems.push(
      `CALL_PROVIDER=connect but ${missing.join(', ')} unset: calls go through ${provider} instead.`,
    );
  }
  if (requested === 'twilio' && !hasTwilio) {
    problems.push(
      'CALL_PROVIDER=twilio but the TWILIO_* set is incomplete: the mock dials no one.',
    );
  }
  const pressOne =
    provider === 'connect' ? true : provider === 'twilio' ? Boolean(env.PUBLIC_BASE_URL) : false;
  const sms =
    provider !== 'connect'
      ? null
      : env.CONNECT_SMS_ORIGINATION
        ? 'aws'
        : hasTwilio
          ? 'twilio'
          : 'none';
  return { provider, requested, region, missing, problems, pressOne, sms };
}
