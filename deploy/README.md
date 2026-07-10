# Deploying Obrigada

The whole stack runs in Docker Compose on one EU VPS, with Caddy terminating HTTPS
for your domain. See `docs/decisions/0006-eu-hosting-and-tls.md` for the why.

> Want a step-by-step, hands-on guide for a specific EU VPS (Contabo, Hetzner, Scaleway…)?
> See [`docs/deploy-to-a-vps.md`](../docs/deploy-to-a-vps.md) — instance size, firewall
> (cloud security group **or** `ufw` for Contabo), DNS, migrations, and pointing the phones at it.

```
Internet ──HTTPS(443)──► Caddy ──► backend:3000
Devices  ──mTLS(8883)──► EMQX          │
                                        └──► Postgres · Redis · Temporal  (internal only)
```

## One-time setup

### 1. A server (EU)
Create a small VPS in an **EU region** — Hetzner CX22 (~€5/mo) is plenty. Ubuntu 24.04.
Install Docker:
```bash
curl -fsSL https://get.docker.com | sh
```

### 2. DNS (Namecheap)
In Namecheap → Domain List → **Manage** → **Advanced DNS**, add an **A record**:
- **Host:** `api` (gives you `api.yourdomain.com`) — or `@` for the root domain
- **Value:** your server's public IP
- **TTL:** Automatic

### 3. Get the code + secrets on the server
```bash
git clone <repo> obrigada && cd obrigada/deploy
cp env.prod.example .env
# edit .env: set DOMAIN (the A record above), and generate the two secrets:
#   openssl rand -base64 48   # -> JWT_SECRET
#   openssl rand -base64 24   # -> POSTGRES_PASSWORD
```

### 4. Device-link certificates (mTLS)
Generate the broker + backend certificates the device link needs:
```bash
cd .. && bash scripts/gen-dev-certs.sh && cd deploy
```
This writes `certs/` (git-ignored), which the compose mounts into EMQX and the backend.
Per-device certificates are issued later by the provisioning flow, not here.

## Deploy

```bash
cd deploy
docker compose -f docker-compose.prod.yml up -d --build
```

Caddy fetches a Let's Encrypt certificate automatically (needs DNS live + ports 80/443
open in the firewall). Open the firewall for **80, 443, 8883** only.

## Database migrations
The app does not migrate on boot. Run migrations against the deployed database from a
machine that has the repo (or `docker compose exec`):
```bash
DATABASE_URL="postgresql://obrigada:<POSTGRES_PASSWORD>@<server-ip>:5432/obrigada" \
  pnpm --filter @obrigada/backend db:migrate
```
(For that one command, temporarily expose Postgres, or run it from inside the network.)

## Verify
```bash
curl https://<DOMAIN>/health/ready   # -> {"status":"ok", ...}
```

## Update (zero-downtime)
```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```
Graceful shutdown drains in-flight requests (readiness reports 503 first); Caddy keeps
serving the old container until the new one is ready.

## Follow-ups before real families
- **Postgres backups** of the `pgdata` volume + a tested restore.
- Restrict the EMQX dashboard (18083) — not exposed by this compose; keep it that way
  or put it behind Caddy with auth.
