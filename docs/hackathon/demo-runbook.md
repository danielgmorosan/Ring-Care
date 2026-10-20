# Demo runbook

How to stage every scene of the demo video on one laptop, with the family app in a browser
and, if Twilio is set up, real phones ringing. Scenes match
[video-script.md](./video-script.md).

Anything marked **(verify)** was read from the code but not run end to end. Do a full dry
run before filming.

## 0. What you need

- Node 22+, pnpm 10, Docker. `pnpm install` done at the repo root.
- Two or three phones for the contacts (Sofia, Miguel, the neighbour) if you want real
  calls. Otherwise the mock logs each call.
- Optional: AWS credentials with Bedrock access in `eu-central-1`
  ([aws-bedrock.md](./aws-bedrock.md)), a Twilio account, a Bee account with the CLI
  logged in ([bee.md](./bee.md)), a Ring Developer Playground token.
- A shell helper used below:

```sh
B=http://localhost:3000
json() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)"; }
iso()  { node -e "console.log(new Date(Date.now()+($1)*60e3).toISOString())"; }  # minutes from now
```

## 1. Bring the stack up

```sh
docker compose up -d postgres redis temporal
DATABASE_URL=postgres://obrigada:obrigada@localhost:5433/obrigada pnpm db:migrate
cp apps/backend/.env.example apps/backend/.env
```

Edit `apps/backend/.env`:

```sh
# Comment out MQTT_* and DEVICE_CA_* unless you ran scripts/gen-dev-certs.sh.
# Keep DATABASE_URL (the family must survive a restart) and TEMPORAL_ADDRESS (calls).

RING_HMAC_SECRET=demo-ring-secret-change-me
BEE_WEBHOOK_SECRET=demo-bee-secret-change-me
VISIT_ARRIVAL_GRACE_MINUTES=2          # so the no-show scene takes minutes, not 20
# RING_FAMILY_ID and BEE_FAMILY_ID come in step 2.
```

Postgres is required for this demo. `RING_FAMILY_ID` is read at boot and the family is
created after boot, so an in-memory backend would lose the family on the restart in
step 2.

Start the backend in its own terminal:

```sh
pnpm backend:dev
curl -s $B/health/ready
```

## 2. Seed the family

Sign up the caregiver. The timezone is the elder's home; it sets the night window and every
time the family reads.

```sh
SIGNUP=$(curl -s -X POST $B/auth/signup -H 'content-type: application/json' -d '{
  "email":"sofia@example.com","password":"demo-pass-123",
  "familyName":"Ferreira","timezone":"Europe/Lisbon"}')
TOKEN=$(echo "$SIGNUP" | json "['token']")
FAMILY=$(echo "$SIGNUP" | json "['family']['id']")
echo "$FAMILY"
```

If the account already exists, use `POST /auth/login` with `{email, password}`; it returns
the same shape. `GET /auth/me` also shows `family.id`.

Add the family id to `apps/backend/.env`, then stop and restart `pnpm backend:dev`:

```sh
RING_FAMILY_ID=<FAMILY>
BEE_FAMILY_ID=<FAMILY>
```

After the restart, log in again only if you lost `$TOKEN` (the JWT lasts `JWT_TTL`, 7 days
by default).

### Contacts: Sofia, Miguel, the neighbour

Priority 0 is called first. Phones must be E.164. Sofia has quiet hours, to show that the
night door ladder wakes her anyway.

```sh
AUTH="authorization: Bearer $TOKEN"
CT='content-type: application/json'

curl -s -X POST $B/me/contacts -H "$AUTH" -H "$CT" -d '{
  "name":"Sofia","role":"daughter","phone":"+3519XXXXXXXX","priority":0,
  "quietHours":{"start":"22:00","end":"07:00","wakeForConfirmedFallOnly":true}}'

curl -s -X POST $B/me/contacts -H "$AUTH" -H "$CT" -d '{
  "name":"Miguel","role":"son","phone":"+3519XXXXXXXX","priority":1}'

curl -s -X POST $B/me/contacts -H "$AUTH" -H "$CT" -d '{
  "name":"Rosa","role":"neighbour","phone":"+3519XXXXXXXX","priority":2}'

curl -s $B/me/contacts -H "$AUTH"
```

Two facts from the code that matter on camera:

- `wakeForConfirmedFallOnly` must be `true` for a contact with quiet hours, or the night
  door ladder skips her. The night door rule set treats itself like a confirmed fall for
  quiet hours, and the quiet-hours check honours that flag only.
- Quiet-hours times are compared with the current UTC clock, not the household clock
  (`shouldSkipForQuietHours` in `escalation/temporal/types.ts`). Lisbon is UTC+1 until
  25 October 2026 and UTC+0 after. **(verify)** that this is intended.

### The elder's voice check-in language

For an English video keep the default. For Portuguese:

```sh
curl -s -X PATCH $B/me/family -H "$AUTH" -H "$CT" -d '{"checkinLanguage":"pt-PT"}'
```

### Expected visits (Anna)

Two visits: one Anna keeps (arrival scene) and one she misses (no-show scene). Log the
no-show visit only when you are ready to film that scene, because the sweep runs every
minute.

```sh
# Arrival scene: a window open from now for three hours.
curl -s -X POST $B/me/visits -H "$AUTH" -H "$CT" -d "{
  \"visitorLabel\":\"Anna\",\"startsAt\":\"$(iso 0)\",\"endsAt\":\"$(iso 180)\",
  \"notes\":\"Morning carer visit\"}"
curl -s $B/me/visits -H "$AUTH"
```

A doorbell from 15 minutes before the start to the end of the window counts as the
arrival. Activity during a visit never opens an incident.

## 3. Ring camera: create it and set it to the front door

Night door logic only looks at cameras placed at `front_door`. A camera first seen in a
webhook starts as `other` with an empty name.

With a Playground token (`RING_ACCESS_TOKEN` in `.env`), sync the real devices instead:
`curl -s -X POST $B/me/ring/cameras/sync -H "$AUTH"`. Doorbells come in as `front_door`.
**(verify)** with a live token, which lasts about 30 minutes.

Without Ring access, let the simulator create the camera with a harmless daytime event:

```sh
export TZ=Europe/Lisbon RING_HMAC_SECRET=demo-ring-secret-change-me

pnpm --filter @obrigada/backend ring:sim --scenario daytime-motion
# POST /ring/webhook -> 200 {"ok":true,"duplicate":false}
```

Then set the placement:

```sh
CAM=$(curl -s $B/me/ring/cameras -H "$AUTH" | json "[0]['id']")
curl -s -X PATCH $B/me/ring/cameras/$CAM -H "$AUTH" -H "$CT" -d '{"placement":"front_door"}'
```

Or in the app: Home, Open Ring, pick **Front door** on the camera. The placement picker
offers Front door, Inside and Other.

Set `TZ` to the household's zone for every simulator run. The simulator turns "03:04"
into an instant using the machine's clock zone.

## 4. Open the family app

```sh
EXPO_PUBLIC_API_URL=http://localhost:3000 pnpm --filter @obrigada/family web
```

Log in as `sofia@example.com` / `demo-pass-123`. The first login in a browser shows
onboarding once; finish it. **(verify)** whether onboarding offers to add contacts again;
skip any step that would duplicate them.

Keep this browser window for filming. On a phone, use Expo Go with
`EXPO_PUBLIC_API_URL=http://<laptop LAN IP>:3000`.

## 5. Scenes

### Scene A: night exit (the hero)

The story happens at 3 a.m. You can film at any hour: the simulator stamps the event at the
most recent 03:04 household time, and the ladder runs now.

```sh
TZ=Europe/Lisbon RING_HMAC_SECRET=demo-ring-secret-change-me \
  pnpm --filter @obrigada/backend ring:sim --scenario night-exit
```

Make sure no visit window covers 03:04, or it counts as a visit, not a night exit.

What happens:

1. `POST /ring/webhook -> 200`. The event is recorded first, then judged.
2. Backend log: `Night door activity ... opened incident <id>`.
3. The Temporal workflow opens a `door.night_activity` incident with no voice check-in and
   no emergency step. It pushes the caregivers' registered devices:
   "Someone was at the front door at 3:04. We're calling Sofia now."
4. Calls go down the chain in priority order: Sofia, then Miguel, then Rosa. Sofia is
   rung inside her quiet hours.
