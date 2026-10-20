# Amazon Bedrock (EU) as Obrigada's AI provider

Decision record: [0013](../decisions/0013-bedrock-eu-ai-provider.md). Status of the
subprocessor question: still needs founder sign-off before real family data flows.

## What runs on Bedrock

| Feature | Code path | What is sent |
| --- | --- | --- |
| Incident narration | `NarrationService.narrativeFor` → `BedrockNarrationAdapter.narrate` | Reason label, timestamps, step kinds, contact roles, allowlisted check-in result, outcome |
| Daily recap | `DailySummaryService` → `BedrockNarrationAdapter.summarizeDay` | Date, incident labels and outcomes, guardian counts |
| Family Q&A (`POST /me/ask`) | `QaService` → `BedrockNarrationAdapter.answer` | The caregiver's question plus the minimized family record |
| Generic `LLM_PORT` (care extraction from Bee notes, future callers) | `BedrockLlmAdapter.complete` | System prompt and caller-minimized text |

All calls use the Bedrock Runtime **Converse** API with one system block and one user
text block. No image, document, video or audio blocks are ever built (rules #1 and #4),
and the tests assert that. The output is descriptive text only. It never decides whether
the escalation ladder calls anyone (rule #3). If Bedrock fails or times out (15 s), the
service falls back to the deterministic local mock, so a family always gets words.

Logs record model id, region, character and token counts, and latency. Never prompt or
completion text.

Narratives persisted to `incident_narratives` record `generated_by = 'bedrock'` and the
inference profile id in `model`. The column is free text, so no migration was needed, and
the table stays append-only.

## 1. Enable model access (console, eu-central-1)

1. Sign in to the AWS console and switch the region to **Europe (Frankfurt)
   eu-central-1**.
2. Open **Amazon Bedrock**. If your console shows a **Model access** page, request access
   to the model family you want (for example an Anthropic Claude model). Anthropic models
   may ask for a short use-case form first. Access must be granted in the region you call
   from (eu-central-1).
3. Open **Cross-region inference** (under Inference and assessment, or Infrastructure,
   depending on the console version). Pick the profile for your model whose id starts
   with **`eu.`** and copy its **Inference profile ID** exactly. Also note the
   **destination regions** it lists.

### Why the `eu.` prefix matters

A cross-region inference profile lets Bedrock route a request to whichever region in a
geography has capacity. The prefix names that geography: `eu.` profiles only route
between EU regions, `us.` and `apac.` stay in those geographies, and `global.` can go
anywhere. Rule #6 requires EU only, so use an `eu.` profile id (or a plain model id that
is served in eu-central-1 itself). Do not copy a version string from this document or
from memory: take it from the console, because the available model versions change.

The backend refuses to start with Bedrock enabled if `BEDROCK_REGION` is not an `eu-*`
region or `BEDROCK_MODEL_ID` is a `us.`, `apac.`, `global.` (or other non-EU) profile.

## 2. IAM policy (least privilege)

Converse is authorized by `bedrock:InvokeModel`. With an inference profile you must allow
the profile **and** the underlying foundation model in every region the profile routes
to. Replace `ACCOUNT_ID`, `EU_PROFILE_ID` (the full id you copied, starting with `eu.`)
and `MODEL_ID` (the same id **without** the `eu.` prefix).

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InvokeEuInferenceProfile",
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel"],
      "Resource": "arn:aws:bedrock:eu-central-1:ACCOUNT_ID:inference-profile/EU_PROFILE_ID"
    },
    {
      "Sid": "InvokeUnderlyingModelOnlyViaThatProfile",
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel"],
      "Resource": "arn:aws:bedrock:eu-*::foundation-model/MODEL_ID",
      "Condition": {
        "StringLike": {
          "bedrock:InferenceProfileArn": "arn:aws:bedrock:eu-central-1:ACCOUNT_ID:inference-profile/EU_PROFILE_ID"
        }
      }
    }
  ]
}
```

The `eu-*` wildcard covers the destination regions of an EU profile. You can list them
explicitly instead (from the profile's details page). We do not stream, so
`bedrock:InvokeModelWithResponseStream` is not needed.

Attach the policy to the backend's runtime identity: an instance or task role in
production, or a dedicated IAM user for the hackathon demo.

## 3. Environment

| Variable | Value |
| --- | --- |
| `AI_PROVIDER` | `bedrock` |
| `BEDROCK_REGION` | `eu-central-1` (default) |
| `BEDROCK_MODEL_ID` | The `eu.` inference profile id from step 1 |

Credentials come from the default AWS provider chain, never from code or a committed env
file: `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (and `AWS_SESSION_TOKEN`) exported in
the shell, `AWS_PROFILE` with SSO, or the instance/task role.

Selection rules (`AppConfig.aiProvider`):

- `AI_PROVIDER=bedrock` with `BEDROCK_MODEL_ID` set → Bedrock. Without a model id → mock.
- `AI_PROVIDER=anthropic` with `ANTHROPIC_API_KEY` → Claude API (still gated by 0002).
- `AI_PROVIDER=mock` → mock, even if other keys are present.
- Unset → Claude API if `ANTHROPIC_API_KEY` is set (previous behaviour), otherwise mock.

## 4. Verify with one request

Start the backend with the variables above (`pnpm backend:dev`). Then sign up a demo
caregiver and ask a question. `signup` returns a JWT in `token`.

```sh
TOKEN=$(curl -s localhost:3000/auth/signup -H 'content-type: application/json' \
  -d '{"email":"demo@example.com","password":"demo-pass-123","familyName":"Demo"}' \
  | sed -E 's/.*"token":"([^"]+)".*/\1/')

curl -s localhost:3000/me/ask -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"question":"How was today?"}'
```

(If the demo user already exists, use `/auth/login` with the same email and password.)

How to tell Bedrock answered:

- The backend log shows `bedrock converse ok model=eu.… region=eu-central-1 … ms=…`.
- The answer reads like a direct reply to the question. The mock fallback always starts
  with "Here is what I can tell you from the record."
- On failure the log shows `Narration adapter failed, using local mock: Bedrock call
  failed: <AwsErrorName> (<status>) …` with a hint. `AccessDeniedException` means model
  access or IAM; `ValidationException` or `ResourceNotFoundException` usually means the
  profile id is wrong for the region.

## Tests

`apps/backend/src/modules/ai/*.spec.ts` and
`apps/backend/src/modules/escalation/narration/bedrock-narration.adapter.spec.ts` cover
the provider matrix, the exact Converse request shape (region, model id, system and user,
no media), JSON fence stripping, error and timeout mapping, log hygiene, and narration end
to end with a stubbed client. The Bedrock client is injected through the `BEDROCK_CLIENT`
token, so tests stub `send()` and never reach AWS.
