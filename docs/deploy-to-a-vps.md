# Deploying Obrigada to an EU VPS (Contabo / Hetzner / Scaleway)

The whole stack runs in Docker Compose on one Linux VPS in an **EU** region, with Caddy
terminating HTTPS. Any EU provider works (Contabo, Hetzner, Scaleway, OVH, Netcup…) — pick one
in an EU datacentre to satisfy rule #6 and `docs/decisions/0006-eu-hosting-and-tls.md`. The
steps are identical everywhere; the only per-provider difference is the firewall (see below).
This is the companion to `deploy/README.md`.

```
Internet ──HTTPS(443)──► Caddy ──► backend:3000
Devices  ──mTLS(8883)──► EMQX          │
                                        └──► Postgres · Redis · Temporal  (internal only)
```

---

## 1. Create the instance

In your provider's console, create a VPS:

- **Region:** any **EU** datacentre (rule #6). On Contabo pick **European Union**, not the UK
  (the UK is no longer in the EU).
- **Size:** the stack runs Postgres+TimescaleDB, Redis, EMQX, Temporal, and the backend
  together, so **RAM is the constraint**. Get **8 GB** (e.g. Contabo **Cloud VPS 10** — 4 vCPU
  / 8 GB, or Hetzner CX32). A 4 GB box works but is tight; if you must, add a swap file.
- **Storage:** 40 GB+; prefer **NVMe** over SSD (faster for Postgres/Temporal).
- **Image:** **Ubuntu 24.04 LTS**.
- **Access:** add your SSH key if the provider offers it; Contabo sets a **root password** at
  order time (save it) and you add SSH keys from its panel afterward.

### Firewall — open only these four ports

| Port | Why |
|---|---|
| 22 (TCP) | SSH (restrict to your IP if you can) |
| 80 (TCP) | HTTP — Caddy's Let's Encrypt challenge + redirect |
| 443 (TCP) | HTTPS — the API |
| 8883 (TCP) | the mutual-TLS MQTT device link |

Everything else (Postgres, Redis, Temporal, the backend, the EMQX dashboard) stays on the
internal Docker network and must **not** be exposed.

**How you enforce it depends on the host:**
- **Hetzner / Scaleway / OVH** have a **cloud firewall / security group** — configure the four
  rules there.
- **Contabo has no cloud firewall by default** — the box is open, so lock it down on the server
  itself with `ufw`, first thing after logging in:

```bash
ssh root@<SERVER_IP>            # Contabo: use the root password you set at order time
apt-get update && apt-get install -y ufw
ufw default deny incoming && ufw default allow outgoing
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw allow 8883
ufw --force enable
```

Then install Docker:

```bash
curl -fsSL https://get.docker.com | sh
```

---

## 2. DNS (Namecheap)

Namecheap → Domain List → **Manage** → **Advanced DNS** → add an **A record**:

- **Host:** `api` → gives `api.yourdomain.com`
- **Value:** the instance's public IP
- **TTL:** Automatic

Wait for it to resolve (`dig api.yourdomain.com` shows the IP) before deploying — Caddy needs
it live to obtain the certificate.

---

## 3. Code, secrets, and device-link certificates

```bash
git clone <your-repo-url> obrigada && cd obrigada/deploy
cp env.prod.example .env
```

Edit `.env`:

- `DOMAIN=api.yourdomain.com` (the A record above)
- `JWT_SECRET=` → `openssl rand -base64 48`
- `POSTGRES_PASSWORD=` → `openssl rand -base64 24`
- (optional) `ANTHROPIC_API_KEY`, `TWILIO_*`, `FCM_*` to turn on narration / real calls /
  push. Left unset, safe local mocks run and you still see incidents in the app.

Generate the broker + backend + CA certificates the device link needs:

```bash
cd .. && bash scripts/gen-dev-certs.sh && cd deploy
```

This writes `certs/` (git-ignored): the CA the guardians' per-device certs are signed
against (provisioning uses it — the compose already points `DEVICE_CA_*` at it), the EMQX
broker cert, and the backend client cert. Per-device certs are issued at pairing, not here.

---

## 4. Deploy

```bash
cd deploy
docker compose -f docker-compose.prod.yml up -d --build
```

Caddy fetches a Let's Encrypt certificate automatically (needs the DNS live and 80/443 open).

### Run the database migrations

The app does not migrate on boot, and the runtime image is production-only (no migration
tooling). Run them once from a throwaway Node container on the stack's internal network — no
need to expose Postgres:

```bash
cd ~/obrigada   # repo root on the server
source deploy/.env   # for POSTGRES_PASSWORD
docker run --rm --network obrigada_default \
  -v "$PWD":/app -w /app \
  -e DATABASE_URL="postgresql://obrigada:${POSTGRES_PASSWORD}@postgres:5432/obrigada" \
  node:22-slim sh -c "corepack enable && pnpm install --frozen-lockfile && pnpm --filter @obrigada/backend db:migrate"
```

(`obrigada_default` is the compose project's network; confirm with `docker network ls`.)

---

## 5. Verify

```bash
curl https://api.yourdomain.com/health/ready   # -> {"status":"ok", ...}
```

Then a full pairing smoke test (mirrors the local one): sign up, register a device, issue a
claim code, and provision — confirming a **device cert is issued** (proves `DEVICE_CA_*` is
wired):

```bash
B=https://api.yourdomain.com
TOKEN=$(curl -s -X POST $B/auth/signup -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"password123","familyName":"Test","timezone":"Europe/Lisbon"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
DEV=$(curl -s -X POST $B/me/devices -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Kitchen"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
CODE=$(curl -s -X POST $B/me/devices/$DEV/claim-code -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['code'])")
curl -s -X POST $B/provision -H 'Content-Type: application/json' -d "{\"code\":\"$CODE\"}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('deviceCert issued:', bool(d.get('deviceCert')))"
# -> deviceCert issued: True
```

---

## 6. Point the phones at it

- **Family app:** set the API base URL to `https://api.yourdomain.com`.
- **Guardian app:** build with the public URL —
  `./gradlew installDebug -PbackendBaseUrl=https://api.yourdomain.com` (no more LAN IP; the
  phones can be anywhere). Then pair and run the two-phone scenarios in
  `docs/testing-the-guardian.md`.

---

## 7. Before real families

- **Postgres backups** of the `pgdata` volume + a tested restore (most hosts also offer
  block-storage snapshots — Contabo's Auto Backup add-on is ~€1.50/mo).
- Keep the **EMQX dashboard (18083)** unexposed (this compose does not publish it).
- Consider managed backups / a second instance for the database once you have real households.

## Updating

```bash
git pull && docker compose -f docker-compose.prod.yml up -d --build
```

Graceful shutdown drains in-flight requests; Caddy keeps serving the old container until the
new one is ready.
