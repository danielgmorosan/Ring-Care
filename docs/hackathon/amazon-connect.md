# Amazon Connect (Frankfurt) for family calls

Decision record: [0014](../decisions/0014-amazon-connect-calls.md). Status: proposed, needs
founder sign-off before real family data flows. Twilio stays in place as the fallback
([0003](../decisions/0003-twilio-outbound-comms-eu-residency.md)).

## What changes

With `CALL_PROVIDER=connect`, the escalation ladder places each family call through
Amazon Connect in `eu-central-1`. Nothing else in the ladder changes: the same contacts, the
same order, the same 45 second wait for "Press 1", the same append-only trail.

```
workflow placeCall ──> StartOutboundVoiceContact (instance, flow, from-number, to-number,
                       attributes: message, incidentId, contactId)
                       │
                       ▼
               Connect flow "obrigada-family-call"
               says the message, asks "Press 1 if you are handling this."
               on 1: sets contact attribute confirmed = 1
                       ▲
backend poller ──> GetContactAttributes every 3 s, for the ack window + 30 s
               on confirmed = 1: same signal as the Twilio press-1 route
               trail: call_answered { via: "press_1", provider: "connect" }
```

No Lambda, no public URL and no tunnel: the backend asks Connect, Connect never calls us.

What stays the same, and why it is safe:

- **Never a false "answered".** `placeCall` returns `answered: false, awaitsConfirmation:
  true`. Only a press 1 read back from Connect stops the ladder.
- **Failures move the ladder on.** If Connect refuses the call (allowlist, quota, IAM, a
  wrong id), the error is logged by AWS error name only. With Twilio configured, Twilio
  places that call instead. Without it, the workflow moves straight to the next contact, and
  in the end to SMS, push and (for falls) emergency, exactly as when nobody answers.
- **Polling failures mean "no confirmation".** Throttling or a lost poller (a backend
  restart mid-call) is logged and the workflow's own timer moves on. The registry is in
  memory on purpose: it is never the only copy of anything.
- **Retries never ring twice.** Each call carries `ClientToken = <incidentId>:<contactId>`,
  so a retried activity gets the same Connect contact back.
- **Data floor.** The call carries the same deterministic words the Twilio call speaks
  (falls: the generic text) and two opaque ids. No contact name, role or extra detail. The
  flow records nothing: no agent, no queue, no recording, no logging block.

### SMS

Amazon Connect places calls; it does not send SMS. The ladder's "nobody answered" texts go:

1. through **AWS End User Messaging SMS** (`SendTextMessage`, same EU region) when
   `CONNECT_SMS_ORIGINATION` is set to an origination identity you own there;
2. otherwise through **Twilio** when the Twilio set is configured;
3. otherwise they are **skipped** with a log line, and the critical push carries the alert.

An SMS failure is logged and never fails the ladder. For tonight, option 2 or 3 is enough.
Registering an SMS origination identity for Portugal or Romania is a separate process with
its own lead time; do not count on it for the demo.

## 0. Before you start

- An AWS account you can sign in to as an administrator, and the AWS CLI if you want the
  command-line steps (`aws --version`).
