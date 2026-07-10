# Obrigada — Technical Build Plan
**Feature-by-feature roadmap with technology decisions and rationale**
Version 1.0 · July 2026 · Internal (Souheila, Wil, Daniel)

---

## Project context — read this first

### What Obrigada is

Obrigada is an AI guardian for older adults living at home. It turns a recycled smartphone into an always-on perception and intervention platform: it detects falls, recognizes who belongs in the household and who doesn't, watches over unsafe zones, speaks to the elder to check on them, and pulls family in only when it matters. When intervention is needed, it calls family members in order, escalates to emergency services if no one answers, and logs everything with an auditable trail.

### Why we are building it

Obrigada began with a real story: an elderly neighbour with Alzheimer's, and the daughter who carried the full weight of caring for her. Somewhere tonight, an older person is on the floor of their home and no one knows. Family health apps tell you what already happened. Obrigada is the one already responding.

Europe is aging faster than its care systems can grow. Families are spread across cities and countries. Professional care is scarce and expensive. And 700 million unused smartphones sit in European drawers, each one capable of becoming a guardian. We give those phones a second life protecting the people who need it most.

### The mental model (this shapes every product and technical decision)

- **Caregiver = user.** They get alerts, talk to the AI, and manage the system.
- **Elder = protected party.** Watched over, defended, helped. They never have to operate anything. Cognitive decline, Alzheimer's, and late-stage frailty are design assumptions, not edge cases.
- **AI = agent acting on the elder's behalf,** accountable to the caregiver.

Think of it like an ICU: continuous monitoring and autonomous response, but the family doesn't operate the equipment. They get told when something needs them.

### The three pillars of coverage

1. **What happens TO the elder** → fall detection, health events, voice check-ins
2. **What happens AROUND the elder** → known-person recognition, stranger detection, uniform-aware context
3. **Where the elder goes** → red zones, wandering detection

Total physical-safety coverage for someone who cannot fully take care of themselves. No competitor packages it this way.

### What makes us different

- **Fully on-device perception.** Video is processed in memory on the phone and discarded. No video is ever streamed or stored in a cloud. We cannot leak what we never have.
- **Runs on recycled phones the family already owns.** Aligned with the EU Circular Economy Action Plan; hardware cost near zero.
- **Built for Europe.** EU-only hosting, GDPR and EU AI Act alignment by architecture, not by patch. Language strategy: English ships first; European Portuguese follows fast (before pilot expansion), then further languages. The elder-facing voice language is a per-household setting and must always match the elder. Competitors (Luffu, SafelyYou, Vayyar Care, CarePredict) are cloud-first, English-only, and hardware-priced.
- **Extends into the hospital.** Auditable event history and discharge continuity, not just a home gadget.

### Business context the code should respect

- **Team of three:** Souheila (COO, AI product designer and full-stack developer), Wil (CTO, senior AI systems engineer), Daniel (CEO, European business leader). Every technical decision must be operable by a team this size.
- **Bootstrapped + non-dilutive grants.** No burn-heavy infrastructure. Boring, cheap, reliable wins.
- **Pricing:** €39/month or €390/year per family, everything included, no feature tiers. Institutional: €19–39 per resident/month for care homes, €1,999 per hospital ward/month.
- **GTM:** Lisbon → Portugal → Iberia and EU. Pilot families first, institutions second.
- **Traction:** active pilot with the first design-partner family.

### Product principles (non-negotiable, in priority order)

1. **Never miss a real fall.** Missed falls are the one unforgivable failure.
2. **False alarms destroy trust.** Every layer that reduces them (voice check-in, VLM second opinion, quiet-hours contracts) is a core feature, not polish.
3. **Deterministic safety core, AI advisors around it.** Nothing probabilistic holds sole authority on the path that summons help.
4. **Privacy by architecture.** The most sensitive data never leaves the device. Ever.
5. **Reliability is the product.** A guardian that dies silently at 3am is worse than no guardian.
6. **The elder's dignity leads.** They are the protected party, never a surveillance subject. Consent is designed for them, not around them.

### Brand voice (applies to every user-facing string, alert, and summary)

Warm without being sentimental. Confident without being cold. Human without being small. Rooted in love and care for the people it serves. Short declarative sentences. No em dashes. Alerts inform and reassure; they never dramatize.