5. If nobody answers, every contact gets a text and push: "Someone was at the front door
   at 3:04. We haven't reached anyone by phone yet. Please check on home." The ladder ends
   with outcome `family_alerted`. It never calls 112.
6. Family app, Timeline: "Front door at night", "Seen by Ring at the front door", then each
   call step, then the outcome chip.
7. Home, Open Ring: the activity row carries **Night door** and **Simulated** labels.

Important for filming:

- **Twilio calls do not detect an answer yet.** `TwilioNotificationAdapter.placeCall`
  returns "not answered" as soon as the call is created, so the ladder rings Sofia, Miguel
  and Rosa within seconds of each other and then texts everyone. The mock behaves the same.
  To show "Sofia acknowledged", open the incident in the app and tap **I'm handling this**
  (`POST /incidents/:id/acknowledge`), then **All clear** (`POST /incidents/:id/resolve`).
  The timeline then shows who responded. Tap quickly: the ladder may finish before you do.
  **(verify)** the timing on a dry run, or show the acknowledgement on a second run.
- A second Ring event within 10 minutes joins the same incident. Wait 10 minutes, or let the
  incident finish, before re-running the scene.
- "Through Do Not Disturb": a Twilio call is an ordinary call. On Sofia's iPhone, save the
  Twilio number as a contact with Emergency Bypass on, or film the critical push from a
  native build with FCM and APNs critical alerts. The web app gets no push.
- Live view: Open Ring, **See live**. With the mock Ring client the backend returns a
  placeholder SDP answer, so no picture appears. Real live view needs a Ring token and a
  device. Never film a real person's door without consent.

### Scene B: the fall indoors

Best: the guardian phone with real fall detection, filmed on our own test footage
([../testing-the-guardian.md](../testing-the-guardian.md)).

Without a guardian phone, start a fall incident through the operational endpoint. The
device must belong to the family:

```sh
DEV=$(curl -s -X POST $B/me/devices -H "$AUTH" -H "$CT" -d '{"name":"Kitchen shelf"}' | json "['id']")
INC=$(curl -s -X POST $B/incidents -H "$AUTH" -H "$CT" -d "{
  \"deviceId\":\"$DEV\",\"reason\":\"fall.suspected\",\"initialCheckin\":\"pending\"}" \
  | json "['incidentId']")
# The voice check-in answers within 20 s, or silence is assumed:
curl -s -X POST $B/incidents/$INC/checkin -H "$AUTH" -H "$CT" -d '{"result":"distress"}'
```

What happens: the full fall ladder. Voice check-in result, push, calls in order, then texts
and the emergency step. With Twilio the emergency step is logged as "emergency not wired",
and the mock logs "would notify emergency services". Nobody real is dialled. The timeline
shows "Possible fall" and the narrative.

Do not film Scene B with real emergency numbers configured anywhere.

### Scene C: carer arrival and no-show

Arrival (the Anna visit from step 2 must be open):

```sh
TZ=Europe/Lisbon RING_HMAC_SECRET=demo-ring-secret-change-me \
  pnpm --filter @obrigada/backend ring:sim --scenario carer-arrival
curl -s $B/me/visits/arrivals -H "$AUTH"
# [{"visitorLabel":"Anna", ... "text":"Anna arrived at 10:02."}]
```

The Ring activity row shows **Visit arrival**. The timeline shows the arrival. **(verify)**
which screen shows arrivals most clearly for the camera.

No-show (nothing is sent; a no-show is the absence of a doorbell):

```sh
curl -s -X POST $B/me/visits -H "$AUTH" -H "$CT" -d "{
  \"visitorLabel\":\"Anna\",\"startsAt\":\"$(iso 0)\",\"endsAt\":\"$(iso 60)\"}"
# wait VISIT_ARRIVAL_GRACE_MINUTES (2) plus up to a minute for the sweep
curl -s $B/me/alerts -H "$AUTH"
```

Expected alert, kind `visit.no_show`: "Anna was expected at 10:15 and hasn't arrived yet.
Open the app to check in." Alerts tab label: "Visit didn't happen". Send no doorbell or
person event while this visit is open: it would count as this visit's arrival, because the
earlier visit already has one.

### Scene D: Bee voice note to care plan

Real Bee. On a machine logged in to Sofia's Bee account:

```sh
bee login
bee stream \
  --types new-conversation,update-conversation-summary \
  --webhook-endpoint "http://localhost:3000/bee/webhook?secret=demo-bee-secret-change-me"
```

With `BEE_API_TOKEN` set in `.env`, the backend fetches the conversation from the Bee API.
Sofia speaks to her watch after the GP visit, in her own words:

> "Mom's Donepezil goes to 5 mg at 8 pm from Monday, blood test in two weeks, pick up the
> new prescription."

If the default webhook body carries no conversation id, add `--webhook-body '{{message}}'`,
or use the relay in [bee.md](./bee.md). **(verify)** on a real account, including how long
Bee takes to emit `new-conversation` after she stops speaking.

Mock Bee (no `BEE_API_TOKEN`): any conversation id starting with `demo` returns the note
above.

```sh
curl -s -X POST "$B/bee/webhook?secret=demo-bee-secret-change-me" -H "$CT" \
  -d '{"event":"new-conversation","data":{"conversation":{"id":"demo-1"}}}'
# 202
curl -s "$B/me/care/proposals?status=pending" -H "$AUTH"
```

In the app: Care tab, the proposals inbox. Three items: a medication change (Donepezil to
5 mg at 20:00 from the next Monday), an appointment (blood test in two weeks) and a to-do
(pick up the prescription). Approve all, or pick some. Approval creates Bee todos with
alarms; the mock logs `Mock Bee todo: "..."`. The activity feed says "Approved care changes
from a Bee note."

Each conversation id makes one proposal. Use `demo-2`, `demo-3` for retakes.

### Scene E: "How was Mom today?"

After the other scenes, so the record has something in it:

```sh
curl -s -X POST $B/me/ask -H "$AUTH" -H "$CT" -d '{"question":"How was Mom today?"}'
curl -s $B/me/summary/today -H "$AUTH"
```

In the app: Home, "A question about the home", **Ask**.

## 6. Bedrock check

Set in `.env` and restart:

```sh
AI_PROVIDER=bedrock
BEDROCK_REGION=eu-central-1
BEDROCK_MODEL_ID=eu.<profile id copied from the console>
```

with AWS credentials in the shell (`AWS_PROFILE=...` or exported keys).

- The backend refuses to boot with a non-EU region or a `us.`, `apac.` or `global.`
  profile. Good for one second of the video.
- On each call the log shows `bedrock converse ok model=eu.… region=eu-central-1 … ms=…`.
- The mock answer always starts with "Here is what I can tell you from the record." A
  Bedrock answer reads like a direct reply.
- On failure: `Narration adapter failed, using local mock: Bedrock call failed: ...`.
  `AccessDeniedException` means model access or IAM. `ValidationException` or
  `ResourceNotFoundException` usually means the profile id is wrong for the region.
  `ThrottlingException` or `ServiceQuotaExceededException` on a new account may mean a
  zero default quota; request an increase early.

## 7. Fallbacks if something is unavailable

| Missing | What still works | How to film it |
| --- | --- | --- |
| Twilio | The full ladder runs on the mock. Each call and text is a log line with the words. | Show the timeline and the backend log side by side. Label "Simulated calls". |
| Bedrock | The deterministic mock writes narratives, summaries and answers. Bee extraction falls back to the rules extractor. | Unset `AI_PROVIDER` or set `mock`. Do not claim Bedrock wrote the words on screen. |
| Ring access | The signed simulator posts the same webhook shape Ring sends. | Label "Simulated event". The app marks those rows Simulated. |
| Ring Playground webhooks | The Playground does not deliver webhooks to us. | Use the simulator for events; use the Playground for the device list and API calls only, labelled "Ring Developer Playground". |
| Bee account | The mock Bee returns the demo note for `demo*` ids. | Label "Simulated Bee note". |
| Temporal down | Night door activity still raises a family alert, with no calls. | Avoid; restart `docker compose up -d temporal`. |
| Push | No push on web. | Film calls or the timeline instead. |

## 8. Reset between takes

- Incidents, Ring events and arrivals are append-only by design. For a clean slate, recreate
  the database: `docker compose down -v`, `docker compose up -d postgres redis temporal`,
  migrate, and repeat step 2 with the new family id.
- Or sign up a second family (`sofia2@example.com`) and point `RING_FAMILY_ID` and
  `BEE_FAMILY_ID` at it.
