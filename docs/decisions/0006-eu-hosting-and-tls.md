# 0006 — EU hosting and TLS termination

Status: **proposed — needs founder sign-off before the first production deploy** · Date: 2026-07-09 · Feature: Ops

## Context

The backend has to run somewhere for real families to use it, and rule #6 requires
that "somewhere" to be in the EU: no service, subprocessor, or region outside the EU
without a recorded founder decision. This record proposes the first hosting setup.

Constraints from CONTRIBUTING.md: bootstrapped + EU grants, so infrastructure must stay
cheap; prefer boring, operable choices over impressive ones; no new managed services
without a decision record.

## Decision

**Host: a single EU VPS.** The whole stack — the NestJS backend, TimescaleDB, Redis,
EMQX, and Temporal — runs in Docker Compose on one small virtual server in an EU
region. Recommended provider: **Hetzner** (German company, data centres in Germany
and Finland, ~€5/month for a box that runs this comfortably). Any EU provider that
runs Docker is acceptable; the region must be in the EU.

**TLS: Caddy in front.** A Caddy reverse proxy terminates HTTPS for the domain and
proxies to the backend. Caddy obtains and auto-renews a free Let's Encrypt
certificate — no manual cert management. The API is only reachable over HTTPS; the
backend port is never exposed directly.

**Domain:** registered at Namecheap; a single DNS A record points the API subdomain
at the VPS IP. DNS is not a personal-data processor, so the registrar's location is
not a rule-#6 concern; only the server region is.

Why one VPS and not managed services: cheapest, fully EU-controlled, and it matches
what we already run locally (same `docker compose`). Managed platforms (Render, Fly,
Railway) are easier but pricier and rarely EU-region-guaranteed on the cheap tiers.
Temporal Cloud and managed TimescaleDB are deferred until scale or ops load justifies
the cost — each would be its own decision record.

## What this changes

- New `deploy/` config: a production `docker-compose.prod.yml` (adds Caddy, hardens
  the services, gives Temporal persistent Postgres storage) + a Caddyfile + an env
  template + a runbook.
- The backend trusts the proxy for the real client IP (`BEHIND_PROXY=true`) so
  per-IP rate limiting and request logging see the caller, not Caddy.
- Secrets (JWT secret, DB password) come from the server's env file, never the repo.

## Consequences

- One cheap, EU-hosted, HTTPS API — which also unblocks the clean mobile path (the
  apps point at `https://<domain>` instead of a LAN IP; Play Store / TestFlight work
  without cleartext).
- One box is a single point of failure; acceptable for the pilot. Backups of the
  Postgres volume and a documented restore are the first follow-up before real
  families onboard.

## To be completed by Souheila / Wil / Daniel

1. Confirm the provider and EU region (e.g. Hetzner, Nuremberg/Falkenstein/Helsinki).
2. Confirm the backup plan for the Postgres volume before onboarding real families.
