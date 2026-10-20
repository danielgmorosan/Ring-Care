/**
 * Small helpers shared by the LLM adapters. No provider SDK imports here, so they are
 * cheap to test and safe to reuse.
 */

/** Hard ceiling for one provider call. Callers fall back to the mock on timeout. */
export const LLM_TIMEOUT_MS = 15_000;

/** Low temperature: we want grounded, repeatable wording, not creativity. */
export const LLM_TEMPERATURE = 0.2;

export const DEFAULT_MAX_TOKENS = 400;

/** Appended to the system prompt when the caller asked for JSON. */
export const JSON_ONLY_INSTRUCTION =
  'Respond with a single JSON object only. No prose before or after it, no markdown, no code fences.';

export function systemFor(system: string, json: boolean | undefined): string {
  return json ? `${system}\n\n${JSON_ONLY_INSTRUCTION}` : system;
}

/**
 * Models sometimes wrap JSON in ```json fences or add a short preamble despite the
 * instruction. Strip fences, then trim to the outermost object if prose surrounds it.
 * Does not parse: the caller owns validation.
 */
export function stripCodeFences(raw: string): string {
  let text = raw.trim();
  const fenced = /^```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)\n?\s*```$/.exec(text);
  if (fenced) text = fenced[1]!.trim();
  if (!text.startsWith('{') && !text.startsWith('[')) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) text = text.slice(start, end + 1);
  }
  return text;
}

/**
 * A provider failure with a message that is safe to log: provider, model, status and
 * error kind. Never prompt or completion text (they can hold personal data).
 */
export class LlmProviderError extends Error {
  constructor(
    readonly provider: 'bedrock' | 'anthropic',
    readonly kind: 'timeout' | 'auth' | 'throttled' | 'bad_request' | 'empty' | 'upstream',
    message: string,
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }
}
