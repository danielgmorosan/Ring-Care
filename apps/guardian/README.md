# Obrigada Guardian (Android)

The guardian device app. A recycled Android phone runs this on a wall: it pairs to a
family, opens the mutual-TLS MQTT link to the backend, and sends heartbeats so the family
app shows it online. This is the **F1.1 foundation** — pairing, secure identity, the device
link, and a camera preview. Perception (fall detection, recognition, zones, voice) lands in
later steps and feeds events into the same link.

## What it does today

- **Pairing** — the caregiver reads a claim code from the family app and types it here.
  The phone calls `POST /provision`, receives its identity, and stores it encrypted.
- **Secure identity** — device token and the per-device mutual-TLS key/cert live in
  `EncryptedSharedPreferences` (hardware-backed master key). Nothing is ever uploaded.
- **Device link** — Eclipse Paho connects to EMQX over mutual TLS using the issued
  certificate (the broker derives the MQTT username from the cert CN). Auto-reconnects.
- **Heartbeats** — a foreground service publishes a heartbeat to `obrigada/dev/<id>/heartbeat`
  on the interval the backend chose, so the phone shows online in the fleet view.
- **Camera preview + kiosk** — a full-screen front-camera preview with a connection-status
  pill; best-effort lock-task so a confused elder cannot navigate away.

- **Fall detection (F1.2)** — a MediaPipe Pose analyzer runs on each frame; a deterministic
  heuristic watches for a person who is horizontal and low in the frame and stays down.
  Sustained briefly → `fall.suspected`; past the check-in window → `fall.confirmed`. Both
  are published over the link as skeletal events and drive the backend escalation ladder.

- **Voice check-in (F1.3)** — when a fall is first suspected, the guardian speaks "Are you
  okay?" in the household's language (set in the family app) and listens. The answer is
  classified on-device — distress words escalate, an ordinary reply stands the alert down,
  silence presses on — and sent as a `voice.checkin_result` event that drives the backend
  ladder. Speech synthesis and recognition run locally; only the label leaves.