---

## How to read this document

Features are listed in build order. Each one includes what it does, the chosen technology, why that technology over the alternatives, its dependencies, and a "done" definition so we know when to move on. The order follows one rule: complete the safety loop first (fall → alert → response), then widen coverage, then add intelligence.

Guiding principles for every decision:

1. **Deterministic safety core, AI advisors around it.** Nothing probabilistic sits alone on the path that summons help.
2. **The most sensitive data never leaves the device.** Video is processed in memory and discarded. Only derived events travel.
3. **Reliability is a feature.** A guardian that dies silently at 3am is worse than no guardian.
4. **Boring where it must not fail, modern where it gives us speed.**

---

## Phase 0 — Foundations (Weeks 1–3)

### F0.1 Backend core skeleton

**What it does:** The single deployable service that everything talks to. Device registry, family accounts, event ingestion, API for the family app.

**Technology: NestJS (TypeScript) modular monolith**
- Why NestJS: enforced modular structure (devices, events, escalation, families, care as isolated modules) maps exactly to our architecture. First-class WebSockets, validation pipes, and dependency injection. TypeScript across backend, family app, and Souheila's other tooling means one language for the whole team surface.
- Why a monolith and not microservices: three people cannot operate a distributed system. One service to deploy, debug, harden, and monitor. Internal event bus gives us event-driven behavior without distributed-system failure modes. Modules can be split out later if scale ever demands it.
- Rejected alternatives: Go (better raw concurrency, but slower team velocity and no ecosystem overlap with the family app); FastAPI (strong, but splits the team across Python and TypeScript for no gain since ML runs on-device, not in the backend).

**Dependencies:** none. This starts on day one.
**Done when:** service deploys via CI, health endpoint live, device registration and family account modules pass tests.

### F0.2 Data layer

**What it does:** Single source of truth for families, elders, devices, enrolled people, escalation chains, plus the high-volume event and heartbeat stream.

**Technology: PostgreSQL + TimescaleDB extension + Redis**
- Why Postgres: the most trusted relational database in the world; managed offerings handle backups, encryption at rest, and failover for us.
- Why TimescaleDB rather than a separate time-series database: it is a Postgres extension, so heartbeats and event streams get time-series performance (fast ingestion, automatic partitioning, retention policies) while we still operate exactly one database.
- Why Redis: ephemeral state only — live device presence, in-flight escalation state, rate limiting. Nothing in Redis is ever the only copy of anything.
- Non-negotiable design rule: the incidents/events table is **append-only**. No updates, no deletes. This is our audit trail for families, hospitals, certification, and the EU AI Act.

**Dependencies:** F0.1.
**Done when:** schema migrated, append-only enforcement tested, retention policy on heartbeats configured.

### F0.3 Device link (guardian phone ↔ backend)

**What it does:** The permanent connection between every guardian phone and the cloud. Heartbeats up, commands down, events guaranteed delivered.

**Technology: MQTT over TLS 1.3 with per-device certificates, EMQX broker**
- Why MQTT: built precisely for unreliable home Wi-Fi. Automatic reconnection, QoS 1 delivery guarantees (an alert is delivered at least once, even across a router blip), tiny bandwidth footprint on old hardware. It remains the dominant protocol for exactly this class of device fleet.
- Why per-device certificates (mutual TLS): each phone is provisioned with a unique identity. One compromised device can never impersonate or endanger another. This is our blast-radius containment at the fleet level.
- Why EMQX: production-grade open source broker, clusters when we need it, straightforward to run in a container next to the monolith.
- Design rule: **offline-first protocol.** The phone queues events locally and replays on reconnect. Missed heartbeats (N in a row) trigger a "guardian offline" alert to the family — reliability itself becomes a visible feature.

**Dependencies:** F0.1, F0.2.
**Done when:** a test device survives simulated network loss with zero event loss; offline alert fires correctly.

### F0.4 Security and operations baseline (cross-cutting, done in week 1, never "later")

**What it does:** Makes us a hard target from the first commit.

