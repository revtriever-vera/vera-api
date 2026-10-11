---
name: architecture
description: >
  Layered architecture and module rules for vera-api. Use this skill whenever creating a new
  feature or module, adding providers, wiring dependency injection, deciding which layer can inject
  which, or reviewing structure. Triggers on: "new feature", "novo módulo", "nova feature", "create
  module", "camadas", "arquitetura", "which layer", "inject", "DI", "dependency injection", "port",
  "abstract class", "config", "registerAs", "module structure", "bounded context".
---

# Architecture — vera-api

NestJS + TypeScript. Layered architecture, extended with a repository layer
(Kysely) and ports (abstract classes) for dependency inversion.

## Layers and injection rules

```
controller  →  application  →  domain (injectable)  →  repository
```

| Layer       | May inject                                                                       | NEVER injects                                                   |
| ----------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Controller  | Applications of its own module only                                              | Domains, services, repositories                                 |
| Application | Domains (own module), ports, services EXPORTED by other modules, module services | Repositories, other applications (own or foreign)               |
| Domain      | Its OWN repository, CHILD domains of the same aggregate (parent → child entity)  | Repositories of other aggregates, applications, foreign modules |
| Service     | Domains/ports of its own module                                                  | Applications, foreign repositories                              |
| Repository  | `DatabaseClient` (+ AppContext via base) only                                    | Any other repository, anything else                             |

Hard rules (these were broken before — treat as review blockers):

1. **Application never touches a repository.** Data access goes through the domain that owns the
   aggregate.
2. **Application never injects another application.** Not in the same module, not across modules.
3. **Repository never injects another repository.**
4. **Cross-module reuse = exported service.** Code a foreign application needs becomes a `service`
   in the OWNING module, exported by that module's `@Module`, and imported by the consumer module.
   Never a foreign application, domain or repository.

### ESLint enforces the hierarchy — it is not on your memory

`eslint.config.mjs` blocks the skipping imports directly, keyed on the file-name convention
(`*.domain.ts`, `*.repository.ts`, `*-application.module.ts`, `*-repository.module.ts`):

| Layer                          | Cannot import                                                        |
| ------------------------------ | -------------------------------------------------------------------- |
| **anything outside `domain/`** | **`*.repository` — no exceptions, `core/` included**                 |
| `access/**`                    | `*.domain`, `*-domain.module`, `*.repository`, `*-repository.module` |
| `services/**`                  | `*.application`, `*-application.module`, `access/**`                 |
| `application/**`               | `*.repository`, `*-repository.module`, **another `*.application`**   |
| `domain/**`                    | `*.application`, `*-application.module`, `access/**`                 |
| `repositories/*.repository.ts` | another `*.repository`, `*.domain`, `*.application`, `access/**`     |

**Only a domain injects a repository, and that holds in `core/` too.** A `core/<infra-module>` that
persists anything gets the same `domain/` + `repositories/` split a feature module gets — being
infrastructure buys no exemption. `*.module.ts` files are the one carve-out: they _register_
providers, they do not inject them.

**Application never injects another application, and a service never injects an application.** Both
point the dependency the wrong way: a service is what an application uses, so a service reaching up
creates a cycle the moment someone tries to extract it. When two applications need the same thing,
that thing is a domain or a service — not one of them.

Type imports still cross freely — `domain/<feature>.types.ts` is data, not an injectable, so a
controller may keep importing `Company` from it, and an application may import a payload type from
another application's file. The rules use `allowTypeImports`, so write those as `import type`. The
rule targets what gets **injected**.

### Persisting from a handler: enqueue, don't reach down

A queue handler is `access`. When it needs to write, it does not grow a repository — it publishes a
job, and that job walks the hierarchy like everything else:

```
handler (access) → publishes → handler (access) → application → domain → repository
```

`core/mail` is the worked example. The send handler talks to the provider and publishes
`email.send.recorded`; a second handler consumes it and the write lands through
`EmailSendLogApplication` → `EmailSendDomain` → `EmailSendsRepository`. The write is also off the
send path, so a slow database never delays an e-mail — and the job carries a deterministic `jobId`
built from the provider's message id, so a redelivery writes one row.

The base classes (`core/database/repositories/*`) and each `*-repository.module.ts` are outside the
repository rule on purpose: extending `TenantRepository` and registering repositories in their own
module are exactly what those files are for.

