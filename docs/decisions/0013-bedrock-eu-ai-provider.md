# 0013 — Amazon Bedrock in an EU region as the AI provider

Status: **proposed — needs founder sign-off (Souheila / Wil / Daniel)** · Date: 2026-10-20

## Context

Decision 0002 left the Claude API adapter disabled because it sends minimized,
health-adjacent data outside the EU (rule #6). Amazon Bedrock serves Claude and other
models from EU AWS regions, with EU cross-region inference profiles that keep requests
inside EU regions.

## Decision (proposed)

1. Add a Bedrock provider (`AI_PROVIDER=bedrock`, `BEDROCK_REGION=eu-central-1`, an EU
   inference profile as `BEDROCK_MODEL_ID`) behind the existing narration port and a new
   generic `LLM_PORT`.
2. The request shapes and minimization rules from 0002 are unchanged: labels, roles,
   timestamps and outcomes; never names, pixels or audio.
3. The mock stays the default. Nothing leaves the backend unless a provider is set.
4. This may resolve 0002's open question if the founders accept AWS (EU region) as the
   subprocessor.