- Do this in **Europe (Frankfurt) eu-central-1** throughout. The backend refuses to boot
  with `CALL_PROVIDER=connect` and any region that is not `eu-*` (rule #6).
- Read step 3 first. It is the one that can take longer than an evening.

The AWS docs now call the service "Connect Customer" in places. It is the same Amazon
Connect.

## 1. Create the instance

1. Console, region **Europe (Frankfurt)**. Open **Amazon Connect**, choose **Add an
   instance** (or **Create instance**).
2. **Step 1: Set identity.** Choose "Store users in Amazon Connect" and pick an access URL
   alias, for example `obrigada-demo`. It cannot be changed later.
3. **Step 2: Add administrator.** Create an admin user for the Connect admin website.
4. **Step 3: Set telephony.** Tick **Make outbound calls with Connect** (the wording may
   include "Connect Customer"). Inbound is not needed.
5. **Step 4: Data storage.** Keep the defaults.
6. **Step 5: Review and create.**
7. When it is active, open the instance in the console. Its **Instance ARN** ends in
   `instance/<id>`. That `<id>` is `CONNECT_INSTANCE_ID`. Keep the ARN for the IAM policy.

## 2. Claim a phone number

In the Connect admin website (the access URL from step 1): **Channels**, **Phone
numbers**, **Claim a number**, tab **Voice**. Pick a country and a type, choose a number,
save. You do not need to attach a flow to it: our calls are outbound only.

Which number to claim tonight. From the AWS phone number requirements page, for claiming
(not for calling):

| Country | DID (local or national) | Toll-free |
| --- | --- | --- |
| United Kingdom | Local (+44 1, +44 2) and national (+44 33, +44 84): no ID needed | +44 800, +44 808: no ID needed |
| Romania | National +40 376: no ID needed. Local: address and proof of address | +40 800: no ID needed |
| Portugal | Local and +351 30: a Portuguese business address and proof of telecom service | +351 800: an EU business address, tax id and business registration |
| Germany | Local and +49 32: a German business address and a recent registration document | +49 800: obtained from the regulator first |

So for tonight a **UK or Romanian national DID** is the realistic choice. The console only
shows what is actually in stock for your instance, so **check availability in the console**;
if your country or type is not listed, pick another. Prefer a **DID** over toll-free as the
caller id for outbound calls: we could not confirm from the AWS docs that a toll-free
number is accepted as outbound caller id to every destination. Tell Sofia, Miguel and Rosa
which number will ring them, so they do not ignore a foreign number at 3 a.m.

Copy the number in E.164 (`+44...` or `+40...`): that is `CONNECT_SOURCE_PHONE_NUMBER`.

## 3. Allow calls to Portugal and Romania, and check the quota

**The default allowlist does not include Portugal or Romania.** Per the AWS country
allowlist page, an instance in EU (Frankfurt) can call only these countries by default:
United Kingdom, Italy, France, Ireland, United States.

To call the demo household's phones (+351, +40), open a support case **now**:

1. Support Center, **Create case**, **Account and billing**.
2. **Service**: Connect (Number Management). **Category**: Country Allowlisting for
   Outbound Calls.
3. In the description: the instance ARN, and "Please allow outbound calls to Portugal
   (+351) and Romania (+40)". Submit.

UK mobile numbers (+447) are blocked by default too, and need a **service quota increase**
rather than an allowlist case.

Also check **Concurrent active calls per instance** (Service Quotas, Amazon Connect, in
eu-central-1, or `aws service-quotas list-service-quotas --service-code connect --region
eu-central-1`). The documented default is 10, but AWS notes new accounts can start lower.
The demo needs 1 at a time, 3 to be safe. If it shows 0, request an increase there. AWS
says small requests can be approved in hours and larger ones can take up to 3 weeks; you
must create the instance before you can request.

If the case is not answered in time:

- Demo with a phone on a UK, Irish, French or Italian number (one of the defaults); or
- Keep Twilio configured as well. A Connect call refused with
  `DestinationNotAllowedException` is then placed through Twilio automatically, and the
  backend log says so. Or set `CALL_PROVIDER=twilio` and use the Twilio path as before.

## 4. Import the contact flow

The flow is [amazon-connect/obrigada-family-call.json](./amazon-connect/obrigada-family-call.json).

1. Connect admin website: **Routing**, **Flows** (or **Contact flows**). **Create flow**,
   type **Flow** (the inbound "Contact flow" type, not a whisper or queue flow).
2. **Save** menu, **Import flow**, choose `obrigada-family-call.json`, **Import**.
3. Name it `obrigada-family-call`, then **Save and Publish**. Calls only use the
   published version.
4. Open **Show additional flow information**. The ARN ends in `contact-flow/<id>`. That
   `<id>` is `CONNECT_CONTACT_FLOW_ID`.

Or with the CLI (needs `connect:CreateContactFlow` on your admin credentials, not the
backend's):

```sh
aws connect create-contact-flow --region eu-central-1 \
  --instance-id <CONNECT_INSTANCE_ID> --name obrigada-family-call --type CONTACT_FLOW \
  --content file://docs/hackathon/amazon-connect/obrigada-family-call.json
```

It prints `ContactFlowId`.

### What we verified about the JSON, and what we did not

Checked against the AWS flow language reference (Version `2019-10-30`, actions
`MessageParticipant`, `GetParticipantInput`, `UpdateContactAttributes`,
`UpdateContactTextToSpeechVoice`, `DisconnectParticipant`) and by a unit test
(`connect-flow.spec.ts`):

- Top-level `Version`, `StartAction`, `Metadata`, `Actions`; identifiers unique, at most
  50 characters, none of the forbidden characters; every transition resolves.
- `GetParticipantInput` with `StoreInput: "False"`, `InputTimeLimitSeconds: "8"`, one
  `Equals "1"` condition, and the errors `InputTimeLimitExceeded`, `NoMatchingCondition`,
  `NoMatchingError` (the last is always required).
- `UpdateContactAttributes` with `Attributes` and `TargetContact: "Current"`.
- `DisconnectParticipant` with empty `Parameters` and `Transitions`.
- `$.Attributes.message` in prompt text: documented for the Play prompt block, which is
  `MessageParticipant`.

Not verified, because we cannot reach AWS from here and the reference pages do not say:

- The exact casing the import expects for `TextToSpeechEngine` (we use `"Neural"`; the
  admin guide writes "neural" in prose) and that `TextToSpeechStyle: "None"` is accepted.
  If the import complains about the voice block, delete it and add the block by hand (step
  1 below): the rest of the flow does not depend on it.
- That the designer lays the blocks out from our `Metadata` positions.
- That a key pressed while the message is still playing is captured. It is not in our flow:
  the message plays first, then "Press 1" is asked with an interruptible prompt, and the
  whole thing repeats once.

### Fallback: build the same flow in the designer

If the import fails, build it by hand in a new **Flow** (about ten minutes). Connect each
block's success branch as listed; error branches as noted.

1. **Set voice**: Language English (UK), Voice **Amy**, engine **Neural**, no speaking
   style. Next: block 2. (Joanna, US English, neural, is fine too.)
2. **Play prompt**: Text-to-speech, "Interpret as Text", text exactly
   `$.Attributes.message`. Next and Error: block 3.
3. **Get customer input**: Text-to-speech, text `Press 1 if you are handling this.`,
   DTMF, timeout **8** seconds. **Add condition**: `1`. Branch "1" to block 6; Timeout,
   Default and Error to block 4.
4. **Play prompt**: text `$.Attributes.message` again. Next and Error: block 5.
5. **Get customer input**: same as block 3. Branch "1" to block 6; Timeout, Default and
   Error to block 9.
6. **Set contact attributes**: Target contact Current, "Set manually", Destination key
   `confirmed`, Value `1`. Success to block 7; Error to block 8.
7. **Play prompt**: `Thank you. We have let the family know you are handling it.` To
   block 10.
8. **Play prompt**: `Thank you. We could not record that, so we will keep trying the
   family. Goodbye.` To block 10.
9. **Play prompt**: `We did not hear a response. We will keep trying the family.
   Goodbye.` To block 10.
10. **Disconnect / hang up**.

Connect the Entry point to block 1. **Save and Publish**, then copy the flow id as above.
The attribute key must be exactly `confirmed` and the value exactly `1`: the backend reads
nothing else.

## 5. IAM for the backend (least privilege)

The service authorization reference lists **contact** as the only resource type for both
`StartOutboundVoiceContact` and `GetContactAttributes`, so the tightest scope is "contacts
in this instance". IAM cannot pin the flow; the backend does (`CONNECT_CONTACT_FLOW_ID`).
Replace `ACCOUNT_ID` and `INSTANCE_ID`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ObrigadaFamilyCalls",
      "Effect": "Allow",
      "Action": ["connect:StartOutboundVoiceContact", "connect:GetContactAttributes"],
      "Resource": "arn:aws:connect:eu-central-1:ACCOUNT_ID:instance/INSTANCE_ID/contact/*",
      "Condition": { "StringEquals": { "connect:InstanceId": "INSTANCE_ID" } }
    }
  ]
}
```

The `connect:InstanceId` condition key is documented for `GetContactAttributes`. If the
policy simulator says it does not apply to `StartOutboundVoiceContact`, split that action
into its own statement without the condition.

Optional, only with `CONNECT_SMS_ORIGINATION` (the resource is your origination phone
number in End User Messaging SMS):

```json
{
  "Sid": "ObrigadaSms",
  "Effect": "Allow",
  "Action": "sms-voice:SendTextMessage",
  "Resource": "arn:aws:sms-voice:eu-central-1:ACCOUNT_ID:phone-number/PHONE_NUMBER_ID"
}
```

Attach it to the backend's identity: a dedicated IAM user for the hackathon (or the same one
as Bedrock), an instance or task role in production.

## 6. Environment

In `apps/backend/.env` (`pnpm demo:env` added these lines commented out; remove the `# `):