**Technology and practices:**
- Passkeys/hardware keys on all founder accounts (GitHub, cloud, Twilio, email). No shared logins.
- Secret scanning + dependency scanning in CI: GitHub Advanced Security or Semgrep + Dependabot/Renovate. Why: leaked keys and unpatched libraries are how startups actually get breached.
- Secrets in a vault (cloud provider secret manager), never in code or env files in the repo.
- Infrastructure as code (Terraform or Pulumi) so configuration is reviewed like code.
- Admin surfaces behind Tailscale (zero-trust access); only the API and MQTT broker face the internet.
- Observability: Sentry (errors) + Grafana/Prometheus (metrics) + one daily dashboard: devices online, heartbeat gaps, pipeline latency, false-alarm rate.
- EU-only hosting. Primary recommendation: AWS eu-west or Scaleway/OVHcloud if we want "European infrastructure" as a literal pitch claim. Deploy via Docker on Fly.io/Railway initially; managed Kubernetes only when justified.
- Incident-response one-pager written and rehearsed once (tabletop): who revokes keys, who notifies families, who files the 72-hour GDPR notification.
- DPIA (Data Protection Impact Assessment) drafted now. Mandatory for biometric processing, and every institutional customer will ask for it.

**Done when:** all founder accounts on passkeys, CI scanning live, dashboard exists, DPIA draft complete, tabletop exercise held.

---

## Phase 1 — The safety loop (Weeks 3–9)

### F1.1 Guardian device app (kiosk foundation)

**What it does:** The Android app that turns a donated phone into a guardian: locked-down kiosk, camera pipeline, watchdog, OTA updates.

**Technology: native Android (Kotlin), kiosk/lock-task mode, CameraX**
- Why native Kotlin and not cross-platform: we need low-level control of camera pipelines, neural runtime delegates, audio streams, thermal behavior, and boot persistence. Cross-platform frameworks fight us on every one of those.
- Why CameraX: modern camera API with consistent behavior across the messy landscape of old donated devices — which is our hardware reality.
- Reliability engineering as a first-class feature: watchdog service that auto-restarts the pipeline, boot-on-power, thermal throttling that lowers frame rate instead of dying, adaptive 2–5 fps analysis (falls do not need 30 fps).
- Security on device: full-disk encryption verified at provisioning, keys in hardware-backed Android Keystore, sideloading disabled, remote wipe command over MQTT, **signed OTA updates only** (Cyber Resilience Act requirement and our biggest attack surface).

**Dependencies:** F0.3.
**Done when:** app survives 7 days unattended on 3 different old device models, including forced crashes, reboots, and network loss, with zero manual intervention.

### F1.2 Fall detection pipeline

**What it does:** The core perception feature. Detects falls in real time, on device, with explainable logic.

**Technology: MediaPipe Pose / MoveNet on LiteRT (GPU/NNAPI delegates, CPU fallback) + small temporal model (GRU or TCN) + explicit rule layer**
- Why pose estimation rather than frame classification: keypoints are lighter, explainable, angle-tolerant, and privacy-preserving by construction (we reason about skeletons, not pixels).
- Why MediaPipe/MoveNet first: widest compatibility across old heterogeneous hardware, which is the recycled-phone constraint. RTMPose-class models are the accuracy-per-FLOP benchmark leaders and get evaluated in Phase 2 on newer devices.
- Why LiteRT: Google's on-device runtime (the renamed TensorFlow Lite) with hardware delegates and graceful CPU fallback — mandatory since many donated phones have no NPU.
- Why hybrid temporal model + rules: the learned model catches patterns, the rule layer (rapid vertical drop, torso horizontal, **no recovery motion within the window**) gives explainability that hospitals and regulators require. Someone tying a shoe recovers; someone who fell does not.
- Data strategy for best results from day one:
  1. Bootstrap on public datasets (UP-Fall, URFD, Le2i, CAUCA) **plus** self-filmed staged falls in real Lisbon apartments at the true phone-on-a-shelf camera angle. Angle mismatch is the top reason lab models fail in homes.
  2. **Evaluation harness before tuning:** a locked clip library (real falls, near-falls, fast sit-downs, pets, grandkids, lighting shifts) every model version must run against. Two metrics forever: missed falls, false alarms per home per week.
  3. **Shadow mode** for every new pilot home: detect and log for one week without calling anyone; founders review every detection; corrections become training data. This active-learning loop is the compounding moat.

