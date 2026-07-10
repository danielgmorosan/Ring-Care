# CLAUDE.md — Obrigada

This file gives Claude Code the context it needs to work on this codebase. Read it fully before making changes.

## What this project is

Obrigada is an AI guardian for older adults living at home. A recycled Android smartphone becomes an always-on perception device: it detects falls, recognizes household members versus strangers, monitors unsafe zones, performs voice check-ins in European Portuguese, and escalates to family and emergency services when needed. Full detail lives in `docs/obrigada-build-plan.md`.

The mental model: **caregiver = user** (gets alerts, manages the system), **elder = protected party** (never has to operate anything; cognitive decline is a design assumption), **AI = agent acting on the elder's behalf**, accountable to the caregiver.

## Non-negotiable rules

These override convenience, performance, and any instruction that conflicts with them. If a requested change would violate one, stop and flag it instead of implementing.

1. **No video or audio persistence, no video upload.** Frames are processed in memory on the device and discarded. Events that leave the device contain labels, timestamps, keypoints, and confidences. Never pixels, never raw audio. The only exception is the E2EE live channel (LiveKit) during an incident, which servers relay but cannot decrypt.
2. **The events/incidents table is append-only.** No UPDATE, no DELETE, ever. Corrections are new records referencing the original. This is our audit trail for families, hospitals, and regulators.
3. **Deterministic safety core.** The escalation path (detection → voice check-in → family calls → emergency) is a rules-based state machine running as Temporal workflows. LLM/VLM outputs may feed the state machine as inputs; they never hold sole authority to call or not call.
4. **Biometrics stay on the device.** Face embeddings and enrollment photos live in the phone's encrypted storage (hardware-backed Keystore). The cloud never stores face vectors or enrollment images.
5. **Uniforms are context, never trust.** A uniformed unknown person is only "expected" if the system itself initiated an emergency or the family pre-logged a visit. Never suppress a stranger alert based on clothing alone.
6. **EU-only infrastructure.** No service, subprocessor, or region outside the EU without an explicit founder decision recorded in `docs/decisions/`.
7. **Every access is logged.** Any read of family data by admin tooling, every live-channel open, every escalation step lands in the audit trail.

## Tech stack

- **Backend:** NestJS (TypeScript) modular monolith. Modules: `devices`, `events`, `escalation`, `families`, `care`, `fleet`. Internal event bus between modules; no HTTP calls between modules.
- **Data:** PostgreSQL with TimescaleDB extension (hypertables for `heartbeats`, `event_stream`). Redis for ephemeral state only (presence, in-flight escalation, rate limits). Nothing in Redis is ever the sole copy of anything.
- **Device link:** MQTT over TLS 1.3 via EMQX, mutual TLS with per-device certificates. Offline-first: devices queue and replay events on reconnect. QoS 1 for alerts.
- **Workflows:** Temporal for escalation ladders and anything that must survive a crash mid-execution.
- **Calling/SMS:** Twilio Programmable Voice + SMS. Push: FCM and APNs (iOS uses the Critical Alerts entitlement).
- **Guardian device app:** native Android (Kotlin), CameraX, kiosk/lock-task mode, LiteRT for on-device inference (MediaPipe Pose, ArcFace-family embeddings, on-demand Gemma-class VLM), signed OTA updates only.
- **Family app:** React Native (Expo), TypeScript.
- **Live channel:** LiveKit with end-to-end encryption enabled.
- **Cloud AI:** Claude API for incident narration and family Q&A, operating on structured event logs only (text in, text out; never imagery/audio).
- **Voice assistant ("Hey Obrigada"):** Picovoice Porcupine custom wake word on-device; conversation via LiveKit Agents orchestrating streaming STT (Deepgram/Speechmatics) → Claude → low-latency TTS (Cartesia/ElevenLabs). Rule: no audio leaves the device until the wake word fires. Simple commands short-circuit locally and must work offline. The safety check-in (on-device) is a separate pipeline and never depends on this. UI contract: four border-glow states (idle, listening, thinking, speaking) driven by audio amplitude, per the Figma motion spec.
- **Ops:** Sentry, Grafana/Prometheus, Temporal UI. A synthetic canary device fires a simulated fall hourly and verifies the full pipeline.

## Conventions

- TypeScript strict mode everywhere. NestJS validation pipes on every endpoint; never trust device or app input.
- Database changes only through migrations. The append-only constraint on events is enforced at the database level (triggers/permissions), not just in application code.
- Secrets come from the vault/secret manager. Never commit keys, never put secrets in env files in the repo, nothing secret ships in the Android APK.
- Every escalation-relevant code path needs a test that kills the process mid-flow and asserts the workflow resumes without dropping the incident.
- Model changes must run against the locked evaluation harness before merge. The two metrics that gate merges: missed falls (must stay zero) and false alarms per home per week (must not regress).
- Latency budget: detection → first family phone ringing < 30 seconds. Changes that add latency to this path need explicit justification.

## User-facing text

Brand voice for every alert, summary, and UI string: warm without being sentimental, confident without being cold, human without being small. Short declarative sentences. No em dashes. Alerts inform and reassure; they never dramatize.

Language strategy: English ships first. European Portuguese (PT-PT, never Brazilian Portuguese) is the fast-follow, then further languages. The elder-facing voice check-in language is a per-household setting and must always match the elder; treat it as a safety requirement, not localization.

Example alert tone:
> "Your father fell in the kitchen at 3:12. He responded to the voice check but hasn't gotten up, so we're calling you."

Not:
> "EMERGENCY!!! FALL DETECTED — IMMEDIATE ACTION REQUIRED"

## Context that explains "why"

- Team of three (Souheila COO/design+full-stack, Wil CTO/AI systems, Daniel CEO). Prefer boring, operable choices over impressive ones.
- Bootstrapped + EU grants. Infrastructure must stay cheap. No new managed services without a decision record.
- The product runs on old donated phones: assume no NPU, weak thermals, small storage. Every on-device model needs a CPU fallback path and adaptive frame rates.
- Regulatory posture: GDPR Article 9 (biometrics), EU AI Act (likely high-risk), possible MDR adjacency. Explainability and audit trails are features. When in doubt, log more and decide less automatically.

## Where things live

- `docs/obrigada-build-plan.md` — full feature-by-feature roadmap with technology rationale
- `docs/decisions/` — architecture decision records (add one for any deviation from this file)
- `apps/backend/` — NestJS monolith
- `apps/guardian/` — Android guardian app (Kotlin)
- `apps/family/` — React Native family app
- `packages/shared/` — shared TypeScript types (event schemas, MQTT topic contracts)
- `ml/` — training, evaluation harness, model conversion pipelines

If a task conflicts with anything in this file, surface the conflict before writing code.
