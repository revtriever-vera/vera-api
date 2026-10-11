---
name: local-dev
description: >
  Local development environment for vera-api: docker compose services, env generation,
  simulating queues/ticks/email locally. Use this skill whenever setting up the project locally,
  adding a compose service, debugging local infra, or wiring a new external dependency for dev.
  Triggers on: "local", "docker compose", "LocalStack", "Mailpit", "ambiente local", "rodar
  localmente", "env", ".env", "seed", "tick local".
---

# Local Development — vera-api

Everything runs in `docker compose`; the app runs on the host (`npm run start:dev`).

## Services

| Service    | Image                                       | Ports                   | Purpose                                                 |
| ---------- | ------------------------------------------- | ----------------------- | ------------------------------------------------------- |
| postgres   | postgres:16                                 | 5436                    | dev database (normal volume; tmpfs is for tests)        |
| redis      | grokzen/redis-cluster:7.0.10                | 7100–7105               | Redis Cluster, same topology as the hosted Redis/Valkey |
| localstack | localstack/localstack:4                     | 4576                    | SSM + AWS adapters                                      |
| mailpit    | axllent/mailpit                             | 1026 (SMTP) / 8026 (UI) | catches all outbound email                              |
| lgtm       | grafana/otel-lgtm (profile `observability`) | 4319 (OTLP) / 3002 (UI) | local Grafana+Loki+Tempo+Prometheus                     |

Ports are Vera's own on purpose, so the stack can run next to other projects' compose stacks that use the
default ports (5432, 7000–7005, 4566, 1025/8025, 3001/4318). The API itself listens on 3333.

- **Mailpit, not Mailhog** (Mailhog is unmaintained). MailPort's SMTP driver points at 1026; every
  email the app sends appears at `localhost:8026` — also queryable via REST API in E2E tests.
- **LocalStack**: AWS SDK v3 redirects via `AWS_ENDPOINT_URL=http://localhost:4576` — an env var,
  never conditional code. `compose/localstack-init/` holds the bootstrap script creating AWS-side resources
  on container start (names imported from the same shared constants the CDK uses).
- **lgtm**: local telemetry stays local — dev traffic never pollutes the real Grafana. Same OTLP
  pipeline as prod; only the endpoint differs.

## Env

- `.env` is **generated, never hand-maintained**: `npm run env:pull` composes it from the
  versioned dev config (non-secrets) + SSM via SSO profile when needed (real secrets) + local
  overrides for compose endpoints. `.env.example` is documentation of the shape only.
- Local defaults NEVER contain real provider credentials — sandbox/test accounts only (see the rule
  below).

## Simulating the world

- **Queues**: BullMQ over the Redis Cluster the compose file brings up — consumers run inside
  `start:dev` normally.
- **Cron ticks**: cron commands register locally too, so the schedule really fires. When you don't
  want to wait for the next boundary, `npm run tick -- <name>` publishes the tick by hand (e.g. the
  transactions import sweep).
- **Email**: just send — Mailpit catches everything. There is no path to a real mailbox from local.

## Safety rails (non-negotiable)

- Local/dev always points at **provider sandboxes and test accounts** — never production
  credentials of anyone.
- Anything the app sends in non-prod (email, notifications) goes through the no-real-send guard:
  drivers in dev refuse non-allowlisted recipients. A dev environment that can message a real
  person is an incident, not a convenience.
- The repository is public: `.env`, SSO profile names, account IDs and endpoints never get
  committed; `.env.example` documents the shape with placeholders only.

## First run

```
docker compose up -d
npm run env:pull
npm run migrate:latest && npm run codegen
npm run seed:dev          # creates a dev Company + User (onboarding pre-completed)
npm run start:dev
```

`seed:dev` is idempotent — safe to re-run. It seeds ONLY local-obvious data (company "Dev Corp",
user dev@vera.local) and refuses to run when NODE_ENV=production.
