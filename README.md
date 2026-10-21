# Obrigada

Obrigada is a guardian for older adults who live at home. A recycled Android phone on a
shelf becomes an always-on perception device. It notices a fall, tells household members
from strangers, watches the places that are unsafe, and checks in by voice in the elder's
own language. When something is wrong, it reaches the family first and emergency services
when it must.

The caregiver is the user. The elder never has to operate anything; we assume memory and
attention may fade. The AI acts on the elder's behalf and answers to the family. Frames and
sound are processed on the device and discarded. What leaves the home is labels, times and
confidences, and every step is written to an append-only audit trail.

## Built for the Amazon Developer Hackathon

The Obrigada platform existed before this hackathon. The baseline is commit `486e6ac`
(tag `pre-hackathon-baseline`, 10 July 2026): the guardian app, fall detection, voice
check-in, the Temporal escalation ladder, the family app, narration behind a mock, care
basics and the audit trail.

Everything after that commit was built during the hackathon window. Compare with
`git log --oneline pre-hackathon-baseline..HEAD` and
`git diff --stat pre-hackathon-baseline..HEAD`. What is new:

**Ring at the front door** (`apps/backend/src/modules/ring`, decision
[0011](docs/decisions/0011-ring-cameras-as-a-sensor.md))
- Signed Ring webhook intake (HMAC-SHA256 over the raw body), recorded first and
  idempotently in an append-only `ring_events` table, then put on the internal bus.
- A Ring Partner API client with OAuth refresh, Playground token mode, and 401, 429 and
  503 handling. Camera sync and placement (front door, inside, other).
- Night door activity: a person at a front-door camera inside the night window opens a
  `door.night_activity` incident on a family-only ladder. It wakes contacts through their
  quiet hours and never dials emergency services.
- Carer visits: a doorbell press or person inside an expected visit's window is recorded
  as an arrival ("Anna arrived at 9:02."). No arrival after a grace period raises a
  `visit.no_show` alert.
- Live view as a window, not a recorder: the backend relays WHEP signalling only, never
  media, and audit-logs every open and close.
- A signed webhook simulator, `pnpm --filter @obrigada/backend ring:sim`.

**Bee on the caregiver's wrist** (`apps/backend/src/modules/bee`, decision
[0012](docs/decisions/0012-bee-caregiver-voice-notes.md))
- `bee stream` posts new conversations to `POST /bee/webhook`. The backend fetches the
  caregiver's own note, extracts medication changes, appointments and to-dos, and stores a
  pending care proposal.
- Nothing changes until the caregiver approves. Approved items update the care plan and
  come back to her wrist as Bee reminders.

**Amazon Bedrock in Frankfurt** (`apps/backend/src/modules/ai`, decision
[0013](docs/decisions/0013-bedrock-eu-ai-provider.md))
- A Bedrock provider using the Converse API in `eu-central-1` with an `eu.` cross-region
  inference profile. It writes incident narratives, the daily summary, answers to "How was
  Mom today?" and Bee care extraction.
- The backend refuses to boot with a non-EU region or a non-EU inference profile.
  Text in, text out; no image, audio or document blocks are ever built.

**Amazon Connect calls from Frankfurt** (`apps/backend/src/modules/escalation/notifications`,
decision [0014](docs/decisions/0014-amazon-connect-calls.md))
- `CALL_PROVIDER=connect` places family calls with `StartOutboundVoiceContact` into an
  importable flow that says the incident and asks "Press 1 if you are handling this."
- Press 1 comes back by polling the contact attribute: no Lambda, no public URL, no
  tunnel. Twilio stays as the fallback. Setup:
  [docs/hackathon/amazon-connect.md](docs/hackathon/amazon-connect.md).

**Family app** (`apps/family`): Ring cameras, activity and live view; night door and visit
incidents on the timeline; a Bee care proposals inbox.

Ring video never reaches our backend. The safety core stays deterministic and AI only
advises. All of these integrations are off unless configured.

## Architecture

```mermaid
flowchart LR
  subgraph Home
    G[Guardian phone<br/>fall, faces, zones,<br/>voice check-in]
    R[Ring doorbell]
  end
  subgraph Caregiver
    F[Family app]
    B[Bee on Apple Watch]
  end
  subgraph Amazon
    RP[Ring Partner API]
    BA[Bee API + bee stream]
    BR[Amazon Bedrock<br/>eu-central-1]
    AC[Amazon Connect<br/>eu-central-1]
  end
  subgraph Backend[Obrigada backend, NestJS, EU]
    RG[ring module]
    BE[bee module]
    ES[escalation<br/>Temporal ladder]
    VI[visits]
    AI[ai module<br/>LLM_PORT]
    DB[(Postgres + TimescaleDB<br/>append-only trails)]
  end
  TW[Twilio calls + SMS<br/>fallback]

  G -- MQTT mTLS, labels only --> ES
  R --> RP -- signed webhook, metadata only --> RG
  RG -- internal bus --> ES
  RG -- internal bus --> VI
  ES -- calls, press 1 by polling --> AC
  ES -.-> TW
  ES --> F
  B --> BA -- webhook --> BE
  BE -- approved items as todos --> BA
  BE -- extract --> AI
  ES -- narrate --> AI
  AI -- Converse, text only --> BR
  F -- WHEP signalling relay --> RG
  RG -. signalling only .-> RP
  RG --- DB
  ES --- DB
  BE --- DB
```

