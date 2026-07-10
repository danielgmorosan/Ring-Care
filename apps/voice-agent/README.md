# @obrigada/voice-agent — "Hey Obrigada" (F3.6)

The conversational voice assistant an elder can talk to. A [LiveKit Agents](https://docs.livekit.io/agents/)
worker that hears them (Deepgram), thinks with Claude, and speaks back (Cartesia), with
`livekit-wakeword` doing the on-device "Hey Obrigada" trigger.

This is **not** the safety check-in. The check-in ("Are you okay?" after a fall) is a
separate, on-device, **offline** pipeline and never depends on this worker or the network.
This assistant has **no authority over escalation** — the deterministic safety core decides
about falls and emergencies. The system prompt (`src/prompt.ts`) makes that boundary explicit
so the agent never talks someone out of getting help.

## How it fits together

```
elder speaks ──► "Hey Obrigada" wake word (on-device, no audio leaves before this)
             ──► guardian connects the audio into a LiveKit room
             ──► THIS worker: Deepgram STT ─► Claude ─► Cartesia TTS ─► speaks back
```

## Configuration

Off unless every credential is present (`hasVoiceConfig`). All from the environment; nothing
in the repo. Each provider is an **EU-region subprocessor** decision (rule #6) — pin EU
regions and record them before real families.

| Variable | What |
|---|---|
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | the LiveKit project (same one as live view) |
| `DEEPGRAM_API_KEY` | speech-to-text |
| `ANTHROPIC_API_KEY` | Claude (the brain) |
| `CARTESIA_API_KEY`, `CARTESIA_VOICE_ID` | text-to-speech + the chosen voice |
| `VOICE_CLAUDE_MODEL` | optional, defaults to Haiku (cheap, short turns) |
| `VOICE_LANGUAGE` | optional default household language (`en` or `pt-PT`); a room can pin its own in metadata |

The elder-facing language is a **per-household safety setting** — a room pins it via metadata
(`{"language":"pt-PT"}`); otherwise the worker default applies. European Portuguese only,
never Brazilian.

## Run

```bash
pnpm --filter @obrigada/voice-agent build
pnpm --filter @obrigada/voice-agent start   # connects workers to LiveKit and waits for jobs
# or: … dev   for local iteration
```

## Cost

Self-host LiveKit and the only spend is per-conversation inference (Deepgram + Haiku +
Cartesia), which is small for occasional use. Simple commands short-circuit on-device and
cost nothing. See `docs/decisions/0010-live-view-camera.md` (shared LiveKit infra) and the
voice notes.

## Status

- ✅ Worker pipeline + system prompt, config-gated, typechecked, prompt invariants tested.
- ⏳ Needs the provider keys above to run, and the on-device **`livekit-wakeword`** trigger +
  guardian audio capture (Kotlin, ONNX) — those are the remaining legs.
