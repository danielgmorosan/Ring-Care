import type { AppConfig } from '../../../config/env.validation';
import type { NarrationPort } from './narration.port';

/**
 * Which narrator backs NARRATION_PORT, following AppConfig.aiProvider:
 * 'bedrock' → Bedrock (EU region, decision 0013), 'anthropic' → Claude API (gated on
 * decision 0002), anything else → the deterministic local mock. With AI_PROVIDER unset
 * aiProvider is 'anthropic' only when ANTHROPIC_API_KEY is set, matching the previous
 * hasNarration behaviour.
 */
export function selectNarrator(
  config: AppConfig,
  narrators: { mock: NarrationPort; claude: NarrationPort; bedrock: NarrationPort },
): NarrationPort {
  switch (config.aiProvider) {
    case 'bedrock':
      return narrators.bedrock;
    case 'anthropic':
      return narrators.claude;
    default:
      return narrators.mock;
  }
}