If a new layer import is genuinely needed, the answer is almost always a **service in the owning
module**, not an exception to the rule.

## Layered sub-modules per feature

Each feature is composed of one Nest module PER LAYER, chained by imports:

```
<Feature>Module (root)     →  imports the access modules only: Http, Command, Queue (the ones that exist)
<Feature>HttpModule        →  access/http/     controllers + guards
<Feature>CommandModule     →  access/commands/ crons (BaseCommand) + the handler that consumes each tick
<Feature>QueueModule       →  access/queue/    event consumers (QueueHandlerPort) no cron of this module schedules
<Feature>ApplicationModule →  imports <Feature>DomainModule (+ core modules); providers:
                              applications + module services; exports: applications + cross-module services
<Feature>DomainModule      →  imports <Feature>RepositoryModule; exports domains
<Feature>RepositoryModule  →  imports DatabaseModule/ContextModule; exports repos (feature-internal ONLY)
```

- External consumers import the LAYER module they need (`IdentityDomainModule` for domains,
  `IdentityApplicationModule` for services) — never the root module, never RepositoryModule.
- `<Feature>RepositoryModule` is never imported outside its feature: data access from outside
  always goes through the owning domain.
- Reference implementation: `src/modules/identity/` for the layers, `src/modules/identity/access/` for the
  split access modules.

### Access modules: one per entry type, each in its own folder

`access/` is split by how the flow enters, one sub-folder and one Nest module each:

```
access/
├── http/      <feature>-http.module.ts     + controllers
├── commands/  <feature>-command.module.ts  + <name>.command.ts (BaseCommand + its tick handler)
└── queue/     <feature>-queue.module.ts    + <name>.handler.ts (event consumers)
```

- Every access module imports `<Feature>ApplicationModule` and registers only its own entry points.
  Access modules **export nothing** — nobody injects a controller, command or handler; they only
  have to be registered for Nest (and the `DiscoveryService` in `core/queue`) to find them.
- The root `<Feature>Module` imports the access modules and has no providers. `app.module.ts`
  imports the root, never the access modules one by one.
- **A command and the handler of its tick live in the same file and the same module.** Splitting
  the pair fails silently both ways: without the command registered, `CommandReconcilerService`
  removes the cron from Redis on the next boot (`removeOrphans`); without the handler,
  `BullWorkerService` logs `handlerMissing` and drops the job.
- A handler that consumes a message some command publishes (fan-out → per-tenant job) is an event
  consumer and goes in `queue/` — the pair rule covers only the cron tick.
- No other folder holds entry points: no `fanout/`, `jobs/`, `consumers/` next to the layers.
- The `access/**` lint rules match the sub-folders as they are; the spec exemption must be
  `access/**/*.spec.ts`, not `access/*.spec.ts`.

## Workspace packages

Framework-agnostic code that talks to a third party lives in `packages/<name>/` as an npm workspace
package, not in `src/`. Example: a client for an open-finance provider with a neutral account/transaction model and a
provider adapter interface, with one adapter per provider plus a mock.

Rules for a package:

- **Zero framework**: no `@nestjs/*`, no DB, no AppContext, no queue. Plain classes, own tsconfig,
  own build. It receives data and returns normalized DTOs.
- **Neutral errors**: it throws its own error type (`ProviderError`), never an `AppError`. The app
  translates at the boundary — that mapping is the app's job, not the package's.
- **The app wires it**: adapters are instantiated in a Nest module (`useValue` list) and looked up
  by a registry service. Discovery/DI stays in `src/`.
- `index.ts` is the package's public API — the only sanctioned barrel file in the repo.
- Build order: `npm run build:packages` runs before build/test/start (wired in package.json).
- Extraction to a published registry is a later, separate decision (see the tech-debt issue).

## Folder structure: module-first, layers inside

