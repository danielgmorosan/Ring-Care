# Devpost submission drafts

Drafts for every field of the Amazon "Build, Ship, Shape" Developer Hackathon submission.
Deadline: Friday 23 October 2026, 12:00 PDT. Items marked **[TEAM TO FILL]** need someone
who did the hands-on work. Facts about the code are taken from the repository; facts about
Amazon programs come from the hackathon brief and should be checked against the current
rules page before submitting.

---

## Project name

**Obrigada**

Alternatives if the field wants more: "Obrigada: the care layer after the doorbell",
"Obrigada for Ring".

## Tagline (one line)

> When the front door opens at 3 a.m., Obrigada wakes the family, not the whole street.

Shorter options:

- "The care layer that starts where a Ring alert ends."
- "A guardian for parents at home. Ring at the door, Bee on your wrist, Bedrock in the EU."

## Text description

### Inspiration

A neighbour of ours has Alzheimer's. One night he opened his front door at 3 a.m. and
walked out. His daughter had been caring for him for years. She was asleep, because she
had to be. Nobody knew until morning.

A doorbell camera saw him leave. It sent a notification to a phone on silent. That is the
gap we care about. Detection already exists. What families need is what happens next: the
right person woken, in the right order, with a record of who answered.

Amazon closed Alexa Together in May 2025 and opened elder care to partners through the Ring
Appstore. We already had a guardian that watches for falls indoors. The front door was the
missing piece.

### What it does

Obrigada is a guardian for older adults who live at home. It is the care layer after the
event.

- **At the front door, at night.** When the family's Ring doorbell sees a person at the
  front door inside the night window, Obrigada opens a family-only incident. It calls the
  daughter first, through her quiet hours, then her brother, then a neighbour. Everyone gets
  a text if nobody has been reached. The family timeline shows each step and who
  responded. A Ring event never dials emergency services.
- **Indoors.** A recycled Android phone on a shelf detects falls on the device, asks "Are
  you okay?" in the elder's language, and escalates to family and then emergency services
  if there is no reassuring answer.
- **Carer visits.** The family logs an expected visit. When Anna rings the doorbell during
  her window, the timeline says "Anna arrived at 9:02." If nobody comes, the family hears
  "Anna was expected at 9:00 and hasn't arrived yet."
- **After the doctor.** The caregiver dictates a short note to her Bee on her Apple Watch:
  "Mom's Donepezil goes to 5 mg at 8 pm from Monday, blood test in two weeks, pick up the
  new prescription." Obrigada turns it into a care-plan proposal. She approves it in the
  app. Approved items become Bee reminders on her wrist.
- **"How was Mom today?"** Amazon Bedrock in Frankfurt writes the incident narratives, the
  daily summary, and answers the family's questions from the structured record.

What it never does: pull Ring video into our servers, store pixels or audio, let an AI
decide whether to call someone, or change a care plan without the caregiver's approval.

### How we built it

- **Backend:** a NestJS modular monolith in TypeScript, PostgreSQL with TimescaleDB, and
  Temporal for the escalation ladder so an incident survives a crash mid-call.
- **Ring:** a new `ring` module. Ring webhooks are verified with HMAC-SHA256 over the raw
  bytes, recorded first and idempotently in an append-only table, answered with 200 inside
  Ring's budget, then put on the internal event bus. A Partner API client handles OAuth
  refresh, Playground tokens, 401 retry, 429 Retry-After and 503 device-offline. Live view
  is a WHEP signalling relay only, and every open is audit-logged.
- **Care logic:** a deterministic rule decides what a Ring event means: not a person,
  an expected visitor, night door activity, or daytime. Every judgement is stored
  append-only with its reason. Night door activity runs on a family-only rule set of the
  same Temporal workflow that handles falls: no voice check-in, wake through quiet hours,
  no emergency step.
- **Bee:** `bee stream --webhook-endpoint` posts new conversations to our backend. We fetch
  the caregiver's note, extract care items through a generic LLM port with a deterministic
  rules extractor as fallback, validate the output with a schema, and store a pending
  proposal. Approval applies items and creates Bee todos with alarms.
- **Amazon Bedrock:** the Converse API in `eu-central-1` with an `eu.` cross-region
  inference profile, behind the same narration port the platform already had. The backend
  refuses to boot with a non-EU region or profile. Requests carry text only.
- **Family app:** React Native with Expo, also running on the web, with new Ring, live view,
  night door, visit and care proposal screens.
