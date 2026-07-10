# 0003 — Twilio outbound calls/SMS and EU data residency

Status: **proposed — needs founder sign-off before the Twilio adapter is enabled** · Date: 2026-07-08 · Feature: F1.5

## Context

Escalation ends by reaching a human: "call the daughter, wait 45 seconds, call the
son, then emergency." The tech stack in CLAUDE.md chooses Twilio Programmable Voice
and SMS for this. Until now the escalation ladder ran end-to-end against a
`MockNotificationAdapter` that places no real calls — the workflow is exercised, but
no one is actually dialed. This decision covers turning on real outbound comms.

Two non-negotiable rules bear on it:

- **Rule #1** — only labels, timestamps, keypoints, and confidences leave the device.
  Never pixels, never raw audio. Outbound comms do **not** change this: Twilio carries
  the alert *text and the family's phone numbers*, never any imagery or captured audio.
- **Rule #6** — EU-only infrastructure. No subprocessor outside the EU without an
  explicit founder decision recorded here. Twilio is a new subprocessor.

Unavoidably, telling a family about an incident means personal data leaves the device:
the family member's phone number, and a short message that an elder had a suspected
fall, when, and how it resolved. Even minimized (roles where possible, no free text
beyond the alert), this is health-adjacent Article 9 territory. So enabling Twilio is
a rule #6 decision, not a deploy default.

## What the code does today (safe by default)

- Outbound comms run behind a `NotificationPort` (`placeCall`, `sendSms`,
  `pushCriticalAlert`, `notifyEmergency`). With **no** Twilio credentials configured,
  the **`MockNotificationAdapter`** is used: it logs intent and dials no one. This is
  the default in dev, CI, and any unconfigured environment.
- The `TwilioNotificationAdapter` (this change) implements real `sendSms` and
  `placeCall` over Twilio's REST API. It is selected **only** when
  `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` are all set —
  credentials that come from the vault, never the repo, never the APK.
- `placeCall` returns `answered: false`. A REST call creation cannot synchronously
  know whether a human picked up, and the safety core must **never** falsely believe a
  contact answered and stop escalating. Real answered-detection (status callback /
  answering-machine detection) is a separate, additive follow-up.
- Every call/SMS the ladder performs is already recorded on the append-only incident
  trail (`call_placed`, `sms_sent`, `call_no_answer`, ...) — the audit trail is
  independent of which adapter runs.

## Decision (to be completed by Souheila / Wil / Daniel)

Before setting Twilio credentials in any environment that holds real family data,
record here:

1. **Residency** — use a Twilio account provisioned in the **EU (Ireland) region**
   with EU phone numbers and an EU Messaging Service, so message/call metadata is
   processed and stored in-region. Confirm the account is EU-configured, not US.
2. **Legal basis / DPIA** — how outbound comms fit the DPIA and the Article 9 basis;
   the DPA/SCCs in place with Twilio; message retention (aim: minimal, logs off where
   possible).
3. **Data floor** — confirm the alert message contract: the minimum needed to be
   useful and humane, following the brand-voice rule (inform and reassure, never
   dramatize), and no data beyond what the family needs to act.
4. **Scope** — which environments may enable it (e.g. never in the EU pilot until 1–3
   are signed), and the tested from-number / emergency-number configuration.

Until this is completed and marked **accepted**, the Twilio adapter stays off and the
mock places every "call."

## Consequences

- The escalation ladder is fully built and testable today with zero real dialing.
- Flipping to real calls/SMS is a conscious, logged, reversible switch (unset the
  credentials → back to the mock), gated on human sign-off rather than a deploy
  default — consistent with how cloud narration is gated in 0002.