**Dependencies:** F1.1.
**Done when:** on the locked evaluation set, zero missed falls and a false-alarm rate the pilot family confirms is livable (target under 2 per home per week before enabling live escalation).

### F1.3 Voice check-in

**What it does:** After a suspected fall: "Maria, está bem?" through the phone speaker, then understanding the answer. The single biggest false-alarm killer and the most human moment in the product.

**Technology: on-device STT (Whisper-small class model via whisper.cpp or Android SpeechRecognizer on-device mode) + lightweight intent classifier + on-device TTS**
- Why on-device STT: works during internet outages (exactly when emergencies love to happen), keeps audio in the home, and latency stays low. This safety check-in is deliberately separate from the conversational assistant (F3.6) and must never depend on a cloud API.
- Why an intent classifier rather than raw transcription matching: it must distinguish a shaky "I'm fine, I'm fine" from silence from "help," including slurred or weak speech.
- Language: **English ships first; the check-in language is a per-household setting that must match the elder.** European Portuguese (PT-PT elder speech, never Brazilian) is the fast-follow before pilot expansion beyond English-speaking households — for a Lisbon pilot, the elder's language is a safety requirement, not localization polish. Further languages follow the same per-household pattern.
- Escalation semantics are deterministic: clear "I'm fine" → stand down and log; distress or silence → escalate immediately. The classifier informs, the state machine decides.

**Dependencies:** F1.1, F1.2.
**Done when:** correct stand-down/escalate decisions on a recorded elder-voice test set in the household's configured language, including background TV noise, at above 95% accuracy, with silence always escalating.

### F1.4 Escalation engine

**What it does:** The part that must never fail. Runs the ladder from detection to help: voice check-in → family member 1 → retry → family member 2 → SMS → emergency services. Every step logged.

**Technology: Temporal (durable workflows) + Twilio Programmable Voice/SMS + FCM/APNs**
- Why Temporal: its entire purpose is workflows that survive process crashes and resume exactly where they left off. "Call the daughter, wait 45 seconds, call the son" must continue even if a server dies mid-incident. This is the strongest technical guarantee available for our most critical path.
- Why Twilio: the mature leader for programmatic PSTN calling and SMS in Europe; battle-tested delivery and full call-status webhooks so every ring, answer, and no-answer lands in the audit log. (Vonage is the fallback if Twilio pricing or PT coverage disappoints in pilot.)
- Why a state machine and not an LLM: explainable ("we called because: fall confidence 0.94, no recovery 40s, no voice response"), testable, never hallucinates. EU AI Act auditability points the same direction.
- Per-family configuration: ordered contact chain with roles, quiet-hours contract per member ("wake me only for confirmed falls"), all editable in the family app.

**Dependencies:** F0.2, F0.3, F1.3.
**Done when:** chaos test passes — killing the backend mid-escalation never drops an incident; end-to-end latency from detection to first family phone ringing is under 30 seconds.

### F1.5 Family alerting that breaks through silent mode

**What it does:** Guarantees the 3am alert is actually heard.

**Technology: platform-native critical alert mechanisms + PSTN as the unstoppable fallback**
- Android family app: notification channel with alarm category + DND bypass, audio played on the **alarm stream** (ignores silent ringer), full-screen intent that takes over the lock screen like an incoming call. Permissions requested during onboarding with clear explanation.
- iOS family app: **Critical Alerts entitlement** — plays sound through silent and Focus modes; built by Apple for exactly this category. Action item: apply for the entitlement immediately, approval takes time.
- Emergency Bypass onboarding step (iOS): guided flow where each family member saves Obrigada's Twilio number as a contact with Emergency Bypass on, so real calls ring at full volume through silent/DND from day one, independent of the entitlement timeline.
- Why PSTN calls remain in the ladder regardless: a genuine phone call is the one channel no notification setting can fully suppress, works on any phone, and needs no app installed (relevant for less technical family members).

**Dependencies:** F1.4, F2.1 (app shell).
**Done when:** a test alert wakes a silenced, DND-enabled iPhone and Android phone in a dark room. Literally tested that way.

### F1.6 Synthetic canary

