# Testing the guardian — the two-phone runbook

This is the hands-on guide to running the whole system on real hardware: the backend on
your machine, the family app on one phone (the caregiver), and the guardian app on another
(the wall device). It covers the four scenarios that matter — a fall, a stranger, a zone
crossing, and an offline replay.

You need two Android phones (or one phone + one emulator for the family app). The guardian
phone should be one you can safely lie down in front of.

---

## 1. Bring the backend up

From the repo root:

```bash
docker compose up -d                 # postgres, redis, emqx (mTLS), temporal
DATABASE_URL=postgresql://obrigada:obrigada@localhost:5433/obrigada pnpm --filter @obrigada/backend db:migrate
```

Generate the dev PKI (the CA the broker trusts and the device certs are signed by):

```bash
scripts/gen-dev-certs.sh backend     # backend's own client cert + the CA at certs/ca/
```

Make sure `apps/backend/.env` has the device CA configured so provisioning issues device
certificates (this is what lets the guardian open the mutual-TLS link):

```
DEVICE_CA_CERT_PATH=../../certs/ca/ca.crt
DEVICE_CA_KEY_PATH=../../certs/ca/ca.key
```

Start the backend:

```bash
pnpm --filter @obrigada/backend start:dev
```

On boot the log should confirm the escalation Temporal worker is running and MQTT
ingestion is connected/subscribed. Leave this running.

> Optional but recommended: set `ANTHROPIC_API_KEY` (incident narration) and Twilio/FCM
> keys if you want real calls/pushes. Without them the safe local mocks run and you still
> see incidents in the family app.

Find your machine's LAN IP (the phones need to reach it), e.g. `ipconfig getifaddr en0` on
macOS. Call it `<HOST_IP>` below.

---

## 2. Family app (the caregiver phone)

```bash
pnpm --filter @obrigada/family start   # Expo; scan the QR with the phone
```

Point it at your backend if it doesn't auto-detect: set the API base URL to
`http://<HOST_IP>:3000`. Sign up (this creates your family), then:

1. **Home → Register guardian** — give it a name ("Kitchen shelf").
2. Set **Voice check-in language** on the Home settings card to the elder's language
   (English or Português). This is what the guardian will speak.

---

## 3. Guardian app (the wall phone)

### Build with the model assets

Download the on-device models (git-ignored, see `apps/guardian/README.md`):

```bash
mkdir -p apps/guardian/app/src/main/assets
# Fall detection (pose)
curl -L -o apps/guardian/app/src/main/assets/pose_landmarker_lite.task \
  https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task
# Face detection
curl -L -o apps/guardian/app/src/main/assets/blaze_face_short_range.tflite \
  https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite
# Face embedding — drop in a MobileFaceNet-family model you trust, named
# mobile_face_net.tflite (see README). Run via raw TFLite; no metadata needed.
# Without it, recognition stays disabled (fall + voice + zones still work).
```

Open `apps/guardian/` in **Android Studio**, let it sync, and Run on the guardian phone
pointed at your backend:

```bash
# or from the command line (needs JDK 17):
cd apps/guardian
./gradlew installDebug -PbackendBaseUrl=http://<HOST_IP>:3000
```

### Pair

1. In the family app, tap **Pair this phone** on the guardian's card — it shows a code.
2. On the guardian, enter the code. The status pill turns **Watching** and the family app
   shows the guardian **online**.

### Set up recognition and zones (on the guardian)

- **Set up faces** (top-right) → enroll each household member, **including the elder**, so
  they are never flagged as a stranger. Hold the camera on each face and Capture.
- **Draw a zone** (top-right) → tap the corners of a hazard area (in front of the stove) or
  a doorway on the live preview, name it, pick **Hazard** or **Door**, Save.

---

## 4. The four scenarios

### A. Fall → check-in → escalation (the core test)

Stand in view, then lie down and stay down.

