# 0005 — GDPR data rights: access/export and erasure

Status: **implemented (export + erasure) — retention basis needs founder sign-off** · Date: 2026-07-08 (erasure: 2026-07-09) · Feature: F3.x

## Context

Obrigada holds personal, health-adjacent data about a protected elder and their
caregivers. Under GDPR a data subject can request **access** to their data (Art. 15),
**portability** (Art. 20), and **erasure** (Art. 17). For a product whose regulatory
posture treats explainability and audit trails as features, supporting these well is
table stakes for the EU pilot — not an afterthought.

This record covers how we implement both, and how erasure reconciles with a rule that
appears to forbid it.

## The tension: erasure vs the append-only trail (rule #2)

Rule #2 makes the events/incidents tables **append-only** — no UPDATE, no DELETE, ever,
enforced by database triggers. That is deliberately in tension with the right to
erasure. GDPR resolves this: erasure is **not absolute**. Art. 17(3) exempts data that
must be retained for a legal obligation or for the establishment/exercise/defence of
legal claims. For an eldercare safety system, the incident audit trail (who was
alerted, when, how it resolved) is exactly such a record — families, hospitals, and
regulators may need it, and it is our defence that the system acted correctly.

Crucially, the append-only trail is already built to be **non-identifying**: events
carry labels, timestamps, keypoints, and confidences (rule #1); incident steps
reference a contact *id* and *role*, never a name. So retaining it does not retain a
person's identity.

## Approach

**The identifying data lives only in mutable tables** — `families.name`,
`users.email`, `contacts.name/phone`, `devices.name`, `medications`, `appointments`,
`push_tokens`. Erasure operates there; the append-only trail is retained under the
lawful-basis exception above.

### Access / export — IMPLEMENTED

`POST /me/export` returns a structured JSON bundle of everything the family owns:
account, family, guardians, contacts, medications, appointments, incidents (with their
full step trail and narrative), registered devices, and the activity log. Family-scoped
and ownership-guarded like every `/me` route, and the export itself is recorded on the
append-only activity trail (rule #7). This satisfies Art. 15 and Art. 20.

### Erasure — IMPLEMENTED

`POST /me/erase` **crypto-shreds the identifying data** while preserving the
non-identifying audit skeleton. It requires the caregiver to type their exact family
name back (irreversible). The approach:

- **Redact/delete in mutable tables:** family name → tombstone; user email → an
  irreversible tombstone and the account disabled; contacts, medications,
  appointments, push tokens → deleted; device names → redacted (the device row stays,
  referenced by the append-only events).
- **Retain, untouched:** the append-only `event_stream`, `incidents`, incident steps,
  `incident_narratives`, and `access_log` — already non-identifying, kept under Art.
  17(3). The DB triggers that forbid UPDATE/DELETE on them are therefore *not* an
  obstacle: erasure never touches them.
- **Record the erasure itself** on the append-only trail (what was erased, when, by
  whom) — the audit of the erasure.

Because erasure is destructive and irreversible, it is gated on founder sign-off of
this record and will require an explicit confirmation from the caregiver.

## Decision (erasure, to be completed by Souheila / Wil / Daniel)

1. Confirm the retention basis and period for the append-only trail after erasure.
2. Confirm the redaction map above is complete (no identifying field missed).
3. Confirm the caregiver confirmation flow and that erasure is logged.

## Consequences

- Families can export all their data today.
- Erasure ships as a conscious, logged, confirmed operation that honours the right to
  be forgotten without destroying the safety audit trail — the two are reconciled, not
  traded off.