**What it does:** A test device in the office that fires a simulated fall every hour and verifies the entire pipeline end to end (perception event → MQTT → Temporal → Twilio test call → audit log). If the canary fails at 3am, we know before a family does. Doubles as a security sensor: canary behaving strangely = investigate.

**Technology:** one guardian phone + a scheduled trigger + alerting on missed canary runs in Grafana.
**Dependencies:** F1.4.
**Done when:** canary has run for two consecutive weeks with alerting proven (deliberately break the pipeline once and confirm the page arrives).

---

## Phase 2 — Coverage and the family surface (Weeks 8–16)

### F2.1 Family app

**What it does:** The product surface the paying user touches. Alerts, incident timeline, live check-in entry point, enrolled people management, zones, escalation chain settings, daily summary.

**Technology: React Native (Expo)**
- Why React Native over Flutter: TypeScript continuity with the backend and the team's existing stack; Expo's build and OTA-update tooling keeps a small team fast; native modules are available for the critical-alert audio work where needed.
- Why not native twice: we cannot afford two mobile codebases; the family app is UI-heavy and standard, unlike the guardian app which genuinely needs native depth.
- Souheila owns design end-to-end in Figma; component system mirrors the established brand direction.

**Dependencies:** F0.1.
**Done when:** a pilot family completes onboarding (account, device pairing, contact chain, permissions) unassisted in under 15 minutes.

### F2.2 Face recognition, enrolled people, and roles

**What it does:** Knows who belongs in the household. Family enrolls people with 3–5 photos and assigns titles (grandfather, caregiver, family member 1, friend of family). Recognition runs on device against the local gallery.

**Technology: pre-trained face embedding model (ArcFace/MobileFaceNet family via InsightFace, converted to LiteRT) + on-device vector gallery**
- Why embeddings, not per-household training: enrollment is instant (photos → vectors, stored locally), works offline, and adding a person takes seconds. Roles/titles are metadata attached to each enrolled vector, never something a model must learn.
- Why on-device gallery: face vectors are GDPR Article 9 biometric data — the strictest tier. Keeping them on the phone (hardware-backed keystore) means the cloud never holds biometrics. Enrollment photos live client-side only.
- Role-driven behavior unlocked here: "caregiver expected Mon/Wed/Fri 9–13h, alert if absent," "friend of family: notify, don't alarm."
- Legal gate before this ships to pilots: explicit consent flow designed for the elder (with legal-representative provisions for cognitive impairment), documented in the DPIA. This is both compliance and brand: the grandfather is the protected party, not a surveillance subject.

**Dependencies:** F1.1, F2.1.
**Done when:** recognition above 99% on enrolled faces at realistic distances/lighting; unknown-person detection tested against non-enrolled visitors; consent flow reviewed against DPIA.

### F2.3 Red zones and wandering

**What it does:** Family draws zones (stove area, front door, stairs) in the app; the system alerts on entry or on exit patterns consistent with wandering.

**Technology: pose keypoints × user-drawn polygons (pure geometry on top of F1.2)**
- Why this is cheap and early: no new models. Person keypoints inside a polygon is arithmetic. High demo value, near-zero engineering risk — ship it for credibility.
- Wandering adds a time dimension: door-zone entry at unusual hours, or exit without return within a window, escalates per family configuration.

**Dependencies:** F1.2, F2.1.
**Done when:** zone alerts fire correctly in a pilot home including at night (test low-light performance explicitly).

### F2.4 Stranger and uniform context logic

**What it does:** State-aware judgment about unknown people. Uniforms are context, never trust — "person in a medic uniform" is exactly the costume elder-fraud scams use.

**Technology: uniform/high-visibility classifier on the person crop (small CNN or open-vocabulary detector distilled to LiteRT) + deterministic context rules in the reasoning layer**
- The rules, not the model, decide:
  - System itself called 112 → unknown uniformed people are **expected**: suppress alarm, label "emergency responder (expected)," record the visit.
  - Uniformed unknown with **no** active incident and no pre-logged visit → higher-priority alert with photo: "unknown person, appears to be in medical/utility uniform."
  - Family can pre-log expected visits ("nurse Thursday afternoon") so the system knows the difference.
- Why this design: it converts a scary ML feature into an explainable safety behavior, and it demos in 15 seconds.