```
src/
├── modules/<feature>/          # one folder per bounded context
│   ├── <feature>.module.ts
│   ├── access/                 # entry points: http/, commands/, queue/ (one module each)
│   ├── application/            # orchestration: domains + ports, no data access (module-private)
│   ├── domain/                 # <entity>.domain.ts injectable aggregates (own their repository)
│   │                           # + pure types, errors, validations/ (business rules that throw)
│   ├── services/               # module services; EXPORTED ones are the cross-module surface
│   ├── repositories/           # module-private, only injected by their own domain
│   ├── ports/                  # abstract classes this module defines
│   ├── config/                 # registerAs + zod namespace
│   └── validation/             # zod schemas for this module's boundaries
├── core/<infra-module>/        # cross-cutting WITH module discipline:
│   │                           # database/, context/, cache/, queue/, mail/, observability/
├── shared/                     # pure TS only (no Nest): constants (imported by CDK too), utils
├── config/                     # app-level config (registerAs + zod)
├── app.module.ts
└── main.ts
```

Boundaries are ENFORCED by eslint-plugin-boundaries (see `eslint.config.mjs`):

- `shared` imports nothing but shared; `core` imports core/shared; modules import
  core/shared/own-module; another module ONLY via its `*.module.ts` or `services/*` (exported
  services are the cross-module surface — type-only imports are free).
- `core/` is not a dumping ground — each entry is a real module with export discipline.
- `shared/` smell test: if it knows a business concept, it belongs to some module's `domain/`.

### Anti-god-module rules (hard limits)

1. A module exports **at most 3 applications**. Need a 4th? You have two bounded contexts — split.
2. **No central config file.** Each module declares its own config with `registerAs('<feature>', ...)`
   validated with zod at boot. A module reads ONLY its own namespace.
3. **No `shared`/`common` dumping ground.** Cross-cutting code lives in a purposeful module
   (`DatabaseModule`, `QueueModule`, `CacheModule`, `LogModule`) with the same export discipline.
4. Cross-module imports: `FeatureAModule` imports `FeatureBModule` and injects a service that
   FeatureB exports. Applications, domains and repositories are never importable across modules.

## Dependency injection: abstract class as port

Interfaces are erased at runtime — we use **abstract classes** as both contract and injection token.
No `@Inject()` decorator noise, easy refactors, mockable in tests.

```typescript
// ports/cache.port.ts
export abstract class CachePort {
    abstract get<T>(key: string): Promise<T | null>;
    abstract set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
    abstract del(key: string): Promise<void>;
}

// cache.module.ts
@Module({
    providers: [{ provide: CachePort, useClass: InMemoryCacheDriver }],
    exports: [CachePort]
})
export class CacheModule {}

// any service
constructor(private readonly cache: CachePort) {}
```

Use a port whenever there is (or will plausibly be) more than one implementation, or the dependency
touches the outside world: cache, third-party providers, queue producer, mail, clock.
Do NOT create a port for something with exactly one conceivable implementation — that's ceremony,
not architecture.

## Cross-module ports discovered at runtime

When a central module must call every business module without importing any of them, it declares
an abstract-class port and a registry that finds implementations with `DiscoveryService`
(`getProviders()` filtered by `instanceof`). A business module opts in by registering a subclass
as a provider in its own module — nothing else. The central module never imports the business
modules. Ports below live in `identity/services/` and `onboarding/services/`.

### Account erasure and export (`identity`)

```typescript
export abstract class AccountDataEraserPort {
    abstract readonly area: string;
    abstract eraseAll(companyId: string): Promise<number>;
}
export abstract class AccountDataExporterPort {
    abstract readonly area: string;
    abstract exportAll(companyId: string): Promise<unknown>;
}
```

- **Eraser**: removes what the `ON DELETE CASCADE` will not (secrets, KMS keys, files, cache,
  queues) for that company and returns how many items it removed. Must be idempotent: a retry
  after a failure runs every eraser again.
- **Order and failure**: `AccountDataRegistry.eraseAll` runs erasers sequentially, in registration
  order, and stops at the first failure (`identity.erasure_failed`, `meta.area`). Only after all
  erasers succeed does one transaction write the `AccountDeletionLog` row, hard-delete the
  `Companies` row (cascade does the rest) and enqueue the confirmation email. A failing eraser
  therefore aborts before the `DELETE`, and the user can retry.
- **Exporter**: returns the JSON-serialisable section for `area` for that company only — no data
  from another company, no secrets, no hashes (token hashes, `subject`). The registry puts each
  result in `sections[area]`; an exporter that throws fails the whole export
  (`identity.export_failed`), never a partial file. Identity data (company, user, sessions) is
  exported by `identity` itself, not through a port. Sample rows are excluded.
- `companyId` is a parameter supplied by the registry from the request context; ports never read
  it from input.

