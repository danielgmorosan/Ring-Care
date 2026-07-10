# 0007 — The VLM second opinion may escalate, never suppress

Status: **accepted** · Date: 2026-07-10 · Feature: F3.1 (VLM second opinion, Tier 2)

## Context

When the pose pipeline flags a possible fall, the guardian's on-device vision-language
model (VLM) takes a second look and answers what pose cannot — floor or sofa? a walker
nearby? The plan (F3.1) calls its confidence "one input among the rules — the
deterministic engine still decides," and names it "the single biggest false-alarm
reduction lever after voice check-in."

The open question this record settles: **how may that verdict change escalation?** It
bears directly on two non-negotiables:

- **Rule #3** — the escalation path is a deterministic state machine. LLM/VLM outputs
  may feed it as inputs; they never hold sole authority to call or not call.
- **The merge-gating safety metric** — missed falls must stay **zero**. A false alarm
  is a nuisance; a missed fall is the failure the whole product exists to prevent.

## Decision

**A VLM verdict may only ever *escalate*. It can raise urgency; it can never lower it,
never cancel, never suppress an alert on its own.**

Concretely:

- **Where the reduction happens.** False-alarm reduction is a **device-side gate**: the
  guardian runs the VLM *before* it emits, and a refuted flag simply is not sent as a
  `fall.confirmed`. The cloud never suppresses — it only ever sees the event the device
  chose to send. This keeps "video never leaves the home" absolute and keeps the
  suppress decision on the deterministic side.
- **Escalate-only, in the backend.** If a `vlm.verdict` of `confirmed` is on record for
  the event that opened an escalation, the backend treats a *suspected* fall with the
  urgency of a *confirmed* one (it overrides quiet hours). A `confirmed` fall is never
  downgraded by any verdict; a `refuted` or `uncertain` verdict changes nothing about
  the ladder — a suspected fall still runs the voice check-in gate exactly as before.
- **Never sole authority (rule #3).** The verdict is an input to urgency only. The
  voice check-in remains the false-alarm killer; the contact ladder and the 112 step
  are unchanged and deterministic.
- **Recorded, always.** Every verdict is written to the append-only stream and shown on
  the incident (decision already shipped in PR #60). Explainability is a feature.

## Why this is safe

The only backend effect a verdict can have is to make help arrive *sooner or louder*.
There is no code path by which a verdict makes help arrive *less*. Therefore no verdict
— however wrong — can turn a real fall into a missed fall. Missed falls stay zero by
construction; the VLM only trades some false alarms (device-side) for faster confirmed
response (backend-side).

## Consequences

- Implemented now (defense-in-depth): the escalation trigger consults the recorded
  verdict at ladder start and upgrades a suspected fall to confirmed-urgency when a
  confirming verdict is already present.
- Follow-up: upgrading an escalation **already in flight** when a confirming verdict
  arrives after the ladder started needs a Temporal signal into the running workflow.
  Until then the in-flight case keeps the suspected-fall behavior (still safe — it only
  forgoes an *upgrade*, never a call).
- No new subprocessor or data-residency change: the VLM runs on-device; only the
  labels-only verdict is involved (rule #1).