- **A Ring webhook simulator** that signs events exactly like Ring, so the whole flow runs
  without hardware.

### Challenges we ran into

- **Building against documentation we could not always reach.** The exact Ring
  notification payload and the Bee conversation JSON were not available to us in a form
  we could test against. We wrote tolerant parsers, isolated every assumption in one file
  per service, and pinned the shapes we accept with fixtures.
- **Testing webhooks without hardware.** The Ring Developer Playground gives short-lived
  tokens and does not deliver webhooks to a partner backend. So we built the signed
  simulator and made the app label simulated events.
- **Keeping the safety core deterministic.** It was tempting to let a model judge whether a
  door event "looks like wandering". We kept that judgement in plain rules and left the
  model to write words.
- **EU residency.** Ring, Bee and Bedrock are all new subprocessors. Each has a decision
  record, and Bedrock has a boot guard that refuses non-EU configuration.
- **Consent.** A voice wearable near a doctor is a legal question in Portugal. We designed
  the Bee flow around the caregiver's own dictated note, never a recorded consultation.
- [TEAM TO FILL] Anything that broke during hands-on testing with real accounts.

### Accomplishments that we're proud of

- A Ring event can never dial emergency services. That is enforced by the workflow's rule
  set, derived from the incident reason inside the workflow, so no caller can override it.
- Ring video never touches our backend. We store labels and ids. Live view relays
  signalling only.
- Every judgement is explainable: why an incident opened or did not, who was called, who
  approved which care change. All of it is append-only.
- 242 unit tests across the new Ring, Bee, AI, visits and ladder code pass, including the
  exact Bedrock request shape (no media blocks) and the family-only ladder.
- Everything is off unless configured, so the existing guardian platform is unaffected.

### What we learned

- Ring already tells you a person is at the door, and describes it. The value we add is the
  response: who to wake, in what order, and the record afterwards.
- A deterministic core makes AI easier to add, not harder. Once the ladder cannot be
  changed by a model, the model is free to be helpful with words.
- EU cross-region inference profiles on Bedrock make data residency a configuration we can
  check at boot, rather than a promise.
- [TEAM TO FILL] What the families we spoke to said about night wandering and carer
  no-shows.

### What's next for Obrigada

- Answer detection on calls, so the ladder waits for each person before moving on.
- Multi-household Ring account linking, replacing the single linked household in this
  build.
- Familiar Faces for explicitly enrolled people, so "Dad left" and "a stranger is at the
  door" are different alerts.
- Ring Appstore availability in the EU, where our first families live.
- European Portuguese across the family app, after the elder-facing check-in.
- A pilot with families in Portugal. [TEAM TO FILL] dates and partner.

---

## What existed before vs built during the hackathon

Facts from git. The repository's first commit is the pre-existing platform.

| | Before the hackathon | During the hackathon |
| --- | --- | --- |
| Commit range | `486e6ac`, tag `pre-hackathon-baseline`, dated 10 July 2026 | `486e6ac..HEAD`: 24 commits (19 non-merge) |
| Size | 513 files, 58,507 lines | 146 files changed, 12,318 lines added, 125 removed |
| Guardian app (Android) | Fall detection, face roles, zones, voice check-in, kiosk mode | Unchanged |
| Escalation | Temporal ladder for falls: check-in gate, push, calls, SMS, emergency step | Reason-specific rule sets; family-only `door.night_activity` ladder that wakes through quiet hours and has no emergency step; custom family-facing wording |
| Ring | None | `ring` module, migration `1720000000028`: signed webhook intake, append-only `ring_events`, cameras and placement, Partner API client, live-view signalling relay, simulator |
| Visits | Expected visits (CRUD) | Append-only arrivals from the doorbell, no-show sweep and alert (migration `1720000000029`) |
| Bee | None | `bee` module, migration `1720000000030`: webhook, Bee API adapter, care extraction, append-only proposals and decisions, Bee todos |
| AI | Narration port with a Claude adapter (disabled by decision 0002) and a mock | `ai` module with `LLM_PORT`; Amazon Bedrock adapter for narration, summary, Q&A and extraction; EU boot guard |
| Family app | Timeline, alerts, contacts, care, guardian live view | Ring cameras, activity and live view; night door and visit incidents; Bee care proposals inbox |
| Docs | Build plan, decisions 0001 to 0010 | Decisions 0011 to 0013, API contract, Bedrock and Bee guides, this submission, MIT license |

## Tracks entered