### Onboarding sample data (`onboarding`)

```typescript
export abstract class SampleDataPort {
    abstract readonly area: string;
    abstract seed(companyId: string): Promise<number>;
    abstract clear(companyId: string): Promise<number>;
}
```

`POST /onboarding/sample` calls `seed` on every registered port (sorted by `area`) inside one
`@UsingTransaction`; `DELETE /onboarding/sample` calls `clear` on all of them. `onboarding` owns
the mechanism; the owning module decides the content. Contract every implementation honours:

1. **Flag**: every seeded row has `isSample = true`.
2. **Never mix with real data**: `seed` writes nothing and returns `0` when the area already has
   real (non-sample) data.
3. **Idempotent**: `seed` twice does not duplicate; `clear` twice is harmless. Both return a count.
4. **Clear only samples**: `clear` deletes rows where `isSample` is true and never touches real
   rows.
5. **Rollback on failure**: `seed`/`clear` run in the caller's transaction (no own transaction, no
   external calls); a port that throws makes the registry raise `onboarding.sample_failed`
   (`meta.area`) and every area written before it is rolled back.

Fixed values (cents, dates relative to today). Sample rows are excluded from the account export and
from `OnboardingAreaSummaryPort`.

### Onboarding area summary (`onboarding`)

`OnboardingAreaSummaryPort { area: 'assets' | 'banks' | 'target'; summarize(companyId) }` returns
`{ items, amountCents, currency, breakdown? }` for the onboarding checklist.
`OnboardingAreaRegistry.summarize` runs the ports in parallel; a port that throws yields `null`
for its area (logged) instead of failing `GET /onboarding`.

## Config pattern (per module)

```typescript
// config/mail.config.ts
const schema = z.object({
  MAIL_DRIVER: z.enum(["mock", "smtp"]).default("mock"),
  MAIL_FROM: z.string().default(""),
  MAIL_TIMEOUT_MS: z.coerce.number().default(5000),
});

export const mailConfig = registerAs("mail", () => schema.parse(process.env));
export type MailConfig = z.infer<typeof schema>;
```

- Boot fails fast on invalid/missing env — never a runtime surprise.
- A module injects `mailConfig.KEY` via `ConfigType<typeof mailConfig>` — never `ConfigService.get('...')`
  with magic strings, never someone else's namespace.

## Request context — AsyncLocalStorage, NEVER Scope.REQUEST

`Scope.REQUEST` is forbidden in this codebase. It virally degrades the DI graph to per-request
instantiation and doesn't exist for queue consumers/crons — which is most of this system.

All per-flow state lives in ONE `AppContext` on AsyncLocalStorage:
`{ requestId, companyId?, userId?, txExecutor? }`. Every provider stays a singleton and reads it
via the injectable context port.

Rules:

1. **Context is created at entry points only**: HTTP middleware (requestId), auth guard
   (userId/companyId), SQS consumer (restored from MessageAttributes), tick handler, dev script.
   No service mid-flow ever creates context. The guard uses `context.enrich()` (enterWith) —
   entry-point-only API.

### Cross-cutting decorators (preferred over explicit wrapping)

- `@UsingTransaction()` — wraps the whole method in a DB transaction (nested calls join it).
  Never put post-commit work (queue publish, email enqueue) inside a decorated method — split the
  orchestration: public method calls the decorated persistence method, then publishes.
- `@AsCompany()` — runs the method inside the tenant context of its **first parameter**
  (`companyId: string`). This is the sanctioned way to act as a tenant born mid-flow (onboarding)
  or during fan-out. Convention: tenant-entering methods take companyId first.

2. **Context is immutable.** To act as another tenant (fan-out, sweeps), RE-ENTER:
   `ctx.run({ ...parent, companyId }, fn)` — never mutate the stored object (mutation after an
   async fork leaks across `Promise.all` siblings).
3. **Missing context fails loud**: `TenantRepository` throws without `companyId`. Cross-tenant
   access uses the explicit `skipConstraint` escape hatch — greppable, and legitimate mostly in
   the identity module's pre-auth flows.
4. Session/context is never passed as a method parameter — that's what the ALS removes.

## Reference implementation

`src/modules/identity/` is the fully-wired reference: every layer, sub-modules per layer, config,
catalog of messages, exported services as the cross-module surface. When in doubt about where
something goes, copy what identity does.
