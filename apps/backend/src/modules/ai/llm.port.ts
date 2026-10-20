/**
 * A minimal text-in, text-out LLM port shared by care extraction (Bee) and any future
 * caller. Narration keeps its own NarrationPort; the Bedrock narration adapter may use
 * this port underneath.
 *
 * Privacy contract (rules #1 and #6): callers send structured or caregiver-authored text
 * only. Never pixels, never audio, never face data. The provider is chosen by
 * AppConfig.aiProvider: 'bedrock' (EU region, decision 0013), 'anthropic', or 'mock'.
 */
export const LLM_PORT = Symbol('LLM_PORT');

export interface LlmRequest {
  system: string;
  /** The user turn. Already minimized by the caller. */
  user: string;
  maxTokens?: number;
  /** When true the caller expects a single JSON object back and will parse it. */
  json?: boolean;
}

export interface LlmResponse {
  text: string;
  provider: 'bedrock' | 'anthropic' | 'mock';
  /** Model id that produced the text; 'mock' for the local mock. */
  model: string;
}

export interface LlmPort {
  complete(request: LlmRequest): Promise<LlmResponse>;
}
