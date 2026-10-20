import { Injectable } from '@nestjs/common';
import type { LlmPort, LlmRequest, LlmResponse } from './llm.port';

export const MOCK_LLM_JSON = '{"mock":true}';
export const MOCK_LLM_TEXT = 'This is a local placeholder. No AI provider is configured.';

/** Deterministic, offline. The default: nothing leaves the backend. */
@Injectable()
export class MockLlmAdapter implements LlmPort {
  async complete(request: LlmRequest): Promise<LlmResponse> {
    return { text: request.json ? MOCK_LLM_JSON : MOCK_LLM_TEXT, provider: 'mock', model: 'mock' };
  }
}
