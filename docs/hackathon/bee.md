# Bee: caregiver voice notes into care proposals

Decision record: [0012](../decisions/0012-bee-caregiver-voice-notes.md). Module:
`apps/backend/src/modules/bee`. Contract: [api-contract.md](./api-contract.md#bee-module-bee-migration-1720000000030_care_proposalsjs).

## The flow

1. After the GP visit the caregiver dictates a short note to Bee in her own words:
   "Mom's Donepezil goes to 5 mg at 8 pm from Monday, blood test in two weeks, pick up
   the new prescription".
2. `bee stream` (running on any machine logged in to her Bee account) posts the
   `new-conversation` / `update-conversation-summary` events to `POST /bee/webhook`.
3. The backend answers 202 at once, then fetches the conversation
   (`GET /v1/conversations/:id`), extracts care items and stores a **pending proposal**
   for `BEE_FAMILY_ID`. Conversations with no care content are ignored. One proposal per
   conversation (idempotent on the conversation id).
4. The family app lists `GET /me/care/proposals?status=pending`. The caregiver approves
   all items or some (`POST /me/care/proposals/:id/approve { itemIds? }`) or rejects.
5. Approval applies items through the care module and creates Bee todos with alarms
   (`POST /v1/todos { text, alarm_at }`), so the reminders arrive on her wrist.

Nothing changes in the care plan without step 4. LLM output only ever creates proposals.

## Environment

| Variable             | Purpose                                                                  |
| -------------------- | ------------------------------------------------------------------------ |
| `BEE_WEBHOOK_SECRET` | Shared secret for `/bee/webhook` (16+ chars). Required for the webhook.  |
| `BEE_FAMILY_ID`      | The family whose caregiver owns the Bee. Required for the webhook.       |
| `BEE_API_TOKEN`      | Her Bee developer token. Without it a mock Bee is used (see Demo).       |
| `BEE_API_BASE_URL`   | Defaults to `https://api.developer.bee.amazon.dev`.                      |

Without `BEE_WEBHOOK_SECRET` and `BEE_FAMILY_ID` the webhook returns 503.
Extraction uses `LLM_PORT` (Bedrock, decision 0013) when AiModule provides it, and the
deterministic rules extractor when it is absent, returns the mock, fails, or returns
output that does not validate.

## Running `bee stream`

Recommended (uses the CLI's own webhook support, secret in the query string because the
CLI documents no header option):

```sh
bee login
bee stream \
  --types new-conversation,update-conversation-summary \
  --webhook-endpoint "https://<backend-host>/bee/webhook?secret=$BEE_WEBHOOK_SECRET"
```

If the default body turns out not to carry the conversation id, add the agent-message
template (the endpoint also accepts `text/plain`):

```sh
  --webhook-body '{{message}}'
```

Fallback relay that only uses documented flags (`--agent` prints one line per event,
ending in `conv=<id>`), with the secret as a bearer header:

```sh
bee stream --agent --types new-conversation,update-conversation-summary |
while IFS= read -r line; do
  curl -sS -X POST "https://<backend-host>/bee/webhook" \
    -H "Authorization: Bearer $BEE_WEBHOOK_SECRET" \
    -H 'Content-Type: text/plain' --data-binary "$line"
done
```

The endpoint accepts, tolerantly: a JSON event (`{event|type, data}` with
`data.conversation.id|uuid` or `data.conversation_id`), a JSON `{message: "<agent line>"}`,
or the agent line as plain text. Bodies that are invalid JSON but sent as
`application/json` are refused by the global JSON parser (400); use the relay above if
that happens.

## Demo without a Bee account

With no `BEE_API_TOKEN`, the mock Bee returns the demo note for any conversation id that
starts with `demo`, and logs the todos it would create:

```sh
curl -X POST "http://localhost:3000/bee/webhook?secret=$BEE_WEBHOOK_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"event":"new-conversation","data":{"conversation":{"id":"demo-1"}}}'
```

On Tuesday 20 October 2026 (Europe/Lisbon) that produces:

| Item              | Title                                            | On approve                                                        |
| ----------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| medication_change | Donepezil to 5 mg at 20:00 from Monday 26 October | Donepezil updated to 5 mg at 20:00, start date in its notes       |
| appointment       | Blood test on Tuesday 3 November                 | Appointment at 09:00 (time to check), Bee todo alarm 2 Nov 18:00  |
| todo              | Pick up the new prescription                     | Bee todo, no alarm (no due date given)                            |

## What we store, and what we never store

- `care_proposals` (append-only): summary, structured items, `extracted_by`, the Bee
  conversation id. Not the transcript, never audio (rule #1).
- `care_proposal_decisions` (append-only, one per proposal): decision, approved item
  ids, who decided, per-item results (care records touched, Bee todo ids or errors).
- The approve/reject requests are also in the access log, shown in the activity feed as
  "Approved care changes from a Bee note" / "Dismissed care changes from a Bee note".

## Bee API: confirmed vs assumed

Confirmed (docs.bee.computer/docs/proxy, bee-cli README): base URL and bearer auth;
`GET /v1/conversations/:id`; `POST /v1/todos { text, alarm_at }` with `alarm_at` sent as
ISO 8601 and returned as epoch ms; `GET /v1/stream?types=...` event names; `bee stream`
flags `--types`, `--agent`, `--json`, `--webhook-endpoint`, `--webhook-body` with
`{{message}}`; the agent line format; rate limit around 60 requests per minute.

Assumed, isolated in `http-bee-api.adapter.ts` and `bee-webhook.parser.ts`: the exact
conversation JSON (parsed tolerantly: bare or `{conversation}`, snake or camel case,
utterances top level or in `transcriptions[]`), the todo response shape, and the default
webhook body and content type.