Ring and Bee events enter the same deterministic escalation and alert paths as guardian
events. Bedrock writes words for people. It never decides whether anyone is called.

## Repository map

| Path | What lives there |
| --- | --- |
| `apps/backend` | NestJS modular monolith: `devices`, `events`, `escalation`, `families`, `care`, `fleet`, and new `ring`, `bee`, `ai`, `visits` arrivals |
| `apps/backend/migrations` | node-pg-migrate migrations; `1720000000028` to `030` are the hackathon tables |
| `apps/backend/scripts/ring-sim.ts` | Signed Ring webhook simulator |
| `apps/family` | React Native (Expo) family app, also runs on the web |
| `apps/guardian` | Native Android guardian app (Kotlin, CameraX, LiteRT) |
| `apps/voice-agent` | "Hey Obrigada" voice assistant agent |
| `packages/shared` | Shared TypeScript types: event schemas, MQTT topic contracts |
| `packages/design-system` | Shared design tokens |
| `docs/obrigada-build-plan.md` | Feature-by-feature roadmap |
| `docs/decisions` | Architecture decision records; 0011 to 0014 cover Ring, Bee, Bedrock, Connect |
| `docs/hackathon` | API contract, Bedrock, Connect and Bee setup, demo runbook, submission drafts |
| `infra`, `deploy` | EMQX config, production compose and Caddy |

## Quick start (backend on your machine)

You need Node 22 or newer, pnpm 10 (`corepack enable`), and Docker.

The fastest path, the same in PowerShell and bash:

```sh
pnpm install
pnpm demo:env       # apps/backend/.env with the demo values (never overwrites)
pnpm demo:up        # checks, then Postgres, Redis and Temporal in Docker, migrations
pnpm backend:dev    # in its own terminal
pnpm demo:seed      # the demo household; restart the backend when it asks, run it again
pnpm demo:scene night-exit
pnpm demo:check     # what is configured and what is missing
```

On Windows, or for the live run with real calls, follow
[docs/hackathon/windows-quickstart.md](docs/hackathon/windows-quickstart.md). The manual
steps below are what those commands do.

```sh
pnpm install

# Postgres (TimescaleDB, host port 5433), Redis and the Temporal dev server.
# EMQX is only needed for real guardian phones and wants dev certs first
# (scripts/gen-dev-certs.sh), so leave it out for now.
docker compose up -d postgres redis temporal

DATABASE_URL=postgres://obrigada:obrigada@localhost:5433/obrigada pnpm db:migrate

cp apps/backend/.env.example apps/backend/.env
```

Edit `apps/backend/.env`. The backend reads it from `apps/backend` at boot.

- Comment out the `MQTT_*` and `DEVICE_CA_*` lines unless you generated dev certs.
- Keep `DATABASE_URL` and `TEMPORAL_ADDRESS`. Without a database the backend runs on
  in-memory stores and forgets everything on restart; without Temporal no calls are
  placed.
- Add the integration variables below that you want to try.

```sh
pnpm backend:dev                      # http://localhost:3000, health at /health/ready
pnpm --filter @obrigada/family web    # family app in the browser
```

Send a simulated Ring event (needs `RING_HMAC_SECRET` and `RING_FAMILY_ID`, see below):

```sh
TZ=Europe/Lisbon RING_HMAC_SECRET=... \
  pnpm --filter @obrigada/backend ring:sim --scenario night-exit
```

Scenarios: `night-exit`, `carer-arrival`, `carer-no-show`, `daytime-motion`. Options:
`--url`, `--secret`, `--camera`, `--at <ISO time|now|now-night>`. `--help` explains each.
Running it without `--scenario` prints the usage.