| Variable | Value |
| --- | --- |
| `CALL_PROVIDER` | `connect` |
| `CONNECT_REGION` | `eu-central-1` (default) |
| `CONNECT_INSTANCE_ID` | From step 1 |
| `CONNECT_CONTACT_FLOW_ID` | From step 4 |
| `CONNECT_SOURCE_PHONE_NUMBER` | From step 2, E.164 |
| `CONNECT_SMS_ORIGINATION` | Optional, see SMS above |

AWS credentials come from the default provider chain, never from the repo: in the shell
that runs the backend, `$env:AWS_PROFILE = "obrigada"` (PowerShell) or
`export AWS_PROFILE=obrigada`, or exported `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.

Selection rules (`AppConfig.callProvider`):

- `CALL_PROVIDER=connect` and the instance, flow and number all set → Connect.
- `CALL_PROVIDER=connect` with any of the three missing → Twilio if configured, otherwise
  the mock; the backend logs an error at boot and `demo:check` flags it.
- `CALL_PROVIDER=twilio`, or unset → Twilio if configured, otherwise the mock (unset is
  exactly the behaviour before this change; Connect is never picked unless asked for).
- `PUBLIC_BASE_URL` and the tunnel are not needed for Connect.

Restart the backend after changing `.env`.

## 7. Test it

```sh
pnpm demo:check
```

The **Calls** section should say `Amazon Connect in eu-central-1, calling from +44...`,
which route SMS takes, and whether AWS credentials are in the shell. Then:

```sh
pnpm demo:scene night-exit
```

What to expect:

1. Within a few seconds the backend log shows `Placed Connect call to daughter for
   incident <id> (press 1 to confirm)`, and Sofia's phone rings from the claimed number.
2. Answered, a calm voice says "This is Obrigada. Someone was at the front door at 3:04."
   then "Press 1 if you are handling this."
3. Press 1. She hears "Thank you. We have let the family know you are handling it." Within
   about 3 seconds the log shows `Contact <id> confirmed incident <id> by phone (press 1,
   connect)` and the poller stops.
4. The scene output and the family app Timeline show the call and then the
   "acknowledged" outcome. Nobody else is rung.
5. Run it again and do not press anything: the message and prompt play twice, the call
   says goodbye, and after the 45 second window Miguel's phone rings.

Run `pnpm demo:scene reset` between takes.

### When it does not ring

The backend log names the AWS error:

| Log says | Meaning | Fix |
| --- | --- | --- |
| `DestinationNotAllowedException (403)` | The destination country is not allowlisted | Step 3 |
| `AccessDeniedException (403)` | IAM | Step 5; check the instance id in the ARN |
| `ResourceNotFoundException (404)` | Wrong instance or flow id, or the flow is not published | Steps 1 and 4 |
| `InvalidParameterException` / `InvalidRequestException (400)` | Usually the source number is not claimed in this instance, or not E.164 | Step 2 |
| `LimitExceededException (429)` | Concurrent call quota | Step 3 |
| `CredentialsProviderError` | No AWS credentials in the backend shell | Step 6 |
| Rings, but press 1 is never logged | `GetContactAttributes` denied, or the attribute key is not exactly `confirmed` | Steps 4 and 5; look for `GetContactAttributes failed` |

## Costs

Not listed here: we could not confirm current per-minute rates for Germany-origin calls to
Portugal and Romania from the AWS pricing pages. Check the Amazon Connect pricing page for
eu-central-1 (service usage per minute, plus outbound telephony per destination, plus the
claimed number's daily rate) before the demo.

## Tests

`apps/backend/src/modules/escalation/notifications/connect-*.spec.ts` (request shape,
attributes, fallback, polling, region guard, the flow file),
`connect.providers.spec.ts` (provider selection matrix), `test/connect.e2e-spec.ts` (the
real app wiring), and the kill-mid-flow matrix in `temporal/workflow-ladder.spec.ts` with a
Connect press 1.
