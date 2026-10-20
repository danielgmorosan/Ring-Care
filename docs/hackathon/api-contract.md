# Hackathon API contract (Ring, Bee, Bedrock)

Shared contract for the parallel workstreams. Backend routes follow the existing
`me/...` convention (family scoped by the signed-in caregiver, JWT guard). Webhooks are
`@Public()` and authenticated by signature or bearer secret.

## Internal events (apps/backend/src/internal-events/internal-events.ts)

- `ring.motion_detected` and `ring.button_pressed`, payload `RingActivityPayload`
  (familyId, ringCameraId, ringEventId, placement, subType, occurredAt, source).
  Emitted by the ring module after the webhook is durably recorded.

## Ring (module `ring`, migration `1720000000028_ring.js`)

- `POST /ring/webhook` — public. Raw body verified with HMAC-SHA256 over the raw bytes
  using `RING_HMAC_SECRET`; header `X-Signature: sha256=<hex>`. Answer 200 within 5 s,
  record first, then emit. Events: `motion_detected` (attributes.sub_type),
  `button_press`, `device_online`, `device_offline`; others are recorded and ignored.
  Idempotent on Ring's event id.
- `GET /me/ring/status` → `{ mode: 'oauth'|'playground'|'off', webhooks: boolean, cameras: RingCamera[] }`
- `GET /me/ring/cameras` → `RingCamera[]`
  `RingCamera = { id, ringDeviceId, name, placement: 'front_door'|'indoor'|'other', online: boolean, lastEventAt: string|null }`
- `POST /me/ring/cameras/sync` → pulls `GET /v1/devices` from Ring and upserts cameras.
- `PATCH /me/ring/cameras/:id` body `{ placement }`.
- `POST /me/ring/cameras/:id/live` body `{ sdpOffer: string }` → `{ sessionId, sdpAnswer }`
  (WHEP relay, signalling only; audit-logged).
- `DELETE /me/ring/cameras/:id/live/:sessionId`
- `GET /me/ring/activity?limit=50` → `RingActivity[]`
  `RingActivity = { id, cameraId, cameraName, placement, kind: 'motion'|'ding'|'online'|'offline', subType: string|null, occurredAt, source: 'ring'|'simulator', interpretation: 'night_door'|'visit_arrival'|null }`
- Simulator: `pnpm --filter @obrigada/backend ring:sim --scenario <night-exit|carer-arrival|carer-no-show|daytime-motion>`
  posts signed webhooks to the local backend.

## Ring care logic (escalation + visits, migration `1720000000029_visit_arrivals.js`)

- Night door activity: `ring.motion_detected` with subType `human` (or a doorbell press)
  on a `front_door` camera inside the night window → a family alert through the existing
  alerts/escalation path, reason `door.night_activity`. Never suppressed by AI output.
- Visit arrival: front-door `button_press` or `human` motion inside an expected visit's
  window → append-only arrival record, shown on the timeline ("Anna arrived at 09:02").
- Visit no-show: no arrival by start + `VISIT_ARRIVAL_GRACE_MINUTES` → family alert
  reason `visit.no_show`.

## Bee (module `bee`, migration `1720000000030_care_proposals.js`)

- `POST /bee/webhook` — public, `Authorization: Bearer <BEE_WEBHOOK_SECRET>`. Body is what
  `bee stream --webhook-endpoint` posts. On `new-conversation` /
  `update-conversation-summary`, fetch the conversation from the Bee API, extract with
  `LLM_PORT`, store a pending proposal.
- `GET /me/care/proposals?status=pending|approved|rejected` → `CareProposal[]`
  `CareProposal = { id, source: 'bee', createdAt, summary, status, items: ProposalItem[] }`
  `ProposalItem = { id, kind: 'medication_change'|'new_medication'|'appointment'|'todo'|'note', title, detail, data }`
- `POST /me/care/proposals/:id/approve` body `{ itemIds?: string[] }` → `{ applied: string[], todosCreated: number }`
- `POST /me/care/proposals/:id/reject`

## AI (module `ai`)

- `LLM_PORT` (`apps/backend/src/modules/ai/llm.port.ts`): Bedrock Converse in
  `BEDROCK_REGION` when `aiProvider === 'bedrock'`, Anthropic when configured, else mock.
- Narration (`NarrationPort`) gains a Bedrock adapter selected by `aiProvider`.