- Within ~1.5s the guardian emits `fall.suspected`; the backend opens an incident.
- The guardian speaks **"Are you okay?"** in the household language and listens.
  - Say **"I'm fine"** → the ladder **stands down**. No calls.
  - Stay **silent** → the ladder **presses on**.
  - Say **"help"** → **distress**, escalates immediately.
- Watch the family app **Timeline** for the incident and its steps; if Twilio/FCM keys are
  set, the caregiver phone rings/pushes.

### B. Stranger (requires at least one enrolled face)

Have someone **not enrolled** walk into view.

- The guardian emits `person.unknown`; the backend's stranger evaluator raises an alert.
- Check the family app **Alerts** tab — a **Stranger** sighting appears.
- Now pre-log a visit (Alerts → *Expecting someone?*) covering the current time and have
  them reappear — they should read as **Expected**, not a stranger. (A uniform never
  counts as trust on its own.)

### C. Zone crossing

Walk into a **Hazard** zone you drew (e.g. toward the stove).

- The guardian emits `zone.entry`; the backend turns a hazard entry into a family alert.
- Walk out a **Door** zone → `zone.exit` starts the wander/return logic.
- Check **Alerts** for the hazard alert.

### D. Offline replay (reliability)

Turn the guardian phone's wifi **off**, trigger a fall (lie down), then turn wifi back
**on** after ~20s.

- The event is queued to disk while offline and **replayed on reconnect** — the incident
  should still appear in the family app, not vanish. (Delivery is at-least-once; the
  backend de-duplicates on event id, so you won't get two incidents.)

### E. Remote wipe (decommission a lost phone)

Use the family app: **Home → the guardian's card → Decommission this phone** (confirm the
prompt). Or trigger it via the endpoint (JWT from signing in; `<DEVICE_ID>` from
`GET /me/devices`):

```bash
curl -X POST http://<HOST_IP>:3000/me/fleet/<DEVICE_ID>/wipe \
  -H "Authorization: Bearer <YOUR_JWT>"
```

- The command travels the device's cmd topic; the guardian **clears its identity, enrolled
  faces, and queued events**, acks `executed`, and returns to the pairing screen.
- Verify with `GET /me/fleet/<DEVICE_ID>/commands` — the wipe shows `executed`.
- The face embeddings are gone from the phone; nothing about them was ever in the cloud
  (rule #4).

---

## 5. Where to look

- **Family app** — Timeline (incidents + steps), Alerts (strangers, hazards, sightings,
  expected visits), Home (guardian online/offline, battery).
- **Backend logs** — ingestion (`Ingested <type> from device …`), escalation
  (`Started escalation …`, `Delivered on-device check-in …`), stranger/zone evaluators.
- **Temporal UI** — http://localhost:8233 shows the running escalation workflow per
  incident.

---

## 6. If something doesn't work

- **Guardian won't pair** — check the phone can reach `http://<HOST_IP>:3000` (same
  network, no VPN); confirm the code hasn't expired (15 min).
- **Status pill stuck on Connecting/Offline** — the device CA must be configured
  (`DEVICE_CA_*` in `apps/backend/.env`) so provisioning issued a cert; EMQX must accept
  the phone's TLS version (phones below API 29 use TLS 1.2 — EMQX allows it).
- **No fall detected** — the pose model asset must be present; make sure the person is
  fully in frame and the phone is roughly upright on the wall.
- **Everyone flagged as a stranger** — you enrolled family but not the elder, or the face
  embedder model/threshold needs tuning (`FaceMatcher.DEFAULT_THRESHOLD`).
- **Zones fire in the wrong place** — preview vs pose coordinate alignment may need
  calibration (front-camera mirroring/rotation); see the note in `apps/guardian/README.md`.
- **Check-in speaks the wrong language / default voice** — set the household language in
  the family app; the European Portuguese TTS voice may need installing in the phone's
  text-to-speech settings.

Report what you see (which scenario, what happened, any logs) and I'll fix it.
