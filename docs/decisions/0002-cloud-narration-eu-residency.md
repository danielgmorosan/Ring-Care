# 0002 — Cloud narration and EU data residency

Status: **draft — needs founder sign-off before the Claude adapter is enabled** · Date: 2026-07-08 · Feature: F3.2

## Context

F3.2 turns the structured incident trail into a warm, human-words summary for the
family ("Your father fell in the kitchen at 3:12. He answered the voice check, and
your daughter reached him by phone. He is okay."). The tech-stack in CLAUDE.md
chooses the Claude API for this ("incident narration ... operating on structured
event logs only; text in, text out; never imagery/audio").

Two non-negotiable rules bear on this:

- **Rule #1** — only labels, timestamps, keypoints, and confidences leave the
  device. Never pixels, never raw audio.
- **Rule #6** — EU-only infrastructure. No service or subprocessor outside the EU
  without an explicit founder decision recorded here.

The Claude API is a non-EU subprocessor. Narration sends health-adjacent personal
data (that an elder had a suspected fall, when, and how it resolved). Even minimized,
this is Article 9 territory. So enabling it is a rule #6 decision, not a default.

## What the code does today (safe by default)

- Narration runs behind a `NarrationPort`. With **no** `ANTHROPIC_API_KEY` set, a
  **deterministic local mock** produces the text. Nothing leaves the backend. This
  is the default in dev, CI, and any unconfigured environment.
- The request that would reach Claude is minimized in `NarrationService`: it carries
  step **kinds**, contact **roles** ("daughter", never a name), timestamps, an
  allowlisted voice check-in result, and the outcome. No names, no free-text detail,
  no pixels, no audio.
- Narratives are persisted append-only (`incident_narratives`) with `generated_by`
  recording whether the mock or Claude produced each one — part of the audit trail.

## Decision (to be completed by Souheila / Wil / Daniel)

Before setting `ANTHROPIC_API_KEY` in any environment that holds real family data,
record here:

1. **Legal basis / DPIA** — how narration fits the DPIA and Article 9 basis.
2. **Residency** — whether an EU-region / zero-retention Claude offering is used, or
   why a non-EU processor is acceptable with what safeguards (DPA, SCCs, retention).
3. **Data floor** — confirm the minimized request shape above is the contract, and
   that it is covered by tests.
4. **Scope** — which environments may enable it (e.g. never in the EU pilot until 1–3
   are signed).

Until this is completed and marked **accepted**, the Claude adapter stays off and the
mock is the only narrator.

## Consequences

- The product demos and ships useful narration today with zero external data flow.
- Flipping to real Claude narration is a conscious, logged, reversible switch (unset
  the key → back to the mock), gated on human sign-off rather than a deploy default.