**Dependencies:** F2.2, F1.4.
**Done when:** all three context scenarios pass staged tests; false "responder expected" suppression is impossible without a system-initiated emergency in the log.

### F2.5 Live check-in channel

**What it does:** During an incident (or on demand, per family policy), a family member opens a live audio/video channel to the guardian phone.

**Technology: LiveKit with end-to-end encryption enabled**
- Why LiveKit: production WebRTC infrastructure the team already knows from Wono; self-hostable in the EU if we want full sovereignty.
- Why E2EE on top of standard WebRTC encryption: our own servers relay video they cannot decrypt. Only the family member's phone and the guardian phone hold keys. "Can Obrigada employees watch?" becomes a provable no — a pitch asset, not just a control.
- Policy defaults: live channel opens only during active incidents unless the family explicitly configures otherwise; every channel open is logged in the audit trail with who and when.

**Dependencies:** F1.1, F2.1.
**Done when:** E2EE verified (server-side capture attempt yields ciphertext), connection succeeds on poor home Wi-Fi, open/close events land in the audit log.

### F2.6 Provisioning and fleet management

**What it does:** The unglamorous work that makes the recycled-phone GTM real: drawer phone → working guardian in under 15 minutes.

**Technology: provisioning app + QR pairing + Android Enterprise/device-owner mode where supported + signed OTA channel**
- Flow: factory reset → install via QR → device-owner lockdown → certificate issuance → camera placement wizard (live preview with framing guidance) → paired to family.
- Fleet dashboard in the backend: per-device health, model versions, battery/thermal history, remote wipe.
- Why this is a feature, not ops: setup friction is the adoption ceiling for the entire recycled-phone strategy, and the certification roadmap promises pilot expansion.

**Dependencies:** F1.1, F0.3.
**Done when:** a non-technical tester provisions a used phone unassisted in under 15 minutes, twice, on two different device models.

---

## Phase 3 — Intelligence (Weeks 14–24)

AI enters on a permission ladder: (1) observe and describe, (2) recommend, (3) act within bounded reversible scope, (4) act on safety decisions. Tiers 1–2 ship in this phase. Tier 3 follows app stability. Tier 4 is earned by pilot data, not scheduled — and possibly never, which is itself a strong regulatory story.

### F3.1 VLM second opinion (Tier 2)

**What it does:** When the pose pipeline flags an event, a small on-device vision-language model answers what pose cannot: floor or sofa? Walker nearby? Door open? Its confidence feeds the state machine as **one input among the rules** — the deterministic engine still decides.

**Technology: Gemma-class on-device multimodal model via LiteRT/MediaPipe LLM inference, invoked on demand**
- Why on-device: preserves the "video never leaves the home" line absolutely.
- Why on-demand rather than always-on: old hardware. Pose model is the smoke detector (fast, cheap, always on); the VLM is the person who walks over to check (slower, smarter, invoked when flagged).
- Expected payoff: the single biggest false-alarm reduction lever after voice check-in.

**Dependencies:** F1.2, F1.4.
**Done when:** measured false-alarm reduction on the evaluation harness with zero added missed falls; added latency stays inside the escalation budget.

### F3.2 Incident narration and daily summary (Tier 1)

**What it does:** Turns the event log into two human sentences at 3am ("Your father fell in the kitchen at 3:12. He responded to the voice check but hasn't gotten up, so we're calling you.") and writes the daily "all is well" summary — quiet reassurance as a retention feature.

**Technology: cloud LLM (Claude API) over the structured event log, text only**
- Why cloud is acceptable here: input is structured events (timestamps, labels), never imagery or audio. The privacy line holds.
- Why Claude: strongest instruction-following for tone; the narration must sound like Obrigada (warm without being sentimental). English first, with European Portuguese and further languages following the app's language rollout.
- Guardrail: narration is generated from, and links to, the append-only log; the log is always the ground truth shown alongside.

**Dependencies:** F0.2, F2.1.
**Done when:** pilot families rate summaries as clear and accurate; narration never contradicts the log in a 200-incident replay test.

### F3.3 Family Q&A agent (Tier 1→3)

**What it does:** "Did the caregiver come today?" "How did Dad sleep this week?" Conversational answers grounded in the family's own event data. Later (Tier 3): bounded reversible actions — schedule a reminder, pre-log the nurse visit mentioned in chat, send an extra reassurance message.

