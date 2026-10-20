import { Module } from '@nestjs/common';

/**
 * AI provider wiring (decision 0013). Provides LLM_PORT: Bedrock in an EU region when
 * configured, otherwise a deterministic mock. Filled in by the Bedrock workstream.
 */
@Module({
  providers: [],
  exports: [],
})
export class AiModule {}
