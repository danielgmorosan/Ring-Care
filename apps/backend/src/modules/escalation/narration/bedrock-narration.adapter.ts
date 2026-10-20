import { Injectable } from '@nestjs/common';
import { BedrockLlmAdapter } from '../../ai/bedrock-llm.adapter';
import type {
  DailySummaryRequest,
  Narration,
  NarrationPort,
  NarrationRequest,
  QuestionRequest,
} from './narration.port';
import { DAILY_SYSTEM_PROMPT, INCIDENT_SYSTEM_PROMPT, QA_SYSTEM_PROMPT } from './narration.prompts';

/** Same budget as the Claude narration adapter: a few short sentences. */
const NARRATION_MAX_TOKENS = 300;

/**
 * Narration through Amazon Bedrock in an EU region (decision 0013). Same system
 * prompts and the same minimized request shapes as the Claude adapter: roles, labels,
 * timestamps and outcomes as JSON text. Never names, pixels or audio. The text is
 * descriptive only; it never influences the escalation ladder (rule #3). Errors
 * propagate so NarrationService falls back to the local mock.
 */
@Injectable()
export class BedrockNarrationAdapter implements NarrationPort {
  constructor(private readonly llm: BedrockLlmAdapter) {}

  narrate(request: NarrationRequest): Promise<Narration> {
    return this.run(INCIDENT_SYSTEM_PROMPT, request);
  }

  summarizeDay(request: DailySummaryRequest): Promise<Narration> {
    return this.run(DAILY_SYSTEM_PROMPT, request);
  }

  answer(request: QuestionRequest): Promise<Narration> {
    return this.run(QA_SYSTEM_PROMPT, request);
  }

  private async run(system: string, payload: unknown): Promise<Narration> {
    const { text, model } = await this.llm.complete({
      system,
      user: JSON.stringify(payload),
      maxTokens: NARRATION_MAX_TOKENS,
    });
    return { text, generatedBy: 'bedrock', model };
  }
}