**Technology: cloud LLM with tool use over a read-only event API; Tier 3 actions through explicit, logged, reversible tool endpoints**
- Why grounded tool-use design: the model can only answer from queried data and can only act through whitelisted reversible endpoints — no free-form authority.
- Every Q&A session and action lands in the audit trail like everything else.

**Dependencies:** F3.2, F2.1.
**Done when:** answer accuracy verified against the log on a scripted question set; every Tier 3 action is reversible and logged.

### F3.4 Care layer basics

**What it does:** Medications, appointments, doctor scheduling reminders, delivered through the guardian phone's speaker with TTS and confirmed by voice.

**Technology: scheduled jobs in the monolith + on-device TTS/STT from F1.3 + calendar module**
- Why last: it earns nothing until the safety loop is bulletproof, and it reuses infrastructure already built (voice pipeline, scheduling, family app).

**Dependencies:** F1.3, F2.1.
**Done when:** a pilot elder completes a week of medication confirmations; missed confirmations notify the configured family member.

### F3.6 "Hey Obrigada" — the conversational voice assistant

**What it does:** The Siri-like heart of the product's personality. The elder (or a family member near the guardian phone) says the wake word; the screen border glows to show Obrigada is listening; a natural spoken conversation follows ("Yes, how can I help you?"). Handles questions, reminders, calls to family, reassurance, and everyday requests. This is a distinct feature from the safety check-in (F1.3): the assistant needs internet, the safety loop never does.

**Technology: Picovoice Porcupine (on-device custom wake word) + LiveKit Agents orchestrating streaming STT → Claude → low-latency TTS**
- Why an on-device wake word: the microphone pipeline is always-on, so **no audio may leave the phone until the wake word fires** — anything else breaks the privacy architecture. Porcupine trains a custom "Obrigada" / "Hey Obrigada" wake word and runs at negligible CPU cost on old hardware.
- Why an orchestrated pipeline over a managed speech-to-speech API: chaining STT → LLM → TTS gives full control of each component — the LLM, the voice, and data residency — which we need for three reasons: Claude as the brain (brand voice, and the same grounded tool-use design as F3.3), EU residency control, and freedom to swap components. The plumbing cost is minimal because LiveKit Agents is exactly this orchestration layer and LiveKit is already in the stack (F2.5).
- Component choices to benchmark in this order:
  - **STT:** Deepgram (Flux is purpose-built for live conversation with turn detection and interruption handling) vs. Speechmatics (accuracy and on-prem/EU deployment flexibility).
  - **TTS:** Cartesia Sonic (fastest time-to-first-audio in the market, ~40ms class) vs. ElevenLabs (voice character and cloning if we want one signature Obrigada voice across languages).
  - **Wildcard to audition:** Hume EVI, which reads the user's tone of voice and adapts delivery — detecting distress or urgency in an elder's voice is directly on-mission.
- **Local short-circuit tier:** simple commands (time, date, "remind me," "call my daughter") are recognized and executed fully on-device with the F1.3 pipeline — no cloud round-trip, works offline, and protects unit economics.
- **Economics guardrail:** managed voice-agent pricing runs roughly $4–18/hour of conversation against a €39/month subscription, so sessions are wake-word-gated with sensible timeouts, and usage per household is monitored from day one in the ops dashboard.
- Every assistant action lands in the audit trail like everything else; Tier 3 permission rules from F3.3 apply identically here.

**The listening UI (border glow) — spec'd in Figma by Souheila, four states:**
1. **Idle** — nothing; the screen is calm.
2. **Listening** — the border breathes with a soft glow, brightness tracking the elder's voice amplitude.
3. **Thinking** — a slow shimmer travels the border.
4. **Speaking** — the glow pulses in sync with the TTS output waveform.

- **Guardian phone (Kotlin/Compose):** AGSL shader border on capable devices; animated gradient stroke fallback for old hardware. Large, calm, legible from across the room — the glow doubles as accessibility for hard-of-hearing elders.
- **Family app (React Native):** same four states via React Native Skia + Reanimated, amplitude-driven.
- Motion spec (colors, glow radius, timing curves per state) is a Figma deliverable; engineering maps amplitude → shader uniforms.

