# 0014 — Amazon Connect (EU region) as the family call provider

Status: **proposed — needs founder sign-off (Souheila / Wil / Daniel)** · Date: 2026-10-21

## Context

Family calls go through Twilio today (0003), with press 1 confirmation over a public,
signed callback. For the Amazon hackathon we want the calls on AWS, and the callback has a
cost: the demo needs a tunnel, which relays the backend through a service that is not
EU-pinned. Amazon Connect places outbound calls from an EU region (eu-central-1) and runs
an IVR flow that can collect one key, with no inbound webhook to us.

This is a rule #6 decision: Connect becomes a subprocessor for family phone numbers and the
call text, the same categories Twilio carries.

## Decision (proposed)

1. Add `CALL_PROVIDER=connect`: `StartOutboundVoiceContact` into an imported flow
   (`docs/hackathon/amazon-connect/obrigada-family-call.json`) in `CONNECT_REGION`
   (default `eu-central-1`). The backend refuses to boot with `CALL_PROVIDER=connect` and a
   non-EU region. Credentials only through the default AWS provider chain.
2. Press 1 without a public URL: the flow stores the key as the contact attribute
   `confirmed=1`; an in-memory poller reads `GetContactAttributes` every 3 s for the ack
   window plus 30 s and signals the workflow through the existing `contactConfirmed` path.
   The trail records `call_answered { via: 'press_1', provider: 'connect' }`. The Twilio
   route now adds `provider: 'twilio'` the same way.
3. The safety core is unchanged: the adapter never reports `answered: true`; any AWS error
   or lost poller means "no confirmation" and the ladder moves on. With Twilio configured,
   a call Connect refuses is placed through Twilio.
4. The data floor is unchanged from 0003: the same deterministic call text, plus the
   incident and contact ids as attributes. No names or roles are added; no recording, queue,
   agent or flow logging block is used.
5. SMS: Connect sends none. AWS End User Messaging SMS (`SendTextMessage`, same region) when
   `CONNECT_SMS_ORIGINATION` is set, otherwise Twilio, otherwise skipped (push carries it).
6. Unset `CALL_PROVIDER` keeps today's behaviour exactly; Connect is opt-in.

## Open questions for sign-off

- **Retention.** Connect keeps contact records, including the attributes we pass (the call
  text and ids), in its own contact search. Confirm the retention period and whether it is
  acceptable, or shorten what the call text says.
- **Allowlisting.** Frankfurt instances call only UK, IE, FR, IT and US by default;
  Portugal and Romania need a support case. Record the approved destination list here.
- **Caller id.** Claiming a Portuguese number needs a Portuguese business address and proof
  of service. Until then calls come from a UK or Romanian number.
- **Durability.** The poller is in memory. A restart mid-call loses that one confirmation
  (the ladder moves on safely). Moving the registry into the workflow (a polling activity)
  would make it durable; deferred until after the hackathon.
- **DPA.** AWS's DPA already covers Bedrock (0013); confirm it covers Connect and End User
  Messaging in the same account.

## Consequences

- No tunnel for the Connect path, so no non-EU relay in front of the backend.
- One more provider to operate, behind the same `NotificationPort`; switching back is
  unsetting `CALL_PROVIDER`.
- Setup and the click-by-click fallback: `docs/hackathon/amazon-connect.md`.
