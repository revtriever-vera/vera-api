---
name: api-conventions
description: >
  DTO validation with zod, mandatory OpenAPI documentation, thin controllers and the error contract
  for the NestJS repositories. Use when creating DTOs or endpoints, documenting an API, or handling
  errors. For language, typing, lint and git rules see the conventions skill. Triggers on: "DTO",
  "validation", "zod", "swagger", "openapi", "controller", "error", "exception", "problem+json".
---

# API conventions — NestJS repositories

Complements the org-wide `conventions` skill, which owns language, typing, lint and git. Everything
here is specific to the NestJS side and is not synced to the frontend.

## Validation & DTOs — zod everywhere

One validation library for the whole system: **zod** (config already uses it).

- HTTP input: zod schema per endpoint (`create-company.schema.ts` in the module's `validation/`),
  wired via nestjs-zod pipe. The inferred type IS the DTO — no class-validator, no duplicated
  interfaces.
- Queue payloads and provider callbacks: same pattern — parse at the boundary, trust types inside.
- Rule: **parse, don't validate** — after the boundary, data is typed and never re-checked.

## API documentation (mandatory per endpoint)

Zod is the single source of truth for docs — schemas carry `.describe()` on EVERY field, and the
custom decorators in `core/http` render them into OpenAPI (no `patchNestJsSwagger` — it breaks with
@nestjs/swagger v11; `zodToOpenAPI` only):

- `@ApiTags('<module>')` on every controller; `@ApiOperation({ summary, description })` on every
  endpoint — description says what happens, not just what it is.
- Request: `@ApiZodBody(schema)` for bodies, `@ApiZodQuery(schema)` for query params (renders each
  param individually with description/required).
- Response: `@ApiZodResponse({ status, description, schema })` — response schemas live in the
  module's `validation/` next to the request schemas; paginated responses compose
  `pageSchemaOf(itemSchema)` from `shared/pagination`.
- Errors: `@ApiProblemResponse({ status, description, example? })` for every AppError the endpoint
  can throw — with a realistic example (real code, realistic ids). 400 zod is documented on every
  validated endpoint.
- An endpoint without these decorators does not pass review — undocumented API is unfinished API.

The frontend's types are generated from this OpenAPI document (`openapi-typescript` against
`/docs-json`). A missing `.describe()` or a wrong response schema does not stay a documentation
problem — it becomes a wrong type in the client.

## Controllers stay thin

A controller receives, delegates and serializes. Any shape conversion beyond that (schema
introspection, DTO assembly from multiple sources, formatting) belongs to a mapper in the module's
`services/` — testable in isolation, reusable by other entry points (queue consumers, scripts).

## Error contract

**Errors carry a code, never UI text.** An `AppError` has `code`, `status`, `meta` and `cause` — no
human message anywhere in the backend. Vera ships in pt-BR and en from day one: there is no `ErrorMessageRegistry`/per-module message
catalog mapping `code` → pt-BR text — the backend never picks a language for the end user. The FRONTEND owns the `code` → translated message mapping (i18next key per code),
resolved with the same locale precedence as everything else in the UI: user → company → browser,
fallback pt-BR. Consequences:

- Logs, internal flow AND the HTTP response always carry the CODE — Grafana queries and the
  frontend's lookup both stay language-independent.
- A `code` with no translated key in the frontend falls back to a generic message there — the gap
  surfaces in the FE, not by the backend guessing a language.
- Domain errors are typed classes (`EmailAlreadyInUseError`) thrown by services/applications;
  a single global exception filter maps them to HTTP. Controllers never try/catch business errors.

Rules:

- HTTP errors: **problem+json shape** — `{ type, title, status, detail, requestId, meta? }`.
  `requestId` ALWAYS present (support can find the Loki
  trail from a screenshot). `type` IS the error code (`connections.connection_not_found`) — the stable,
  language-independent identifier the frontend translates; there is no separate `code` field; `detail` is a TECHNICAL
  description in English (for logs/support/API consumers), never UI copy — nobody renders `detail`
  to the end user.
- Never leak internals: stack traces, SQL, provider raw errors go to logs — the response gets the
  problem+json. `meta` is serialized into the response, so a provider's raw error body must never
  be put there.
- Expected business outcomes ("invite already accepted") are NOT exceptions when they're a normal
  branch — return a result; throw only for violated expectations.
- `locale` lives in `AppContext` (resolved user → company → `Accept-Language`, fallback pt-BR) for
  what the backend DOES localize — e-mail templates picked by locale — never for translating an
  error response.
