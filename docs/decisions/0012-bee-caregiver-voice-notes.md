# 0012 — Bee voice notes from the caregiver

Status: **proposed — needs founder sign-off (Souheila / Wil / Daniel)** · Date: 2026-10-20

## Context

Caregivers leave doctor visits with changes to remember: a new dose, a blood test, the
next appointment. Bee (Amazon's wearable AI, also on Apple Watch) captures what its
wearer says and exposes it through a developer API, a CLI and a live event stream.

## Decision (proposed)

1. **The caregiver's own words only.** The flow is the caregiver dictating a short note
   after the visit. We never ask anyone to record a consultation; recording a clinician
   without consent is unlawful in Portugal and doubtful in Romania.
2. **Proposals, never automatic changes.** An LLM extracts candidate medication changes,
   appointments and todos into an append-only `care_proposals` trail. Nothing changes the
   care plan until the caregiver approves it. LLM output never touches the safety core
   (rule #3).
3. **Write-back as reminders.** Approved items become Bee todos (with alarms) on the
   caregiver's wrist and records in the care module.
4. **Rule #6.** Bee is an Amazon service outside our EU hosting; the data is the
   caregiver's own Bee account. Founders to confirm before production use.
