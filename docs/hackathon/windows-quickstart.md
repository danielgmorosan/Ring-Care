# Windows quickstart: from a fresh clone to a ringing phone

The short path for the live run on a Windows PC, in PowerShell. Every command here also
works in bash on macOS or Linux. The [demo runbook](./demo-runbook.md) stays the detailed
reference for each scene; this page is the order to do things in.

What the `pnpm demo:*` commands do:

| Command | What it does |
| --- | --- |
| `pnpm demo:env` | Creates `apps/backend/.env` from `.env.example` if it is missing, then adds only the demo values it does not mention yet. Never changes a value already there. |
| `pnpm demo:up` | Checks Node 22, Docker Desktop and ports 3000, 5433, 6379, 7233. Starts Postgres, Redis and Temporal, waits for them, migrates. Does not start the backend. |
| `pnpm demo:seed` | Signs up or logs in Sofia, links Ring and Bee to her family in `.env`, adds the contacts, Anna's visit, two medications and the front-door Ring camera. Safe to run again. |
| `pnpm demo:scene <name>` | One take: `night-exit`, `carer-arrival`, `carer-no-show`, `bee-note`, `ask`, `reset`, `status`. Says what the app should show and follows the incident. |
| `pnpm demo:check` | One screen: backend, Postgres, Temporal, Twilio and tunnel, AI provider, Ring, Bee, the seeded family. |

## 0. Install once

- **Node 22 LTS**: `winget install OpenJS.NodeJS.LTS`. Open a new terminal after.
- **pnpm 10**: `corepack enable` (from an admin PowerShell), or `npm install -g pnpm@10`.
- **Docker Desktop**, started, showing "Engine running".
- **Git**: `winget install Git.Git`.
- **cloudflared** for the Twilio callbacks: `winget install --id Cloudflare.cloudflared`
  (or ngrok).

Check: `node -v` says v22, `pnpm -v` says 10.

## 1. Clone and install

```powershell
git clone https://github.com/<org>/obrigada.git
cd obrigada
pnpm install
pnpm demo:env
```

`demo:env` prints every line it added. The webhook secrets it writes are random and local
to this PC. `apps/backend/.env` is gitignored; the command checks that and stops if not.

## 2. Twilio and the tunnel (for real calls)

Skip this section for a dry run: without Twilio, the mock logs each call and text and no
phone rings.

Terminal **T1**, keep it open for the whole session:

```powershell
cloudflared tunnel --url http://localhost:3000
# or: ngrok http 3000
```

It prints an `https://<random>.trycloudflare.com` host. Open the env file:

```powershell
notepad apps\backend\.env
```

At the bottom, remove the `# ` in front of these four lines and fill them in from the
Twilio console:

```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+351...
PUBLIC_BASE_URL=https://<the host cloudflared printed>
```

`PUBLIC_BASE_URL` is the https origin only: no path, no trailing slash. It is what turns on
"Press 1 if you are handling this". Each new tunnel host means updating it and restarting
the backend. On a trial account, verify Sofia's, Miguel's and Rosa's numbers in the Twilio
console first. Never commit this file.

The tunnel relays our backend through a service that is not EU-pinned (rule 6). Use it with
the demo household only, never with a real family's data.

## 3. Bring the stack up

Terminal **T2**:

```powershell
pnpm demo:up
```

If Docker is not running, or a port is taken, it says what to do. When it prints
"Database migrated", start the backend in terminal **T3** and leave it open so you can
read its log:

```powershell
pnpm backend:dev
```

The first time, Windows Firewall asks about **Node.js JavaScript Runtime**: allow it on
**Private networks**. The guardian phone needs that to reach port 3000. Docker Desktop may
ask the same for its backend; allow it on Private networks too.

## 4. Seed the household

Back in **T2**. Quote phone numbers in PowerShell: a bare `+351...` is read as a number and
loses its `+`.

```powershell
pnpm demo:seed --sofia "+351912345678" --miguel "+351913456789" --rosa "+351914567890"
```

The first run writes `RING_FAMILY_ID` and `BEE_FAMILY_ID` into `apps/backend/.env` and asks
for a restart. In **T3** press Ctrl+C (answer Y if asked), run `pnpm backend:dev` again,
then in **T2**:

```powershell
pnpm demo:seed
pnpm demo:check
```

