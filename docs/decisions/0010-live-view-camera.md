# 0010 — Live view (family camera): privacy model and infrastructure

Status: **proposed — needs founder sign-off (Souheila / Wil / Daniel) before build** · Date: 2026-07-10 · Feature: F2.5

## Context

The reason families adopt elder-monitoring is direct: *"I can't be there, so I need to
see for myself that he's okay."* Distance, being at work or outside, and the honest fact
that automated fall/stranger detection will not be 100% accurate — the family's own eyes
are the safety net beneath our automated one. Without a way to look in, the product does
not do the job families actually hire it for.

This record makes **live camera view a first-class feature**, and defines how it is built
so it stays trustworthy rather than becoming surveillance.

It reconciles with rule #1 ("No video or audio persistence, no video upload"), which
already carves out the one exception: *"the E2EE live channel (LiveKit) during an incident,
which servers relay but cannot decrypt."* The only change this record makes is **widening
that exception from incident-only to family-on-demand**. The two invariants that make the
exception safe are unchanged.

## Decision

**The feature: on-demand live view.** An authorized family member can open the guardian's
camera and watch a live stream, at any time, from the family app. It is a pull, initiated by
the family — never a feed we push or watch.

Four invariants, non-negotiable for this feature:

1. **End-to-end encrypted.** Only the family's authorized devices hold the keys. Our servers
   (and the relay) pass the encrypted stream through and **cannot decrypt it**. This is the
   promise we make and sell: *"we cannot see your father — only you can."*
2. **Live only, never recorded.** Real-time viewing with no archive: nothing is stored,
   nothing is uploaded to us, there is no footage anyone (family, us, or a subpoena) can pull
   later. This is what keeps rule #1 intact and keeps Obrigada from being a surveillance-
   recording company. The camera is a window, not a recorder.
3. **Access-controlled.** The caregiver authorizes who may view. A viewer needs an
   authenticated family session; the guardian only accepts a session token minted by the
   backend for an authorized member.
4. **Audit-logged (rule #7).** Every camera-open lands in the append-only audit trail — who
   looked and when — visible to the family, so access stays accountable among relatives.

**Infrastructure — recommendation: self-host LiveKit in the EU.** LiveKit is open-source
WebRTC (an SFU that relays streams). Two paths, both EU-only per rule #6:

- **Self-host (recommended):** run the LiveKit SFU on an EU VPS (alongside or beside the
  existing stack). Full sovereignty, no third-party subprocessor, cheapest at our scale, and
  it strengthens the "we cannot watch" story because there is no outside party in the media
  path at all. Cost: we operate it (another service in `docker compose`, plus TURN for NAT
  traversal). Given the stack already self-hosts Postgres/EMQX/Temporal, this fits the
  "boring, operable, EU-controlled" posture.
- **LiveKit Cloud, EU region (alternative):** faster to stand up, managed scaling. But it is
  a **subprocessor** handling (encrypted) media relay — needs a DPA and its own line in the
  rule-#6 subprocessor list. Even though media is E2EE and it cannot decrypt, it is still an
  outside party in the path.

E2EE uses LiveKit's insertable-streams encryption: keys are derived on the family's devices
and shared only among authorized members; the SFU (self-hosted or cloud) never receives a
key.

## What this changes

- **CLAUDE.md rule #1** wording, on sign-off: the live-channel exception widens from "during
  an incident" to "family-initiated, any time," keeping "E2EE, servers relay but cannot
  decrypt, never persisted."
- **CLAUDE.md tech stack / this record's status** moves to accepted once signed off.
- **New backend module** `live` (behind `LIVEKIT_*` config, off by default like narration and
  calls): mint scoped, short-lived room tokens for an authenticated + authorized family
  member; instruct the target guardian to publish; write the audit entry on every open. No
  media touches the backend.
- **Guardian:** a publish path that starts the camera as a WebRTC track **on demand** and
  stops it when the viewer leaves — separate from, and lower priority than, the always-on
  on-device detection pipeline.
- **Family app:** a "See live" control on a guardian, the subscribe + E2EE-key path, and the
  four border-glow-free live UI.

## Open questions for sign-off

1. **Elder awareness.** Show a visible indicator on the guardian (a light / on-screen dot)
   whenever someone is viewing, or allow silent viewing? An indicator preserves the elder's
   dignity and may be needed for consent/legal in some EU jurisdictions; silent is what some
   competitors do. **Recommend: visible indicator.**
2. **Who may view.** Caregiver only, or all family members the caregiver invites? **Recommend:
   caregiver plus invited members, each individually revocable.**
3. **Two-way?** View-only, or also talk to the elder (audio back)? View-only is simpler and
   the stated need; two-way audio is a natural follow-up. **Recommend: view-only first.**
4. **Infra choice:** self-host vs LiveKit Cloud EU (above). **Recommend: self-host.**

## Consequences / risks

- **Old donated phones.** Live WebRTC is heavy (encode + upload) versus our usual labels-only
  traffic, and CLAUDE.md assumes weak thermals and no NPU. Mitigations: stream only while a
  viewer is actively watching, cap resolution/frame rate, and let streaming yield to the
  detection pipeline — detection is the safety function and must never be starved by someone
  watching. Never let a live session degrade fall detection.
- **NAT traversal.** Home networks need TURN for reliable connection; self-host means we run
  a TURN server too.
- **Bandwidth/battery** on the elder's home connection and the guardian — acceptable because
  it is on-demand and short, not continuous.
- This is a real vertical (backend + guardian + family app), built after the first deploy and
  behind config, so it ships dark and turns on per-household when ready.
