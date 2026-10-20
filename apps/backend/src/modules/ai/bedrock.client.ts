import type { ConverseCommand, ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';

/**
 * Injection token for the Bedrock Runtime client. Production binds a real
 * BedrockRuntimeClient (credentials from the default AWS provider chain: env vars,
 * shared config, or the instance/task role; never from code). Tests bind a stub with
 * a `send()` method. Null when the provider is not Bedrock.
 */
export const BEDROCK_CLIENT = Symbol('BEDROCK_CLIENT');

/** The one method we use from BedrockRuntimeClient. */
export interface BedrockSender {
  send(
    command: ConverseCommand,
    options?: { abortSignal?: AbortSignal },
  ): Promise<ConverseCommandOutput>;
}

/** Geographic inference-profile prefixes that route outside the EU (rule #6). */
const NON_EU_PROFILE_PREFIXES = ['us', 'us-gov', 'apac', 'global', 'jp', 'au', 'ca', 'sa'];

/**
 * Refuse a Bedrock configuration that would send data outside the EU. The region must
 * be an EU region, and the model id must not be a non-EU (or global) cross-region
 * inference profile. An "eu." profile or a plain in-region model id is accepted.
 * Throws at boot so a misconfiguration is loud rather than a silent residency breach.
 */
export function assertEuBedrockConfig(region: string, modelId: string): void {
  if (!/^eu-[a-z]+-\d+$/.test(region)) {
    throw new Error(
      `BEDROCK_REGION must be an EU region (e.g. eu-central-1); got "${region}" (rule #6, decision 0013)`,
    );
  }
  if (modelId.startsWith('arn:')) {
    const arnRegion = modelId.split(':')[3] ?? '';
    if (!arnRegion.startsWith('eu-')) {
      throw new Error(`BEDROCK_MODEL_ID ARN must be in an EU region; got "${arnRegion}"`);
    }
    return;
  }
  const prefix = modelId.split('.')[0] ?? '';
  if (NON_EU_PROFILE_PREFIXES.includes(prefix)) {
    throw new Error(
      `BEDROCK_MODEL_ID "${modelId}" is a non-EU inference profile; use an "eu." profile id (decision 0013)`,
    );
  }
}
