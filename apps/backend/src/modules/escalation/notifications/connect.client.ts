import type {
  GetContactAttributesCommand,
  GetContactAttributesCommandOutput,
  StartOutboundVoiceContactCommand,
  StartOutboundVoiceContactCommandOutput,
} from '@aws-sdk/client-connect';
import type {
  SendTextMessageCommand,
  SendTextMessageCommandOutput,
} from '@aws-sdk/client-pinpoint-sms-voice-v2';

/**
 * Injection token for the Amazon Connect client (decision 0014). Production binds a real
 * ConnectClient in CONNECT_REGION (credentials from the default AWS provider chain: env
 * vars, shared config, or an instance/task role; never from code). Tests bind a stub with
 * a `send()` method. Null when Connect is not the call provider.
 */
export const CONNECT_CLIENT = Symbol('CONNECT_CLIENT');

/** Injection token for the AWS End User Messaging SMS client, or null when SMS is off. */
export const SMS_VOICE_CLIENT = Symbol('SMS_VOICE_CLIENT');

/** The two Connect operations we use. */
export interface ConnectSender {
  send(command: StartOutboundVoiceContactCommand): Promise<StartOutboundVoiceContactCommandOutput>;
  send(command: GetContactAttributesCommand): Promise<GetContactAttributesCommandOutput>;
}

/** The one End User Messaging SMS operation we use. */
export interface SmsSender {
  send(command: SendTextMessageCommand): Promise<SendTextMessageCommandOutput>;
}

/**
 * Refuse a Connect region outside the EU (rule #6). Throws at boot so a misconfiguration is
 * loud rather than a silent residency breach. Same shape as the Bedrock guard (0013).
 */
export function assertEuConnectRegion(region: string): void {
  if (!/^eu-[a-z]+-\d+$/.test(region)) {
    throw new Error(
      `CONNECT_REGION must be an EU region (e.g. eu-central-1); got "${region}" (rule #6, decision 0014)`,
    );
  }
}

/** The contact attribute the flow sets when the contact presses 1. */
export const CONFIRMED_ATTRIBUTE = 'confirmed';

/** Longest call text we hand to the flow. Connect prompt text tops out near 1,024 chars. */
export const MAX_SPOKEN_CHARS = 900;

/**
 * Make the deterministic call text safe to drop into a Connect prompt, which Amazon Polly
 * reads as plain text or SSML depending on the block. Nothing that could open a tag or an
 * entity survives: `&` becomes "and", angle brackets and quotes go, control characters go,
 * whitespace collapses, and the text is capped. The words themselves are unchanged.
 */
export function speechSafe(text: string): string {
  const cleaned = text
    .replace(/&/g, ' and ')
    // eslint-disable-next-line no-control-regex
    .replace(/[<>"\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length <= MAX_SPOKEN_CHARS
    ? cleaned
    : `${cleaned.slice(0, MAX_SPOKEN_CHARS - 1).trimEnd()}.`;
}

/** An AWS SDK error reduced to what may be logged: its name and HTTP status. */
export function awsErrorSummary(err: unknown): { name: string; status?: number } {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return {
    name: typeof e?.name === 'string' ? e.name : 'Error',
    ...(e?.$metadata?.httpStatusCode ? { status: e.$metadata.httpStatusCode } : {}),
  };
}

export function describeAwsError(err: unknown): string {
  const { name, status } = awsErrorSummary(err);
  return status ? `${name} (${status})` : name;
}
