import { fileURLToPath } from 'node:url';
import { cli, defineAgent, voice, WorkerOptions, type JobContext } from '@livekit/agents';
import * as anthropic from '@livekit/agents-plugin-anthropic';
import * as cartesia from '@livekit/agents-plugin-cartesia';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as silero from '@livekit/agents-plugin-silero';
import { loadConfig, parseLanguage, providerLanguage } from './config.js';
import { systemPrompt, type VoiceLanguage } from './prompt.js';

/**
 * The "Hey Obrigada" voice assistant worker (F3.6): a LiveKit Agents pipeline that hears the
 * elder (Deepgram), thinks with Claude, and speaks back (Cartesia). It runs only after the
 * on-device wake word has fired and the guardian has connected the audio into a room — no
 * audio reaches here before "Hey Obrigada". This is NOT the safety check-in: that is a
 * separate, on-device, offline pipeline, and this assistant has no authority over escalation.
 *
 * Off unless configured (see config.ts). Provider keys and LiveKit URL come from the
 * environment; each provider is an EU-region subprocessor decision (rule #6).
 */
export default defineAgent({
  entry: async (ctx: JobContext) => {
    const config = loadConfig();
    const language = languageForRoom(ctx, config.language);
    const providerLang = providerLanguage(language);

    await ctx.connect();

    const session = new voice.AgentSession({
      vad: await silero.VAD.load(),
      stt: new deepgram.STT({ model: config.deepgramModel, language: providerLang }),
      llm: new anthropic.LLM({ model: config.claudeModel }),
      tts: new cartesia.TTS({
        model: config.cartesiaModel,
        voice: config.cartesiaVoiceId,
        language: providerLang,
      }),
    });

    await session.start({
      agent: new voice.Agent({ instructions: systemPrompt(language) }),
      room: ctx.room,
    });
  },
});

/** The elder-facing language is a per-household safety setting. A room can pin it in its
 * metadata (`{"language":"pt-PT"}`); otherwise fall back to the worker default. */
function languageForRoom(ctx: JobContext, fallback: VoiceLanguage): VoiceLanguage {
  try {
    const metadata = ctx.room.metadata;
    if (metadata) {
      const parsed = JSON.parse(metadata) as { language?: string };
      if (parsed.language) return parseLanguage(parsed.language);
    }
  } catch {
    // Malformed metadata: fall back to the default rather than fail to start.
  }
  return fallback;
}

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
