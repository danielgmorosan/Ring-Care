# 0004 — Critical-alert push (FCM/APNs), Critical Alerts entitlement, EU residency

Status: **proposed — needs founder sign-off before the FCM adapter is enabled** · Date: 2026-07-08 · Feature: F1.6

## Context

The primary way Obrigada gets a caregiver's attention during an incident is **not a
phone call** — it is a **critical push notification**: the kind that sounds even when
the phone is on silent or Do Not Disturb, like an earthquake or emergency alert. The
person granted the app permission to do this precisely because a missed fall is a
safety event, not a marketing ping. A call (Twilio, decision 0003) is a *fallback* for
reaching people who do not have the app.

The tech stack in CONTRIBUTING.md names this directly: *"Push: FCM and APNs (iOS uses the
Critical Alerts entitlement)."*

Two non-negotiable rules bear on it:

- **Rule #1** — only labels, timestamps, and the like leave the device. Push carries a
  short alert text and the target device token, never pixels or audio.
- **Rule #6** — EU-only infrastructure; no non-EU subprocessor without a recorded
  founder decision. Mobile push is unavoidably relayed by **Google (FCM)** and
  **Apple (APNs)** — there is no EU-only path to a phone's push system. This is a
  platform dependency, not an infrastructure choice, but it still routes a health-
  adjacent alert through non-EU processors and so is recorded here.

## What the code does today (safe by default)

- Push runs behind a dedicated **`PushPort`**, separate from calls/SMS. A
  **`CompositeNotificationAdapter`** routes each escalation channel to its provider:
  calls/SMS → Twilio-or-mock (0003), critical push → FCM-or-mock (this record).
- With **no** FCM service-account configured, the **`MockPushAdapter`** is used: it
  logs intent and notifies no device. This is the default in dev, CI, and any
  unconfigured environment.
- The **`FcmPushAdapter`** (this change) sends via FCM HTTP v1 — a high-priority
  Android message and an iOS `apns` payload marked `interruption-level: critical` with
  a critical sound. It is selected **only** when `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`,
  and `FCM_PRIVATE_KEY` are all set (service-account credentials from the vault, never
  the repo, never the APK).
- The escalation ladder already records every push on the append-only incident trail
  (`push_sent`), independent of which adapter runs.

## What must still be true to actually deliver a critical alert

Code alone cannot make a phone alarm through silent mode. It requires, outside this
repo:

1. **A Firebase project** (FCM) with the **APNs auth key** uploaded, so FCM can relay
   to iOS.
2. **An Apple Developer account** and the **Critical Alerts entitlement**, which Apple
   grants by request to genuine health/safety apps (Obrigada qualifies). Without it,
   pushes still arrive but respect silent/DND — they do not behave like an alarm.
3. A **native app build** (EAS dev build / TestFlight), not the Safari web build, so
   the app can register a device push token and present critical alerts.
4. The family app registering the caregiver's device token and storing it so the
   ladder has somewhere to push (follow-up change).

## Decision (to be completed by Souheila / Wil / Daniel)

Before setting FCM credentials in any environment with real family data, record here:

1. **Residency / legal basis** — accept FCM + APNs as necessary non-EU push relays;
   the DPA/SCCs with Google and Apple; that only minimized alert text (roles, times)
   and an opaque device token transit them; and how this fits the DPIA / Article 9.
2. **Critical Alerts** — the entitlement is requested and approved for the production
   iOS build; document the justification filed with Apple.
3. **Scope** — which environments may enable it (e.g. never in the EU pilot until 1–2
   are signed).

Until this is completed and marked **accepted**, the FCM adapter stays off and the
mock notifies no device.

## Consequences

- The escalation ladder's critical-alert channel is fully built and testable today
  with zero real pushes and no external calls.
- Turning on real critical alerts is a conscious, logged, reversible switch (unset the
  FCM credentials → back to the mock), gated on human sign-off — consistent with how
  cloud narration (0002) and outbound calls (0003) are gated.
