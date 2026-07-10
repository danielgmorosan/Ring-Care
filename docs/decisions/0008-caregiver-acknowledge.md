# 0008 — A caregiver may acknowledge an incident, but only under a re-escalation timer

Status: **accepted** · Date: 2026-07-10 · Feature: F1.4 (escalation ladder)

## Context

The escalation ladder is a deterministic Temporal workflow: incident opens → on-device
voice check-in → critical push to the caregivers' phones → call each contact in priority
order → call 112. It already stops when a **contact answers a call** (`acknowledgedBy` is
set, the ladder breaks, 112 is skipped): a responsible human is engaged, so the machine
steps back.

What was missing: a caregiver who has *already* seen the alert and is handling it (they're
in the room, they're driving over) had no way to say so from the app. Without it, the ladder
keeps working down the phone tree and can place a **112 call that isn't needed** — false
emergency calls, alarm fatigue, families disabling the product. A real cost.

The open question this record settles: **may a caregiver stop the ladder from the app, and
if so, how — without ever silently suppressing help?** It bears on two non-negotiables:

- **Rule #3** — the deterministic core decides whether help is summoned; a human/LLM never
  holds sole authority to *not* call.
- **The merge-gating metric** — missed falls must stay **zero**. A false 112 call is a
  nuisance; a fall that never reaches help is the failure the product exists to prevent.

## Decision

**A caregiver may acknowledge an active incident ("I'm handling this"), which pauses
escalation to other contacts and holds the 112 call — but the acknowledgement carries a
bounded re-escalation timer. If the acknowledger does not send an explicit "All clear"
within the window, the acknowledgement lapses and the ladder resumes to full emergency
escalation.**

Concretely:

- **Acknowledge ≈ answering a call.** It is the same safety posture the ladder already
  accepts when a contact answers: a human took ownership, so stop calling others. Recorded
  as an `acknowledged` step (rule #7 — every escalation action is on the append-only trail).
- **The timer is what makes the one-tap action safe.** Answering a phone call is a real,
  attentive act; a one-tap button is not. So the app acknowledgement is *provisional*: the
  caregiver must confirm **"All clear"** within `ACK_RESOLVE_WINDOW_SECONDS` (default **300
  s / 5 min**). All-clear records a `stood_down` step and closes the incident.
- **Lapse → resume.** If the window passes with no all-clear, an `acknowledgement_lapsed`
  step is recorded and the ladder resumes at the **"nobody handled it"** stage: SMS + critical
  push to the whole chain, then 112. A mis-tap, or a caregiver who tapped and then got
  distracted, therefore never silently suppresses help — it only ever *delays* it by the
  window, and only when a human claimed to be responding.
- **No one-tap all-clear on the alert itself.** The caregiver cannot cancel an incident in a
  single tap; they can only *acknowledge* (which starts the timer) and then *resolve*. There
  is deliberately no button that reads "false alarm, cancel everything" in one action.
- **Durability.** The timer is a Temporal workflow timer, so a crash mid-window resumes
  exactly where it left off — the re-escalation cannot be lost to a process restart.

## Consequences

- Escalation is quieter and more humane in the common case (caregiver is already on it)
  without weakening the guarantee: the only new state is a **time-boxed hold** that fails
  *toward* escalation, never away from it.
- The elder's on-device "I'm fine" voice check-in remains the *elder-side* false-alarm
  killer; this is the *caregiver-side* one, made safe by the timer rather than by trust.
- Follow-ups: per-family tuning of the window; distinguishing "acknowledge" from a stronger
  "I am with them now" that could widen the window. Neither changes the fail-toward-help
  invariant above.
