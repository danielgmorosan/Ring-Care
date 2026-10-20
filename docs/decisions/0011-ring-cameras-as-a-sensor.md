# 0011 — Ring cameras as a sensor source

Status: **proposed — needs founder sign-off (Souheila / Wil / Daniel)** · Date: 2026-10-20

## Context

Many families already own Ring doorbells and cameras. Ring's Partner API (Amazon Vision,
`api.amazonvision.com`) lets an app receive signed webhooks for motion (with Smart Alert
labels such as `human`) and doorbell presses, list a linked account's devices, and open
a live view over WebRTC (WHEP). The front door is exactly where the guardian phone is
weakest and where our founding story happened: a parent leaving home at night.

Two non-negotiable rules bear on this:

- **Rule #1 (no video upload).** Ring video already lives in the family's Ring account,
  in Amazon's cloud. Obrigada must not pull it into ours.
- **Rule #6 (EU-only).** The Ring Partner API is an Amazon service outside our EU
  hosting. It is a new subprocessor.

## Decision (proposed)

1. **Metadata only.** The backend records Ring webhook labels and ids (camera, event
   kind, Smart Alert label, time) in an append-only `ring_events` table. It never
   downloads snapshots or clips and never stores or forwards pixels.
2. **Live view is a window, not a recorder.** The family app opens Ring live view over
   WHEP. The backend only relays the SDP offer/answer (Ring blocks browser calls), never
   the media, and audit-logs every open (rule #7).
3. **Deterministic core unchanged.** A Ring event is one more input. Night door activity
   and visit no-shows enter the existing alert and escalation paths (rule #3).
4. **Off unless configured.** With no Ring credentials, nothing is called and nothing
   changes.
5. **Rule #6.** The family opts in by linking their own Ring account. The data that
   crosses to Amazon is what Ring already holds plus the OAuth link itself. Founders to
   confirm this is acceptable before enabling in production.

## Consequences

Families with Ring get door coverage without a second guardian phone. Ring Appstore
distribution is US-only today; an EU rollout depends on Ring.
