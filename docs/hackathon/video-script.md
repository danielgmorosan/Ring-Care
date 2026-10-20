# Demo video script

Target: 2 minutes 55 seconds. Hard limit: under 3 minutes. Staging for every scene is in
[demo-runbook.md](./demo-runbook.md).

On-screen labels, used exactly as written, in a small corner caption:

- **Ring Developer Playground** when the screen shows the Playground or data from it.
- **Simulated event** when a Ring event comes from `ring:sim`.
- **Our test footage** when a person on camera is one of us, staged.

Never show a real person's door, face or home without their consent. Never show a real
phone number. Voiceover is calm and plain.

---

## 1. The story (0:00 to 0:15, 15 s)

**Picture:** A dark hallway. A front door, closed. Our test footage only, no faces.
Caption: **Our test footage**.

**Voiceover:**
> Our neighbour has Alzheimer's. One night at three, he opened his front door and walked
> out. His daughter was asleep. She had to be. Nobody knew until morning.

**Title card (2 s):** Obrigada. The care layer after the doorbell.

## 2. Night exit, the hero (0:15 to 1:05, 50 s)

**Picture:** Split screen. Left: terminal running
`ring:sim --scenario night-exit`. Right: the family app timeline in the browser.
Caption: **Simulated event**.

**Voiceover:**
> This is the same moment with Obrigada. His Ring doorbell sees a person at the front door
> at 3:04. Ring already knows that much. What happens next is ours.

**Picture:** Backend log line: incident opened. Sofia's phone lights up with the call.
Caption stays: **Simulated event**.

**Voiceover:**
> It is the middle of the night, so Obrigada does not wait for morning. It calls Sofia,
> his daughter, through her quiet hours. Then Miguel, her brother. Then Rosa next door.

**Picture:** The text on a phone: "Someone was at the front door at 3:04. We haven't
reached anyone by phone yet. Please check on home." Then Sofia taps **I'm handling this**
in the app.

**Voiceover:**
> Sofia taps "I'm handling this." Everyone can see who responded, and when.

**Picture:** Timeline close-up: "Someone was at the front door at night", "Seen by Ring at
the front door", each call step, the outcome chip.

**Voiceover:**
> One thing it never does: call emergency services from a doorbell. A person at the door is
> a family matter first. That rule lives in the safety core, not in a model.

**Picture (5 s):** The Ring screen with the activity row tagged **Night door** and
**Simulated**. If filmed with a Playground token, a second shot of the camera list with
caption **Ring Developer Playground**.

## 3. A fall indoors (1:05 to 1:35, 30 s)

**Picture:** The guardian phone on a kitchen shelf. One of us lies down slowly on a mat.
Caption: **Our test footage**.

**Voiceover:**
> Inside, an old phone on a shelf watches for falls. The picture never leaves the phone.
> Only a label does.

**Picture:** The guardian asks aloud, "Are you okay?" No answer. The family app shows
"Possible fall" and the ladder moving.

**Voiceover:**
> It asks, in his own language, if he is okay. No answer, so it calls the family. A fall
> is the only case where the ladder can move on to emergency services.

## 4. Bee after the doctor (1:35 to 2:05, 30 s)

**Picture:** Sofia outside a clinic, speaking to her Apple Watch. Our test footage.

**Voiceover:**
> After the GP visit, Sofia tells her Bee what changed. In her own words, after the
> appointment. We never record the doctor.

**Picture:** On screen, her note: "Mom's Donepezil goes to 5 mg at 8 pm from Monday, blood
test in two weeks, pick up the new prescription." Then the Care tab with three proposed
items. She approves. Caption, if the mock Bee is used: **Simulated Bee note**.

**Voiceover:**
> Obrigada turns it into a care-plan proposal. Nothing changes until she approves. Approved
> items come back to her wrist as reminders.

**Picture:** A Bee reminder on the watch, or the todo log line if filming with the mock.

## 5. "How was Mom today?" (2:05 to 2:25, 20 s)

**Picture:** Home screen. Sofia types "How was Mom today?" and taps **Ask**. The answer
appears.

**Voiceover:**
> At the end of the day she asks how her mother was. Amazon Bedrock, running in Frankfurt,
> writes the answer from the record. Text in, text out. No video, no audio, and it decides
> nothing.

**Picture (2 s):** The backend log line `bedrock converse ok model=eu.… region=eu-central-1`.

## 6. Architecture, consent and the ask (2:25 to 2:55, 30 s)

**Picture:** The README architecture diagram, building up in three steps: Ring at the door,
the guardian inside, Bee on the wrist, all feeding one deterministic ladder.

**Voiceover:**
> Ring video stays in the family's Ring account. We keep labels and times. Live view is a
> window, not a recording, and every look is logged. Every step is written down and never
> rewritten. The family links their own accounts and can stop at any time.

**Picture:** Three short lines on screen:
- Familiar Faces for people the family enrols.
- A "person down" Smart Alert.
- The Ring Appstore in Europe.

**Voiceover:**
> Three things would help families most: Familiar Faces for people the family enrols, a
> "person down" alert, and the Ring Appstore in Europe, where our first families live.
> Obrigada. So no one finds out in the morning.

**End card (hold to 2:55):** Obrigada. MIT licensed. Repository link. [TEAM TO FILL]

---

## Shot list

| # | Shot | Source | Label |
| --- | --- | --- | --- |
| 1 | Dark hallway, closed door | Filmed by us | Our test footage |
| 2 | Terminal with `ring:sim --scenario night-exit` | Screen capture | Simulated event |
| 3 | Timeline filling in | Family app (web) | Simulated event |
| 4 | Phones ringing, then the text | Phones with Twilio, numbers blurred | Simulated event |
| 5 | Tap "I'm handling this" | Family app | none |
| 6 | Ring activity with Night door and Simulated tags | Family app | Simulated event |
| 7 | Camera list (optional) | Playground token | Ring Developer Playground |
| 8 | Fall on a mat in front of the guardian | Filmed by us | Our test footage |
| 9 | Sofia speaking to her watch | Filmed by us | Our test footage |
| 10 | Care proposal approve | Family app | Simulated Bee note, if mock |
| 11 | Ask and answer, Bedrock log line | Family app, terminal | none |
| 12 | Architecture build | README diagram | none |

## Timing check

| Scene | Seconds | Ends at |
| --- | --- | --- |
| Story | 15 | 0:15 |
| Night exit | 50 | 1:05 |
| Fall | 30 | 1:35 |
| Bee | 30 | 2:05 |
| How was Mom today? | 20 | 2:25 |
| Architecture, consent, ask | 30 | 2:55 |

Notes for the edit:

- Calls currently ring the whole chain within seconds (the call adapter cannot yet detect an
  answer). Cut between phones so the order reads Sofia, Miguel, Rosa, and do not claim the
  system waited for each one.
- If Bedrock is unavailable on filming day, drop the log line in scene 5 and do not say
  "Bedrock writes the answer" over a mock answer.
