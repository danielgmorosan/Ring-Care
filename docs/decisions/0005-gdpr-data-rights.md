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
full step trail and narrative), registered devices, the activity log, and the hackathon
tables below (Bee care proposals with their decisions, expected visits, visit arrivals,
Ring cameras and Ring events). Family-scoped
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

### Hackathon tables (Ring, visits, Bee): added 2026-10-20

Decisions 0011 (Ring) and 0012 (Bee) added tables. They follow the same split:

| Table | Kind | Export | Erasure |
| --- | --- | --- | --- |
| `ring_cameras` | editable | `ringCameras` | name redacted; row kept (`ring_events` references it) |
| `expected_visits` | editable | `expectedVisits` | deleted |
| `ring_events` | append-only | `ringEvents` | retained: labels, ids and times only (rule #1) |
| `ring_care_decisions` | append-only | not in the bundle (the incidents it opened are) | retained: ids, outcomes and times only |
| `visit_arrivals` | append-only | `visitArrivals` | retained, see open question 4 |
| `care_proposals` | append-only | `careProposals` | retained, see open question 4 |
| `care_proposal_decisions` | append-only | inside each `careProposals[].decision` | retained, see open question 4 |

The append-only triggers forbid UPDATE and DELETE on these rows by design (rule #2), so
erasure does not touch them, exactly as for `event_stream` and `incidents`. Unlike that
trail, three of them carry free text: `visit_arrivals.visitor_label` (a visitor's first
name, copied from the visit) and the `summary` and `items` of `care_proposals` (derived
from the caregiver's own Bee note, which can name a medication: health data under Art.
9). `care_proposal_decisions.result` can echo a medication name in its messages.

## Decision (erasure, to be completed by Souheila / Wil / Daniel)

1. Confirm the retention basis and period for the append-only trail after erasure.
2. Confirm the redaction map above is complete (no identifying field missed).
3. Confirm the caregiver confirmation flow and that erasure is logged.
4. Confirm the retention basis for the free text in `visit_arrivals`,
   `care_proposals` and `care_proposal_decisions` after erasure. Art. 17(3) covers the
   safety audit; it is less clearly a basis for a care-plan suggestion. If it does not
   hold, the fix is a schema change recorded here (for example, encrypt those columns
   with a per-family key and destroy the key on erasure), not a DELETE.

## Consequences

- Families can export all their data today.
- Erasure ships as a conscious, logged, confirmed operation that honours the right to
  be forgotten without destroying the safety audit trail — the two are reconciled, not
  traded off.