**Dependencies:** F1.3 (local tier), F3.3 (tool-use design), F2.5 (LiveKit familiarity).
**Done when:** wake-word false-trigger rate below 1 per device per day; wake → first spoken response under 1.5 seconds on Wi-Fi; local short-circuit commands work in airplane mode; all four border states shipped on both apps and matched to the Figma motion spec.

### F3.5 Hospital continuity spike

**What it does:** The first concrete artifact of the hospital story: exportable, auditable event history and a discharge-summary handoff format a hospital can actually consume.

**Technology: signed PDF/FHIR-flavored export from the append-only log**
- Why start this small: it validates the institutional pitch (€1,999/ward pricing) with real material, informs regulatory conversations, and costs days, not months.

**Dependencies:** F0.2.
**Done when:** one partner clinician reviews the export and confirms it is usable.

---

## Cross-cutting workstreams (run the whole six months)

| Workstream | Cadence | Owner focus |
|---|---|---|
| Evaluation harness runs | Every model change | Missed falls / false alarms per home per week |
| Shadow-mode review | Weekly per new pilot home | Every detection reviewed, corrections fed back |
| Security posture | Monthly checklist + pre-institutional pen test | Basics stay perfect; blast radius reviewed per new component |
| DPIA / AI Act tracking | Monthly | Claims language vs. MDR/AI Act classification decided **before** pilot expansion |
| Canary + dashboard | Daily glance | Devices online, heartbeat gaps, detection→ring latency <30s |

---

## Technology summary (one screen for Wil)

| Layer | Choice | One-line why |
|---|---|---|
| Backend | NestJS modular monolith (TypeScript) | Structure without distributed-system cost; one language across the team |
| Database | PostgreSQL + TimescaleDB + Redis | One database to operate; time-series speed; append-only audit core |
| Device link | MQTT/TLS 1.3, per-device certs, EMQX | Built for flaky home Wi-Fi; guaranteed delivery; contained blast radius |
| Guardian app | Native Android (Kotlin), CameraX, kiosk mode | Low-level control old donated hardware demands |
| Pose/CV | MediaPipe Pose → (eval RTMPose) on LiteRT | Widest old-device compatibility; explainable keypoints, not pixels |
| Fall logic | Temporal mini-model + explicit rules | Accuracy plus the explainability regulators and hospitals require |
| Safety voice check-in | On-device STT + intent classifier, language per household (EN first, PT-PT next) | Works offline; the elder's language is a safety requirement |
| Voice assistant | Porcupine wake word + LiveKit Agents (STT → Claude → TTS) + border-glow UI | No audio leaves the phone pre-wake-word; full control of brain, voice, and EU residency |
| Escalation | Temporal workflows + Twilio + FCM/APNs | Crash-proof workflows on the path that must never fail |
| Silent-mode breakthrough | Android alarm-stream/DND bypass; iOS Critical Alerts + Emergency Bypass; PSTN fallback | Every platform mechanism, with a real phone call as the unstoppable rung |
| Family app | React Native (Expo) | One codebase, TypeScript continuity, Expo velocity |
| Faces/roles | ArcFace-family embeddings, on-device gallery | Instant enrollment, biometrics never in the cloud, roles as metadata |
| Live channel | LiveKit with E2EE | Provable "we cannot watch"; team already knows it |
| AI layer | On-device Gemma-class VLM + cloud Claude over text-only logs | Intelligence without breaking the privacy line; deterministic core keeps authority |
| Hosting | EU-only (AWS eu-west or Scaleway/OVH), Docker, Fly.io/Railway | Sovereignty as a verifiable claim; infra kept simple |
| Ops | Sentry, Grafana/Prometheus, Temporal UI, canary device | Detect in minutes, not months |

---

## Immediate action items (this week)

1. Apply for the **iOS Critical Alerts entitlement** (longest external lead time).
2. Stand up F0.1–F0.4 (backend skeleton, database, MQTT, security baseline).
3. Buy/collect 3–5 representative old Android devices for the compatibility matrix.
4. Start the evaluation clip library: film staged falls at real shelf-height camera angles.
5. Draft the DPIA and decide claims language (MDR / AI Act classification) with Daniel before pilot expansion.
