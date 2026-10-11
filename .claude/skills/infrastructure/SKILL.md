---
name: infrastructure
description: >
  AWS infrastructure (CDK) and CI/CD (GitHub Actions) rules for vera-api: accounts,
  environments, pipelines, secrets, cost guardrails. Use this skill whenever touching infra/,
  workflows, deploys, environment config, SSM parameters, or AWS resources. Triggers on: "CDK",
  "deploy", "pipeline", "CI", "GitHub Actions", "infra", "SSM", "secrets", "environment", "OIDC",
  "Fargate", "RDS", "VPC", "custo", "cost".
---

# Infrastructure & CI/CD — vera-api

## Environments

Two environments, **dev** and **prod**. Both exist in code and in the workflows, so anyone who
clones the project gets both ready to use in their own AWS account. In the version hosted by
Revtriever, **dev stays switched off**: nobody pays for it until someone decides to turn it on.
`deploy-dev` therefore runs **only by manual dispatch**; `deploy-prod` runs from `main` after a green
CI.

- Account IDs, regions, role ARNs, VPC/subnet/security-group/RDS identifiers and endpoints are
  **never** written in this repository — it is public. They come from repository/organization
  **variables and secrets** (`vars.*`, `secrets.*`) and from SSM Parameter Store, and CDK reads them
  from the environment of the deploy.
- A management account (org, billing, SSO) is never a deploy target — **nothing deploys there, ever**.
- Local AWS access uses SSO profiles configured on each developer's machine; profile names and SSO
  URLs are not documented in the repo.

## CDK (TypeScript, `infra/` in this repo)

- Same repo as the app, same language. Environment differences are data
  (`infra/config/dev.ts` / `prod.ts`), not duplicated stacks. Those files hold only non-sensitive
  shape (sizes, flags, schedules); identifiers of existing resources are read from the deploy
  environment.
- Stacks `vera-{network,cert,data,storage,mail,app}-{env}` (`vera-*-dev` and `vera-*-prod`).
  `network`/`data` either import existing network and data resources (identifiers supplied by
  variables) or provision their own, depending on the account — the app code does not care.
- `app` stack: ECS Fargate task with a `cloudflared` sidecar (no ALB, no NAT — the tunnel is the
  ingress); dev runs on Spot with `offHoursShutdown`.
- **Shared constants** (`shared/*.constants.ts`) are imported by BOTH app and CDK: queue names,
  schedule expressions, message types, SSM parameter names. Drift between infra and consumers must
  be a compile error.
- CDK owns long-lived infra: the stacks above, queues, schedules, roles, alarms. It does NOT own:
  DB schema (kysely-ctl in the pipeline), runtime data, feature config.
- Console changes to CDK-managed resources are forbidden — if it's worth changing, it's worth a PR
  (`cdk diff` makes the review concrete).
- **Self-hosting**: every cloud dependency needs a local alternative or an adapter behind a port, so
  the product also runs with Docker Compose (queues are BullMQ + Redis, which run anywhere). A
  feature that hard-requires an AWS-only service without a port is a review blocker.

## Environment config & secrets

Three boxes (see also local-dev skill):

1. **Non-secret config → code**: typed per-env objects in `infra/config/`, injected as plain env
   vars into the task definition. Changing config = a reviewable PR diff.
2. **Real secrets → SSM Parameter Store** (SecureString, path `/vera/<name>`), referenced by
   CDK and injected by ECS at task start. Few by design: `/vera/database-url`,
   `/vera/jwt-secret`, `/vera/tunnel-token`, OTLP headers, provider secrets. Rotation
   = update parameter + force new deployment. Secret **values** never appear in the repository,
   in a workflow file or in an issue/PR.
3. **User credentials are DATA, not config** (provider access tokens, open-finance consents):
   Postgres + KMS envelope encryption (`CryptoPort`). Never in SSM, never in env, never in logs.

Secrets Manager is not used (SSM SecureString covers us; revisit only if we need automatic
rotation lambdas).

## Health and lifecycle

- `GET /health` is liveness: static, never touches dependencies — a slow database must not make ECS
  kill the task.
- `GET /health/ready` is readiness: checks the database and returns `degraded` on failure — the
  instance leaves the load balancer without being killed.
- `app.enableShutdownHooks()` is on: SIGTERM drains in-flight requests and stops queue consumers
  before exit, so a deploy never cuts a request mid-flight.

## CI/CD (GitHub Actions)

- **Runners**: GitHub-hosted `ubuntu-latest` only.
- **PR**: build packages → lint → typecheck → unit → integration (Testcontainers) →
  **migration drift guard** (runs migrate + codegen and fails if the committed generated types
  differ) → `cdk diff` posted as PR comment → **SonarCloud** scan (`SonarSource/sonarqube-scan-action`
  with `SONAR_TOKEN`, organization and project key from `sonar-project.properties`/variables —
  free for public projects; gated by `vars.SONAR_ENABLED == 'true'` so it skips on its own until
  the project exists). Merge blocked on red.
- **main**: build image → push ECR → migrate (kysely-ctl, from the pipeline, before traffic) →
  `cdk deploy`. **`deploy-prod.yml` runs via `workflow_run` of the green `CI` on `main`** — never a
  direct push or a release tag (a push-triggered prod deploy can race a still-running CI). It also
  accepts `workflow_dispatch` with an existing ECR image tag for rollback.
- **`deploy-dev.yml` is manual only** (`workflow_dispatch`): dev is off in the hosted version.
- **Auth = OIDC only**: each workflow assumes a deploy role in the matching account, whose ARN comes
  from a repository/environment variable (a dev workflow physically cannot touch prod). Zero
  long-lived AWS keys in GitHub — if a workflow asks for `AWS_ACCESS_KEY_ID`, the workflow is wrong.
- Hooks are local convenience; **CI is the enforcement** (conventions skill).

## Cost guardrails (side-project reality)

- A budget alarm lives in the management account. Treat approaching it as a design smell.
- **No NAT Gateway, no ALB** (the Cloudflare Tunnel is the ingress): tasks in public subnets
  with tight security groups; VPC endpoints (SQS, ECR, SSM, KMS, CloudWatch) when private subnets
  become necessary.
- Prefer small, single-AZ data instances (`t4g.micro` class) until load says otherwise.
- Fargate: 1 task dev (Spot, `offHoursShutdown`) / start with 1 in prod; queue-depth-based scaling
  comes later.
- Anything always-on added to the stack needs a line in the PR description stating its monthly
  cost.

## Deploy safety

- Migrations are **expand → deploy → contract** (data-access skill) — the running old version must
  tolerate the new schema.
- Rollback = redeploy previous image tag (migrations don't roll back; they roll forward).
- A failed prod deploy leaves the previous task set serving — ECS circuit breaker on, rollback
  automatic.