Tests: `pnpm test` (unit, including the demo tooling's `pnpm demo:test`),
`pnpm --filter @obrigada/backend test:temporal` (crash and resume of the escalation
workflow).

The full demo, step by step, is in [docs/hackathon/demo-runbook.md](docs/hackathon/demo-runbook.md).
Production deployment is in [docs/deploy-to-a-vps.md](docs/deploy-to-a-vps.md).

## Environment for the integrations

All optional. Each feature is off until its variables are set. Secrets come from your shell
or a secret manager, never from a committed file.

### Ring

| Variable | Purpose |
| --- | --- |
| `RING_HMAC_SECRET` | Verifies `X-Signature: sha256=<hex>` on `POST /ring/webhook`. Required for webhooks and the simulator. |
| `RING_FAMILY_ID` | The family the linked Ring account belongs to (single household in this build). Required for webhooks. |
| `RING_ACCESS_TOKEN` | Playground mode: a short-lived developer token, used as is. |
| `RING_CLIENT_ID`, `RING_CLIENT_SECRET`, `RING_REFRESH_TOKEN` | OAuth mode, with token refresh. Takes precedence over Playground. |
| `RING_API_BASE_URL` | Default `https://api.amazonvision.com`. |
| `RING_OAUTH_BASE_URL` | Default `https://oauth.ring.com`. |
| `RING_NIGHT_START`, `RING_NIGHT_END` | Night window in household time. Default `22:00` to `07:00`. |
| `VISIT_ARRIVAL_GRACE_MINUTES` | Minutes after a visit starts before a no-show alert. Default `20`. |

### Bee

| Variable | Purpose |
| --- | --- |
| `BEE_WEBHOOK_SECRET` | Shared secret for `POST /bee/webhook`, at least 16 characters. Bearer header or `?secret=`. |
| `BEE_FAMILY_ID` | The family whose caregiver owns the Bee. |
| `BEE_API_TOKEN` | The caregiver's Bee developer token. Without it a mock Bee serves a demo note. |
| `BEE_API_BASE_URL` | Default `https://api.developer.bee.amazon.dev`. |

Setup and the `bee stream` command: [docs/hackathon/bee.md](docs/hackathon/bee.md).

### Amazon Bedrock

| Variable | Purpose |
| --- | --- |
| `AI_PROVIDER` | `bedrock`, `anthropic` or `mock`. Unset means mock unless `ANTHROPIC_API_KEY` is set. |
| `BEDROCK_REGION` | Default `eu-central-1`. Must be an `eu-*` region or the backend will not boot. |
| `BEDROCK_MODEL_ID` | An `eu.` cross-region inference profile id, copied from the console. |
| AWS credentials | The default AWS provider chain: `AWS_PROFILE`, exported keys, or an instance role. |

Model access, the least-privilege IAM policy and a one-request check:
[docs/hackathon/aws-bedrock.md](docs/hackathon/aws-bedrock.md).

### Amazon Connect (real calls)

| Variable | Purpose |
| --- | --- |
| `CALL_PROVIDER` | `connect` or `twilio`. Unset means Twilio if configured, otherwise the mock (the behaviour before Connect). |
| `CONNECT_REGION` | Default `eu-central-1`. Must be an `eu-*` region or the backend will not boot. |
| `CONNECT_INSTANCE_ID`, `CONNECT_CONTACT_FLOW_ID`, `CONNECT_SOURCE_PHONE_NUMBER` | The instance, the imported `obrigada-family-call` flow, and the claimed number (E.164). |
| `CONNECT_SMS_ORIGINATION` | Optional. An End User Messaging SMS origination identity; otherwise texts go through Twilio, or are skipped and push carries the alert. |
| AWS credentials | The default AWS provider chain, as for Bedrock. |

Instance, number, the Portugal and Romania allowlist, the flow import, IAM and a test run:
[docs/hackathon/amazon-connect.md](docs/hackathon/amazon-connect.md).

### Twilio (real calls and SMS)

| Variable | Purpose |
| --- | --- |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | All three switch the mock off and place real calls and texts. |
| `TWILIO_API_BASE_URL` | Default `https://api.twilio.com`. Point it at Twilio's EU edge for residency. |
| `PUBLIC_BASE_URL` | The backend's public https origin (a tunnel in the demo). Needed for Twilio callbacks: with it, calls ask the contact to press 1 and the ladder waits for them. |
| `CALLBACK_SIGNING_SECRET` | Optional. Signs the press-1 callback links. Derived from `JWT_SECRET` when unset. |

Without Twilio, a mock logs every call and text it would have made and the ladder still
runs end to end.

## Privacy and safety, briefly

- No video or audio leaves the home. Ring video stays in the family's Ring account; we
  record labels and ids only, and live view is a signalling relay that is audit-logged.
- Incidents, Ring events, visit arrivals, care proposals and their decisions are
  append-only, enforced in the database.
- The escalation ladder is a rules-based Temporal workflow. A Ring event can never dial
  emergency services. LLM output can create a proposal or a sentence, never a decision.
- EU only. Ring, Bee, Bedrock and Connect are new subprocessors, recorded as proposed
  decisions 0011 to 0014 that need founder sign-off before production use.

## License

MIT. See [LICENSE](LICENSE).