- **Primary track: Ring, caretaking category.** [TEAM TO FILL] confirm the exact track and
  category names on the Devpost form.
- **Mini challenge: AWS Builder.**
- **Mini challenge: Open Source** (optional). The repository is MIT licensed.

## AWS Builder details

**Services used**

| Service | How we use it | Where in code |
| --- | --- | --- |
| Amazon Bedrock Runtime, Converse API | Incident narratives, the daily summary, family Q&A ("How was Mom today?"), and care extraction from Bee notes. One system block and one user text block per call. No image, document, video or audio blocks are ever built, and the tests assert it. 15 second timeout, then the deterministic mock. | `apps/backend/src/modules/ai/bedrock-llm.adapter.ts`, `apps/backend/src/modules/escalation/narration/bedrock-narration.adapter.ts`, `apps/backend/src/modules/ai/ai.module.ts` |
| Region `eu-central-1` (Frankfurt) with an EU cross-region inference profile | `BEDROCK_MODEL_ID` is an `eu.` profile id, so requests route only between EU regions. The backend refuses to boot with a non-EU region, a `us.`, `apac.` or `global.` profile, or a non-EU ARN. | `assertEuBedrockConfig` in `apps/backend/src/modules/ai/bedrock.client.ts` |
| AWS IAM | Least-privilege policy: `bedrock:InvokeModel` on the one EU inference profile, and on the underlying foundation model only when called through that profile (`bedrock:InferenceProfileArn` condition). Credentials from the default provider chain, never from code. | Policy in `docs/hackathon/aws-bedrock.md` |
| AWS SDK for JavaScript v3 | `@aws-sdk/client-bedrock-runtime`, injected through a `BEDROCK_CLIENT` token so tests stub it and never reach AWS. | `apps/backend/package.json`, `apps/backend/src/modules/ai/bedrock.client.ts` |

**Why Bedrock.** Our rules say EU-only infrastructure. Our earlier Claude API adapter stayed
disabled for that reason (decision 0002). Bedrock in Frankfurt with an EU profile lets us
turn narration on without sending health-adjacent data outside the EU.

**What is sent.** Reason labels, timestamps, step kinds, contact roles, allowlisted check-in
results and outcomes. Never names, pixels or audio. Logs record model id, region, token
counts and latency, never prompt or completion text.

**What Bedrock never does.** Decide whether anyone is called. The escalation ladder is a
deterministic Temporal workflow.

[TEAM TO FILL] Model family and profile id used for the demo, and the AWS account setup
time.

## Open Source mini challenge

The whole repository is MIT licensed, including the platform that existed before the
hackathon.

**Reusable tool: a signed Ring webhook simulator.** `apps/backend/scripts/ring-sim.ts` posts
Ring-style notifications (JSON:API envelope, `motion_detected` with `sub_type`,
`button_press`) to any URL, signed exactly as Ring signs them: `X-Signature: sha256=<hex
HMAC-SHA256 of the raw body>`. It ships four scenarios (`night-exit`, `carer-arrival`,
`carer-no-show`, `daytime-motion`), takes `--url`, `--secret`, `--camera` and `--at`, and
resolves local times in the household's time zone through `TZ`. Every event carries
`X-Obrigada-Simulator: 1` so a receiving app can label it. It carries labels and ids only,
like real Ring traffic.

Why it helps other builders: the Ring Developer Playground does not deliver webhooks to a
partner backend, and Playground tokens are short-lived. With the simulator any Ring partner
can test signature verification, idempotency and their own logic locally, in CI, or in a
demo. It depends on one small signing function (`src/modules/ring/ring-signature.ts`) and
Node's `fetch`, so it lifts out easily.

Also reusable:

- A tolerant Ring webhook parser with fixtures for the flat and JSON:API shapes
  (`src/modules/ring/ring-webhook.parser.ts`, `src/modules/ring/fixtures`).
- A Bee webhook receiver that accepts every shape `bee stream` can post, plus a relay
  script for the `--agent` output (`docs/hackathon/bee.md`).
- An EU guard for Bedrock configuration (`assertEuBedrockConfig`).

[TEAM TO FILL] Decide whether to extract the simulator into its own small package before
submission.

## Product feedback

Honest drafts. Replace the bracketed parts with what you saw.

### Ring Partner API

What worked:

- Signed webhooks with an HMAC over the raw body are simple to verify and to test.
- Smart Alert sub types such as `human` are exactly the signal a care app needs. We do not
  want or need the video.
