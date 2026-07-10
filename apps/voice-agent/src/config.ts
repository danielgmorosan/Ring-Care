import type { VoiceLanguage } from './prompt.js';

/** Runtime configuration for the voice agent, read from the environment. */
export interface VoiceConfig {
  /** Claude model for the brain. Defaults to Haiku for cost (occasional, short turns). */
  claudeModel: string;
  /** Cartesia voice id and model for speech. */
  cartesiaVoiceId: string;
  cartesiaModel: string;
  /** Deepgram model for speech-to-text. */
  deepgramModel: string;
  /** Default household language when a room does not pin one. */
  language: VoiceLanguage;
}

/**
 * True only when every credential the agent needs is present: LiveKit (transport) plus
 * Deepgram (STT), Anthropic (Claude), and Cartesia (TTS + a chosen voice). When false the
 * worker should not start — the assistant is simply off, and the on-device safety check-in
 * (a separate pipeline) is unaffected. Each provider is an EU-region subprocessor decision
 * (rule #6).
 */
export function hasVoiceConfig(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.LIVEKIT_URL &&
    env.LIVEKIT_API_KEY &&
    env.LIVEKIT_API_SECRET &&
    env.DEEPGRAM_API_KEY &&
    env.ANTHROPIC_API_KEY &&
    env.CARTESIA_API_KEY &&
    env.CARTESIA_VOICE_ID,
  );
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): VoiceConfig {
  return {
    claudeModel: env.VOICE_CLAUDE_MODEL ?? 'claude-haiku-4-5-20251001',
    cartesiaVoiceId: env.CARTESIA_VOICE_ID ?? '',
    cartesiaModel: env.CARTESIA_MODEL ?? 'sonic-3',
    deepgramModel: env.DEEPGRAM_MODEL ?? 'nova-3',
    language: parseLanguage(env.VOICE_LANGUAGE),
  };
}

/** Only en and pt-PT are supported today; anything else falls back to English. */
export function parseLanguage(value: string | undefined): VoiceLanguage {
  return value === 'pt-PT' ? 'pt-PT' : 'en';
}

/** Provider language codes (Deepgram/Cartesia take a short code, not the household tag). */
export function providerLanguage(language: VoiceLanguage): string {
  return language === 'pt-PT' ? 'pt' : 'en';
}