The second seed adds what was missing (the Ring camera, placed at the front door) and
leaves the rest alone. Phones may also come from `$env:DEMO_PHONE_SOFIA`,
`$env:DEMO_PHONE_MIGUEL` and `$env:DEMO_PHONE_ROSA`. Other flags: `--email`, `--password`,
`--base`. The login token is saved in `.demo/session.json` (gitignored) for the next
commands.

`demo:check` ends with "All set for the live run" when Temporal, Twilio and the tunnel are
all reachable.

## 5. The family app in a browser

Terminal **T4**:

```powershell
$env:EXPO_PUBLIC_API_URL = "http://localhost:3000"
pnpm --filter @obrigada/family web
```

Log in as `sofia@example.com` / `demo-pass-123`. The browser gets no push; film the calls
and the Timeline.

## 6. The first ringing phone

In **T2**:

```powershell
pnpm demo:scene night-exit
```

Sofia's phone rings within seconds: "This is Obrigada. Someone was at the front door at
3:04. Press 1 if you are handling this." The command follows the ladder step by step. Then:

```powershell
pnpm demo:scene carer-arrival
pnpm demo:scene bee-note
pnpm demo:scene ask
pnpm demo:scene carer-no-show     # waits about 3 minutes for the alert
pnpm demo:scene reset             # all-clear for anything still open, before the next take
```

If `night-exit` says "the escalation engine (Temporal) is not running", the backend
started without Temporal: Obrigada alerted the family in the app but called no one. Run
`pnpm demo:up` and restart the backend.

## 7. The guardian phone (optional)

Build the APK on GitHub once the repo is pushed there:

1. Find the PC's LAN address: run `ipconfig` and read **IPv4 Address** under
   **Wireless LAN adapter Wi-Fi**, for example `192.168.1.42`.
2. On GitHub: **Actions**, **Guardian APK**, **Run workflow**. Set `backendBaseUrl` to
   `http://<LAN-IP>:3000`, for example `http://192.168.1.42:3000`.
3. Download the `obrigada-guardian-debug-apk` artifact from the run, unzip it, copy
   `app-debug.apk` to the phone and install it (allow installs from unknown sources).

The guardian phone must be on the **same Wi-Fi** as the PC, with no VPN. The Wi-Fi must be a
Private network on Windows (`Get-NetConnectionProfile`; switch with
`Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private` in an admin
PowerShell). Check from the phone's browser that `http://<LAN-IP>:3000/health/live` answers.
A LAN address can change between days; check `ipconfig` again on the day and rebuild if it
did.

The guardian's live link is mutual-TLS MQTT, as
[testing-the-guardian.md](../testing-the-guardian.md) describes: dev certificates from
`scripts/gen-dev-certs.sh` (a bash script: run it in Git Bash), the `MQTT_*` and
`DEVICE_CA_*` lines switched back on in `apps/backend/.env`, `docker compose up -d emqx`,
and port **8883** reachable from the phone (allow it in Windows Firewall). Set
`DEVICE_MQTT_URL=mqtts://<LAN-IP>:8883` too: provisioning hands that address to the phone,
and the default (`MQTT_URL`, localhost) is not reachable from it. **(verify)** The dev
broker certificate names `localhost` and `emqx` only, so the phone may refuse a LAN IP.
If the status pill stays on Connecting, film the fall with Scene B of the runbook instead.

If a firewall prompt was dismissed, allow the ports by hand in an admin PowerShell:

```powershell
New-NetFirewallRule -DisplayName "Obrigada backend" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "Obrigada MQTT" -Direction Inbound -Protocol TCP -LocalPort 8883 -Action Allow -Profile Private
```

## Starting over

Incidents and Ring events are append-only. `pnpm demo:scene reset` closes what is open
with an all-clear; it deletes nothing. For an empty database: `docker compose down -v`,
then `pnpm demo:up`, `pnpm demo:seed`, restart the backend, `pnpm demo:seed`.

## For developers without Docker

`DEMO_EXTERNAL_SERVICES=1 pnpm demo:up` (PowerShell: `$env:DEMO_EXTERNAL_SERVICES = "1"`)
skips Docker and Compose and uses whatever `DATABASE_URL` and `TEMPORAL_ADDRESS` in
`apps/backend/.env` point at. Dev only, not for the live run. The pure parts of the tooling
have tests: `pnpm demo:test`.