- **Face recognition + stranger detection (F2.2/F2.4)** — the guardian detects a face,
  embeds it on-device, and matches it against the enrolled household. A known member emits
  `person.known`; anyone unrecognized emits `person.unknown`, which the backend's stranger
  evaluator turns into an alert (a uniform is context, never trust — rule #5). Face vectors
  and enrollment stay on the phone, encrypted, and never reach the cloud (rule #4). Enroll
  household members from the **Set up faces** control on the guardian screen — until at
  least one person is enrolled, recognition stays silent so the elder is never flagged.

- **Zones (F2.3)** — draw hazard areas (stove, stairs) and doorways on the guardian's own
  camera view via **Draw a zone**: tap the corners, name it, pick hazard or door. The
  device runs point-in-polygon geometry on the person's feet and emits `zone.entry` /
  `zone.exit`, which the backend turns into hazard alerts and door/wander logic. Zones are
  drawn on the device because the camera view never leaves it (rule #1); only the normalized
  polygon and, later, the zone id are sent.

- **Remote wipe (F2.6)** — the guardian listens on its command topic; a caregiver-issued
  wipe (`POST /me/devices/:id/wipe`) makes it clear its identity, enrolled faces, and queued
  events, ack, and return to pairing. For decommissioning a lost or retired phone. The face
  embeddings are erased from the device; nothing about them was ever in the cloud (rule #4).

Privacy (CLAUDE.md rule #1): the frame is read in memory and discarded; only the skeleton
(keypoints, confidences, timestamps) leaves — never pixels, never audio. The voice check-in
recognizes speech on-device and emits only the result label, never the recording. Face
recognition emits only person.known / person.unknown labels; the face vector stays on-device.
Zones are normalized polygons and zone ids — never a frame.

> Coordinate alignment: zones are drawn in preview space and geometry runs in the pose's
> upright, unmirrored space. On a wall-mounted phone these line up closely; front-camera
> mirroring and rotation may need calibration during on-device testing.

### Enable fall detection: add the pose model

Fall detection needs the MediaPipe pose model, which is not committed (it's a ~5 MB binary
and not ours to redistribute). Download it once into the assets folder:

```bash
mkdir -p apps/guardian/app/src/main/assets
curl -L -o apps/guardian/app/src/main/assets/pose_landmarker_lite.task \
  https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task
```

Without the model the app still runs — the camera previews and the link works — but pose
analysis is disabled (logged once). Drop the file in and rebuild to turn it on.

### Enable face recognition: add the face models

Face recognition needs two model assets in `app/src/main/assets/`, both git-ignored:

- `blaze_face_short_range.tflite` — the MediaPipe face detector:
  ```bash
  curl -L -o apps/guardian/app/src/main/assets/blaze_face_short_range.tflite \
    https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite
  ```
- `mobile_face_net.tflite` — the face-embedding model. This is **not** an off-the-shelf
  MediaPipe asset and pulling a face model off a random URL is a supply-chain risk we don't
  take (biometrics are Article 9 data), so **you supply a MobileFaceNet-family model you
  trust** and name it `mobile_face_net.tflite`. It's run via a raw TFLite interpreter
  (`TfLiteFaceEmbedder`), which reads the input/output tensor shapes from the model — so a
  112×112 input and a 128- or 192-d embedding both work, no MediaPipe metadata needed. Both
  single-face models (batch 1) and InsightFace-style pair comparators (batch 2) are accepted
  — the embedder fills the batch with the same face and reads the first row. Recognition
  stays disabled (logged once) until this file is present; the rest of the guardian runs
  regardless.

The embedder normalizes pixels as `(px − 127.5) / 128` (standard MobileFaceNet). If your
model expects different preprocessing, adjust `TfLiteFaceEmbedder.toInputBuffer`. The
recognition threshold (`FaceMatcher.DEFAULT_THRESHOLD`) is a first pass — tune it for your
model against the enrolled faces during on-device testing.

## Build & run

Open `apps/guardian/` in **Android Studio** (Ladybug or newer) and let it sync — it will
generate the Gradle wrapper jar and download the SDK bits. Then Run on a device or emulator.

Command-line builds need **JDK 17** (AGP 8.7). Android Studio uses its bundled JDK, so the
IDE path needs nothing extra. From the command line (once the wrapper jar exists — Android
Studio creates it, or run `gradle wrapper` with a local Gradle 8.9):

```bash
cd apps/guardian
./gradlew assembleDebug        # build the APK
./gradlew installDebug         # install on a connected device
```

### Point the app at your backend

The backend base URL is a build config value. It defaults to `http://10.0.2.2:3000`
(the host machine's `localhost` as seen from the Android emulator). Override it:

```bash
./gradlew assembleDebug -PbackendBaseUrl=http://192.168.1.50:3000
```

Use your machine's LAN IP when testing on a **physical** phone. For production, pass an
`https://` URL. The MQTT link is always encrypted regardless of this setting.

### Two-phone test (what you'll do)

1. Run the backend locally (docker stack + `pnpm --filter @obrigada/backend start:dev`) with
   the device CA configured (`DEVICE_CA_CERT_PATH` / `DEVICE_CA_KEY_PATH`) so provisioning
   issues certs.
2. In the family app, register a device and generate a pairing code.
3. Install this app on the guardian phone, enter the code, and pair.
4. The status pill turns to **Watching** and the family app shows the guardian online.

## Notes & known follow-ups

- **True kiosk** needs this app set as device owner:
  `adb shell dpm set-device-owner ai.obrigada.guardian/.admin.GuardianAdminReceiver`
  (admin receiver is a later step). Without it, lock-task shows a one-time "screen pinned"
  prompt — fine for testing.
- **Adaptive frame rate** — the guardian runs on weak donated phones, so perception eases
  off as the phone heats up or the battery drains (`FrameGovernor` widens the gap between
  processed frames with thermal status and battery level) — but never stops: even under
  extreme stress it still looks at least every 3 seconds. Thermal status needs API 29+;
  older phones lean on the battery signal.
- **TLS version** — the link negotiates the highest TLS both sides support. Phones below
  API 29 top out at TLS 1.2, which EMQX also accepts; API 29+ use TLS 1.3.
- **Voice check-in** needs the microphone (granted on first run) and an on-device speech
  recognizer. Where recognition is unavailable, the guardian still speaks the prompt and
  records the answer as silence, so the ladder proceeds rather than stalling. The
  European Portuguese TTS voice may need to be installed in the phone's text-to-speech
  settings; without it the prompt falls back to the default voice.
- **BouncyCastle** parses the PEM identity. If a device rejects `bcprov-jdk18on`, switch to
  `bcprov-jdk15to18` in `gradle/libs.versions.toml`.
- This module is a standalone Gradle project. It is intentionally outside the pnpm
  workspace (no `package.json`) and is not built by the web CI.
