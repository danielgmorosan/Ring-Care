# Friction log

What got in our way while building Obrigada on Ring, Bee and Amazon Bedrock. The entries
below were pre-filled from code comments, guards and fallbacks in
`apps/backend/src/modules/ring`, `bee` and `ai`. Entries marked **Team to confirm** are
inferred from the code; someone who did the hands-on work should confirm or correct them,
and fill in the timings.

Severity: **Blocker** (could not proceed), **High** (needed a workaround that cost hours or
changes the design), **Medium** (slowed us down), **Low** (papercut).

## Template

```md
### <Short title>

- **Product:** Ring Partner API | Ring Developer Playground | Bee CLI/API | Amazon Bedrock
- **Task:** what we were trying to do
- **Steps:** 1. ... 2. ... 3. ...
- **Expected:** ...
- **Actual:** ...
- **Severity:** Blocker | High | Medium | Low
- **Time lost:** ...
- **Workaround:** ...
- **Suggestion:** ...
- **Status:** Confirmed | Team to confirm
```

---

## Ring

### Ring webhook payload schema not available in a fetchable form

- **Product:** Ring Partner API
- **Task:** Parse motion and doorbell notifications reliably.
- **Steps:** 1. Look for the notification schema and sample payloads. 2. Try to fetch the
  developer pages while building. 3. Write the parser.
- **Expected:** A published schema or sample body per event type (`motion_detected`,
  `button_press`, `device_online`, `device_offline`), including where the event id, device
  id, Smart Alert label and timestamp live.
- **Actual:** The developer pages were unreachable from our build environment, so the exact
  shape was not pinned down (comment in `ring-webhook.parser.ts`). We did not know whether
  the body is flat or a JSON:API envelope.
- **Severity:** High
- **Time lost:** [TEAM TO FILL]
- **Workaround:** A tolerant parser that accepts flat fields, a JSON:API envelope, or a mix,
  falls back to a body digest when no event id is present, and is pinned by fixtures under
  `src/modules/ring/fixtures`.
- **Suggestion:** Publish a JSON Schema and one real sample per event type, reachable
  without a login, and version it.
- **Status:** Team to confirm against a real Ring delivery.

### The Playground does not deliver webhooks

- **Product:** Ring Developer Playground
- **Task:** Exercise our webhook intake end to end.
- **Steps:** 1. Get a Playground token. 2. Register our webhook URL. 3. Trigger motion.
- **Expected:** A signed webhook arrives at our backend.
- **Actual:** No webhook delivery from the Playground to a partner backend.
- **Severity:** High
- **Time lost:** [TEAM TO FILL]
- **Workaround:** `pnpm --filter @obrigada/backend ring:sim`, which signs events exactly as
  Ring does and labels them as simulated.
- **Suggestion:** Deliver webhooks from the Playground, or offer a "send test event"
  button per event type.
- **Status:** Team to confirm.

### Playground tokens last about 30 minutes and cannot be refreshed

- **Product:** Ring Developer Playground
- **Task:** Keep a demo backend connected to Ring through a rehearsal.
- **Steps:** 1. Copy a Playground token into `RING_ACCESS_TOKEN`. 2. Start the backend.
  3. Sync cameras or open live view half an hour later.
- **Expected:** The token lasts a working session, or can be refreshed.
- **Actual:** The token expires after about 30 minutes and has no refresh path. The backend
  logs a warning at boot in Playground mode (`ring.module.ts`) and a 401 cannot be retried.
- **Severity:** Medium
- **Time lost:** [TEAM TO FILL]
- **Workaround:** Get a fresh token right before each take. Use the simulator for events.
- **Suggestion:** A longer-lived sandbox token, or a sandbox OAuth client with refresh.
- **Status:** Team to confirm the exact lifetime.

### Refresh tokens rotate on every exchange

- **Product:** Ring Partner API
- **Task:** Keep OAuth mode working across restarts.
- **Steps:** 1. Exchange `RING_REFRESH_TOKEN` at `/oauth/token`. 2. Restart the backend.
  3. Exchange again with the original token.
- **Expected:** Clear guidance on rotation.
- **Actual:** Ring rotates the refresh token on each exchange. We keep the rotated token in
  memory only, so after a restart the original env token may already be revoked
  (`ring-token.provider.ts`).
- **Severity:** Medium (High in production)
- **Workaround:** None in this build beyond re-linking. Production must persist the rotated
  token in the secret store.
- **Suggestion:** Document rotation and the revocation window prominently.
- **Status:** Team to confirm with a real OAuth client.

### Webhook-created cameras have no name

- **Product:** Ring Partner API (our integration)
- **Task:** Show a friendly camera name in the family app.
- **Steps:** 1. Receive a webhook for a device we have not synced. 2. Open the Ring screen.
- **Expected:** A name like "Front Door".
- **Actual:** Webhooks carry a device id only. The camera is created unnamed and placed as
  `other` until a device sync or the caregiver sets the placement.
- **Severity:** Low
- **Workaround:** Sync cameras when a token is available; set placement in the app.
- **Suggestion:** Include the device name, or at least the device kind, in the webhook.
- **Status:** Confirmed from the code.

## Bee

### Conversation JSON shape is undocumented

