# 0001 — Append-only enforcement at the database level

Status: accepted · Date: 2026-07-06 · Feature: F0.2

## Context

CONTRIBUTING.md rule #2: the events/incidents tables are append-only — no UPDATE, no
DELETE, ever. This is the audit trail for families, hospitals, and regulators, so
it must not be enforceable only in application code, where a bug or a compromised
service credential could rewrite history.

## Decision

Enforce append-only in Postgres itself, in two independent layers:

1. **Trigger (absolute).** A `raise_append_only()` trigger function raises on
   `UPDATE`, `DELETE` (row level) and `TRUNCATE` (statement level). A trigger that
   RAISEs fires for every role, including the table owner and superusers — it
   cannot be bypassed by privilege. This is the guarantee we rely on. Applied to
   `event_stream`; reused for `incidents` when escalation (F1.4) lands.

2. **Grants (defense-in-depth).** `UPDATE, DELETE, TRUNCATE` are revoked from
   `PUBLIC` on the append-only tables. In production the application should connect
   under a dedicated restricted login role that is never granted those privileges,
   so a leaked app credential cannot even attempt a mutation. The app currently
   connects as the database owner in dev/CI; the trigger is what enforces the rule
   regardless.

TimescaleDB retention (`drop_chunks`) is chunk-level DDL, not a row `DELETE`, so it
does not trip the trigger — history on `event_stream` stays immutable while
`heartbeats` (operational, not audit) still gets a retention policy.

## Consequences

- Corrections are new rows referencing the original, never edits.
- The guarantee is verified by an integration test that asserts UPDATE, DELETE, and
  TRUNCATE all fail on `event_stream`.
- TODO (F0.4 hardening): provision the restricted `obrigada_app` login role and
  point the backend's `DATABASE_URL` at it in production.