- WHEP for live view is a good standard choice. A partner can relay signalling and never
  touch media.

What was hard:

- We could not find the notification payload schema in a form we could fetch and test
  against while building, so we accepted both a flat and a JSON:API shape. A published
  JSON Schema and sample payloads per event type would remove that guesswork.
- Refresh tokens rotate on every exchange. That is sound, but it means a partner must
  persist the new token before using the access token, or a restart locks them out. A
  short note in the docs would save someone a bad morning.
- [TEAM TO FILL] Onboarding feel: how long from sign-up to a first successful call, what
  the approval process was like, anything that broke.

### Ring Developer Playground

What worked:

- [TEAM TO FILL] Was the device list realistic? Did live view work?

What was hard:

- The Playground does not deliver webhooks to our backend, and the event flow is the heart
  of a care integration. We built a signed simulator to cover it.
- Tokens last about 30 minutes and cannot be refreshed, so every demo rehearsal starts with
  getting a new token.
- [TEAM TO FILL] Confirm both points from hands-on use and add anything else.

### Bee CLI and API

What worked:

- `bee stream` with `--webhook-endpoint` and `--webhook-body` made it possible to wire a
  backend in an afternoon.
- `POST /v1/todos` with an alarm puts reminders on the caregiver's wrist. That closes the
  loop in a way a phone notification does not.
- The `--agent` line format is easy to parse.

What was hard:

- The conversation JSON shape is not documented, so we parse it tolerantly (bare or
  wrapped, snake or camel case, utterances in two places).
- The default webhook body and content type are not documented, and there is no header
  option for a shared secret. We put the secret in the query string.
- `bee stream` has to run as a long-lived process somewhere. For a backend that means a
  sidecar to keep alive and monitor.
- [TEAM TO FILL] Developer mode setup (it needed a paired device for us?), how the Apple
  Watch capture felt, latency from speaking to `new-conversation`.

### Amazon Bedrock

What worked:

- The Converse API kept our adapter small, and the same request shape works across models.
- EU cross-region inference profiles map cleanly onto our EU-only rule. We can check the
  prefix at boot.
- Error names (`AccessDeniedException`, `ValidationException`, `ThrottlingException`) are
  specific enough to turn into helpful hints in our logs.

What was hard:

- The IAM policy for an inference profile needs both the profile and the foundation model
  in every destination region. That is easy to get wrong the first time.
- Finding the right profile id moved between console pages depending on the console
  version.
- [TEAM TO FILL] Model access approval time, and whether the new account started with a zero
  or very low quota in `eu-central-1`.

## Feature requests

| Request | For | Why it matters to families | Urgency |
| --- | --- | --- | --- |
| **Familiar Faces via the Partner API, for explicitly enrolled people only** | Ring | "Dad is leaving" and "a stranger is at the door" need different responses. Today we can only say "someone". Enrolment by the family, with consent, keeps it lawful. | High. It is the difference between a useful night alert and a guess. |
| **A "person down" or fall Smart Alert sub type** | Ring | Outdoor and doorstep falls are where our indoor guardian cannot see. A label is enough; we do not need the video. | High |
| **Partner push into the Ring app** | Ring | The family already has the Ring app. Being able to post "Sofia is handling this" there would reduce the number of apps a tired caregiver juggles. | Medium |
| **Ring Appstore availability in the EU** | Ring | Our first families are in Portugal. Distribution is US-only today, per our decision record. | High for us, as an EU company |
| **Playground webhook delivery, or a hosted webhook tester** | Ring | Event flows are the core of care integrations. | Medium |
| **Bee webhooks without a long-running CLI process** | Bee | A server-to-server webhook registration would remove a sidecar we must keep alive for every caregiver. | High for production |
| **Documented Bee conversation and webhook schemas** | Bee | Lets partners validate strictly instead of parsing tolerantly. | Medium |
| [TEAM TO FILL] Any Bedrock request from hands-on use | Bedrock | | |

## Links and media checklist

- [ ] Public repository URL. [TEAM TO FILL]
- [ ] Demo video under three minutes ([video-script.md](./video-script.md)).
- [ ] Screenshots: night door timeline, Ring activity with Simulated label, care proposal
      inbox, Bedrock answer.
- [ ] Architecture diagram (README mermaid, exported as an image).
- [ ] Team members on Devpost: Souheila, Wil, Daniel.
- [ ] Friction log ([friction-log.md](./friction-log.md)) attached or linked if the form
      asks for it.