- **Product:** Bee API
- **Task:** Fetch the caregiver's note with `GET /v1/conversations/:id` and read the text.
- **Steps:** 1. Read docs.bee.computer. 2. Write the adapter.
- **Expected:** A documented response shape.
- **Actual:** The base URL, auth, routes, todo body and rate limit are documented. The
  conversation body is not. We do not know if it is bare or wrapped, snake or camel case,
  or where utterances live (`http-bee-api.adapter.ts`, "Assumed (TODO confirm against a
  real response)").
- **Severity:** High
- **Time lost:** [TEAM TO FILL]
- **Workaround:** Tolerant parsing of all those variants, isolated in one file.
- **Suggestion:** Publish the response schema with an example.
- **Status:** Team to confirm against a real response.

### Default webhook body and auth header for `bee stream`

- **Product:** Bee CLI
- **Task:** Authenticate and parse what `bee stream --webhook-endpoint` posts.
- **Steps:** 1. Run `bee stream --webhook-endpoint <url>`. 2. Inspect the request.
- **Expected:** A documented body and content type, and a way to send a secret header.
- **Actual:** The default body and content type are not documented. There is no documented
  header option, so the shared secret goes in the query string. A body sent as
  `application/json` that is not valid JSON is refused by our parser.
- **Severity:** Medium
- **Workaround:** Secret as `?secret=`; `--webhook-body '{{message}}'`; or a relay that pipes
  `bee stream --agent` lines into `curl` with a bearer header (`docs/hackathon/bee.md`).
- **Suggestion:** Document the body and add `--webhook-header`.
- **Status:** Team to confirm with a real stream.

### `bee stream` must run as a long-lived process

- **Product:** Bee CLI
- **Task:** Receive new conversations on the backend.
- **Steps:** 1. Run `bee login` and `bee stream` on a machine. 2. Keep it running.
- **Expected:** A server-side webhook registration.
- **Actual:** Events only arrive while a CLI process logged in as the caregiver is running.
- **Severity:** High for production, Low for the demo
- **Workaround:** Run it as a sidecar for the demo.
- **Suggestion:** Register webhooks through the API, per account, with retries.
- **Status:** Confirmed from the design.

### Developer mode needs a paired device

- **Product:** Bee
- **Task:** Get a developer token and stream events.
- **Steps:** 1. Enable developer mode. 2. Log in to the CLI.
- **Expected:** A token without hardware for early development.
- **Actual:** Developer mode needed a paired device.
- **Severity:** Medium
- **Time lost:** [TEAM TO FILL]
- **Workaround:** The mock Bee adapter serves a demo note for `demo*` conversation ids.
- **Suggestion:** A sandbox account with sample conversations.
- **Status:** Team to confirm.

## Amazon Bedrock

### New accounts may start with zero quota

- **Product:** Amazon Bedrock
- **Task:** Make a first Converse call in `eu-central-1`.
- **Steps:** 1. Request model access. 2. Call Converse with an `eu.` profile.
- **Expected:** A small default quota.
- **Actual:** New accounts may have zero or very low on-demand quota, which surfaces as
  `ThrottlingException` or `ServiceQuotaExceededException`. Our adapter maps both to a
  "throttled" error and the narrator falls back to the local mock.
- **Severity:** High if it hits on demo day
- **Time lost:** [TEAM TO FILL]
- **Workaround:** Request a quota increase early; the mock keeps the product working.
- **Suggestion:** A clear console banner when a quota is zero, with the request link.
- **Status:** Team to confirm on our account.

### IAM for inference profiles is easy to get wrong

- **Product:** Amazon Bedrock, IAM
- **Task:** Least-privilege access to one EU inference profile.
- **Steps:** 1. Allow `bedrock:InvokeModel` on the profile ARN. 2. Call Converse.
- **Expected:** The call succeeds.
- **Actual:** You must also allow the underlying foundation model in every destination
  region of the profile. Missing that gives `AccessDeniedException`.
- **Severity:** Medium
- **Workaround:** The two-statement policy in `docs/hackathon/aws-bedrock.md`.
- **Suggestion:** Generate the policy from the profile's console page.
- **Status:** Team to confirm.

### Finding the EU inference profile id

- **Product:** Amazon Bedrock console
- **Task:** Copy the right `eu.` profile id.
- **Steps:** 1. Open Bedrock in Frankfurt. 2. Look for cross-region inference.
- **Expected:** One obvious place.
- **Actual:** The page sits under different menus depending on the console version, and a
  wrong id gives `ValidationException` or `ResourceNotFoundException`.
- **Severity:** Low
- **Workaround:** Copy the id from the console, never from memory.
- **Suggestion:** Show the profile id next to the model on the model access page.
- **Status:** Team to confirm.

## Our own tooling

### `ring:sim --help` prints usage with an error

- **Product:** Our simulator
- **Actual:** `--help` is read as an option that needs a value, so it prints "--help needs
  a value" and the usage line, and exits 2.
- **Severity:** Low
- **Suggestion:** Treat `--help` as a flag. Small fix after the hackathon.
- **Status:** Confirmed by running it.

### Calls do not wait for an answer

- **Product:** Our Twilio adapter
- **Actual:** Call creation cannot report whether a person answered, so `placeCall` returns
  "not answered" at once. The ladder rings every contact within seconds, then texts everyone.
  This is the safe choice (never believe someone answered when they did not), but it is not
  the paced ladder we want.
- **Severity:** Medium
- **Suggestion:** Twilio status callbacks or answering-machine detection, so each contact
  gets the full ring window. Tracked as a follow-up.
- **Status:** Confirmed from the code.
