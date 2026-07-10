# 0009 — Defer the on-device VLM; add a tiny floor classifier only if the data demands it

Status: **accepted** · Date: 2026-07-10 · Feature: F3.1 (VLM second opinion, device side)

## Context

Decision 0007 settled how a VLM verdict may influence escalation (escalate, never suppress)
and the backend already ingests `vlm.verdict` and shows it on the incident screen. What is
not built is the *device* side: when the pose pipeline flags a fall, something that looks at
the frame and answers "on the floor or on the sofa? a walker nearby?" and emits the verdict.

The plan (F3.1) imagines an "on-demand Gemma-class VLM." Two hard walls constrain what is
actually possible:

- **Rule #1 rules out the cloud.** A vision model needs the *pixels*, and pixels never leave
  the device. So a "cloud-assisted VLM" is not available to us — anything we send the cloud
  is keypoints/labels, which the backend and Claude can already reason over. Vision has to be
  on-device or not at all.
- **The hardware assumption rules out Gemma on the fleet.** The guardians are old donated
  phones — "no NPU, weak thermals, small storage." A multi-GB, thermally hot VLM run
  on-demand is impractical there, and fights the premise the whole product is built on.

So the real choice is not "Gemma vs cloud" but: **defer, a tiny purpose-built classifier, or
tiered Gemma.**

## Decision

**Defer the on-device VLM. Reduce false alarms first by tuning the pose heuristic and leaning
on the voice check-in, measured against real data. If false alarms remain too high after
that, add a small on-device "is the person on the floor?" classifier — not a general VLM —
emitting `vlm.verdict`. A full Gemma-class VLM is revisited only when the fleet is on capable
hardware.**

Rationale:

- **Don't build a heavy, speculative feature before the data asks for it.** The pose
  heuristic (`FallDetector`) thresholds and the on-device voice check-in are the first-line
  false-alarm reducers, and they cost nothing more to tune. On-device testing will tell us
  the actual false-alarm rate; that number, not a hunch, decides whether more is needed.
- **If more is needed, the cheapest high-value signal is floor-vs-furniture.** That single
  question separates a real fall from a nap on the sofa — the dominant false alarm. A small
  task-specific CNN answering just that is feasible on weak phones, unlike a general VLM, and
  slots into the `vlm.verdict` path that already exists (0007). ~80 % of the value at a
  fraction of the cost.
- **The escalate-never-suppress guarantee (0007) is unchanged** regardless of which producer
  we choose; this record only decides *whether and how* the device produces the verdict.

## Consequences

- No device-side VLM ships now. The `vlm.verdict` ingest, the escalate-only rule (0007), and
  the incident-screen display remain in place, ready for a producer.
- Next concrete step is not a model but a measurement: the false-alarm rate from two-phone
  testing, and the eval discipline (missed falls = 0, false alarms/home/week) that gates it.
- Revisit triggers: (a) measured false alarms stay high after threshold tuning → build the
  floor classifier; (b) the fleet moves to phones with an NPU → reconsider a tiered Gemma VLM.
