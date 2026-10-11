---
name: conventions
description: >
  Language split, TypeScript & lint rules, git and PR conventions for every Vera repository.
  Use this skill whenever writing new code, naming things, committing, or opening PRs. For NestJS
  DTOs, OpenAPI decorators and the error contract, see the api-conventions skill (backend repos
  only). Triggers on: "naming", "eslint", "prettier", "typedef", "tipagem", "commit", "branch",
  "PR", "convention", "padrão", "estilo", "i18n", "locale", "tradução", "idioma", "repositório público".
---

# Conventions — Vera

Applies to **every** repository in the org. Stack-specific rules live in their own skills and are synced only to the repos that need them:
backend (`api-conventions`, `architecture`, `data-access`, `testing`, ...) to `vera-api`; frontend
(`frontend-architecture`, `data-fetching`, `forms`, `ui-and-styling`, `testing`) to `vera-fe`. The
frontend's i18n setup, translation keys and API-error-code mapping are in `ui-and-styling` and `data-fetching`.

## Language

The split is by **audience**, not by file type. How we build it is English; what it does and why we
chose it is pt-BR — **except the end-user interface, which is i18n from day one** (see "Interface
text is never pt-BR fixed" below).

| English                                               | pt-BR                                             |
| ----------------------------------------------------- | ------------------------------------------------- |
| Code: identifiers, types, file names                  | Business rules (`docs/regras/`)                   |
| Routes and URLs (`/accounts`, `/transactions/import`) | Product decisions (`docs/<contexto>.md`)          |
| Log messages and `LOG_IDENTIFIER`                     | Commits, issues, PR descriptions                  |
| Error **codes** (`identity.invalid_email_otp`)        | Conversation, docs, anything internal to the team |
| Skills (`.claude/skills/`)                            | —                                                 |
| Design docs (`docs/identity.md`)                      | —                                                 |

Interface labels and error messages a user actually reads are **not** in this
table — they are translation keys (i18next), never pt-BR (or any other language) hard-coded
in JSX or thrown as UI text from the backend. See "Interface text is never pt-BR fixed" below.

Three consequences worth spelling out, because each one has already caused a wrong guess:

- **A design doc and a business-rules doc about the same module are not duplicates.** One says how
  a balance is converted to the base currency; the other says which rate applies on which day.
  Different readers, different languages, both needed.
- **Don't translate the domain vocabulary — in prose.** "Patrimônio", "gasto", "orçamento" are the
  words the team actually uses in conversation, docs and issues, regardless of which languages the
  PRODUCT ships in for its end users.
- **In code, the same concept is English — and always the same English.** The code says
  `netWorth`, the docs say "patrimônio". The mapping is fixed here instead of being decided again
  at each call site:

| pt-BR (fala, docs, issues) | English (code, route, identifier) |
| -------------------------- | --------------------------------- |
| empresa / conta do cliente | company (tenant, `companyId`)     |
| patrimônio                 | net worth                         |
| ativo                      | asset                             |
| gasto                      | expense                           |
| transação                  | transaction                       |
| categoria                  | category                          |
| orçamento                  | budget                            |
| moeda base                 | base currency                     |
| cotação (PTAX)             | exchange rate                     |
| classe de ativo            | asset class (`assetClass`)        |
| meta                       | target (`target`)                 |
| faixa de tolerância        | tolerance (`tolerance`)           |
| aporte                     | contribution (`contribution`)     |
| posição                    | position (`position`)             |
| renda fixa                 | fixed income (`fixedIncome`)      |
| cotação de ativo           | quote (`quote`)                   |
| exposição                  | exposure (`exposure`)             |
| carteira                   | portfolio (`portfolio`)           |
| catálogo (de ativos)       | catalog (`catalog`)               |
| dados de mercado           | market data (`marketData`)        |

A term missing from this table is a term that has not been decided: add the row in the same PR that
introduces it, so the second person to need it does not invent a synonym.

## Interface text is never pt-BR fixed

Vera ships in **pt-BR and en from day one**. The rule "interface labels stay in pt-BR, no i18n
library" does **not** apply:

- Every string a user reads in the UI is a **translation key**, never a literal pt-BR (or any other
  language) string in JSX. `i18next` + `react-i18next`, namespaces per feature, dictionaries for
  `pt-BR`/`en`, fallback `pt-BR`. Locale resolution order: the user's own setting → the company's →
  the browser's (`Accept-Language`), fallback `pt-BR`.
  `eslint-plugin-i18next` (`no-literal-string`, or an equivalent local rule) blocks a loose string in
  JSX — same enforcement posture as the other lint rules in this skill: CI is the gate, not memory.
- Money, date and number formatting still goes through `Intl` — but **not pinned to pt-BR**. Use
  `Intl.NumberFormat`/`Intl.DateTimeFormat` with the **resolved locale** above and the **currency of
  the data** (the account/transaction's own `currency`, per the money conventions below), never a
  fixed `'pt-BR'`/`'BRL'` argument.
- What does NOT change: conversation with the team, docs, issues, commits and PR descriptions stay
  pt-BR; code, identifiers and routes stay English.
- Backend errors were never UI text to begin with (see the error-contract section of the
  `api-conventions` skill): the API returns a `code`, the frontend owns the `code` → translated
  message mapping. There is no backend-side pt-BR message catalogue to reconcile with i18n.

## Data conventions that every module inherits

Three shapes are fixed at the platform level so no module decides them again:

- **Money is an integer amount in the currency's minor unit, with its currency next to it**
  (`amountCents: number`/`bigint`, `currency: 'BRL'`) — the exponent comes from ISO 4217, not a
  blanket ÷100. Never a float, never a string with a decimal separator. The user picks a **base
  currency** (BRL or USD); amounts in another currency are converted to it by the PTAX rate of the
  day, and the original amount and currency are kept next to the converted one. Formatting
  (`R$ 57.300,00`, `US$ 42.00`) happens only in the front, with `Intl.NumberFormat`, the **resolved
  locale** per the i18n rule above and the **currency of the data** — never a fixed
  `'pt-BR'`/`'BRL'`.
- **Time is stored as `timestamptz` in UTC and read in the COMPANY's time zone.** Every company has
  `Companies.timezone` (IANA name, default `America/Sao_Paulo`). "Month closing", "send at 7am" and
  any window are computed in that zone — never in the server's, never in a hard-coded Brazil
  offset. A platform-wide schedule (a cron command) uses `CRON_TIMEZONE`.
- **Every external id and every idempotency key carries its provider** (`provider + externalId`,
  `pluggy:item:123`, `jobId: \`sync-${provider}-${externalId}\``). Two providers can hand out the
  same id; the pair is what is unique.

## TypeScript & lint

**These rules are identical in every repo.** The eslint configs carry the same typing block; only
the exemption paths differ. A rule present in one repo and missing in another is a bug in the
config, not a difference of opinion.

- `tsconfig` strict, `noUncheckedIndexedAccess` on. ESLint `typescript-eslint` preset
  **strict-type-checked** + Prettier (formatting is Prettier's job, never ESLint's).
- **Explicit types everywhere** (`typedef`): every variable, member, property and parameter is
  annotated; every function/method declares its return type (`explicit-function-return-type` with
  `allowExpressions`, plus `explicit-module-boundary-types`); every class member declares
  accessibility. Also on: `prefer-readonly`, `no-import-type-side-effects`.
- Small units enforced: `complexity: 10`, `max-params: 8` and **`max-lines-per-function: 40` in every
  repo, front included** (a component that grows past it is split into subcomponents and hooks, never
  granted more room). `max-depth` differs: `2` in the API, `3` in the front.
- **Three local rules, in every repo** (`eslint-rules/index.mjs`): `local/no-comments` (only
  directives and JSDoc pass — see Comments), `local/no-else` (handle the exit case first and return; the
  normal path stays at the outer level), `local/no-search-in-loop` (no `find`/`includes`/`filter`
  over an array inside another iteration — build a `Map`/`Set` first). Specs are exempt from the
  last two, never from the first.
- **Front only — `local/no-fixed-color`** (a fourth local rule, in `vera-fe` only): a Tailwind arbitrary colour (`bg-[#DA2640]`, `[rgb(`,
  `[hsl(`, `[oklch(`) or a colour in a `style` object is a lint error. Every colour comes from the
  semantic tokens in `src/index.css` (design system); the lint rule is the gate, review is the
  second look.
- **No `any`** — `unknown` + narrowing. An `as` cast is replaced by a type guard.
- **No default exports. No barrel files** (`index.ts` re-exports) — they breed circular imports;
  import from the concrete file.
- File names kebab-case with the framework's suffixes: `invite.application.ts`,
  `users.repository.ts`, `use-team-members.query.ts`, `member-card.tsx`.
- Enums: `as const` object + union type, or plain string unions — never TS `enum`.

### The typedef exemption list — one reason, not a grab bag

`typedef.variableDeclaration` is off for a short list of files. The single criterion: **the
declaration is the source of a derived type, and annotating it destroys the derivation.** Anything
that fails that test is not exempt — annotate it.

| Exempt                         | What breaks if you annotate                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `*.schema.ts` / `*.schemas.ts` | `z.infer<typeof schema>` collapses to the annotation                                             |
| `types.ts` / `*.types.ts`      | `as const` maps lose the literal union (`(typeof THEMES)[keyof typeof THEMES]`)                  |
| `shared/config/*.ts`           | the config object IS the shape everything else reads                                             |
| `routes/**/*.tsx` (FE)         | TanStack Router derives the route tree from the inferred `Route`                                 |
| `main.tsx` (FE)                | `Register { router: typeof router }` — annotating `createRouter(...)` kills path typing app-wide |

Query-key factories (`features/*/api/*-keys.ts`) are **not** exempt in `vera-fe`: they are annotated
with an explicit tuple type (see the `data-fetching` skill).

Corollaries, each one learned the hard way:

- A hook's **call site** is not exempt. `const members: UseQueryResult<TeamMemberList> = useTeamMembers(1)`
  is the expected shape — the hook already declares that return type, so repeating it costs one line
  and keeps the rule uniform.
- `cva()` looks exempt-shaped but isn't: hand-write the variant props type and annotate
  (`const buttonVariants: (props?: ButtonVariantProps) => string = cva(...)`).
  `VariantProps<typeof buttonVariants>` still resolves from the annotation.
- Never annotate with a machine-generated structural blob (`UseFormReturn<{ code: string }, any, ...>`).
  Use the named type (`UseFormReturn<TotpCodeInput>`) — an annotation containing `any` is worse than
  no annotation at all.

### Flat config replaces, it does not merge

In eslint flat config, a later block that names a rule **replaces** the earlier configuration of
that rule for the matching files — options are not merged. Two blocks that both configure
`no-restricted-imports` for overlapping globs means the last one wins entirely, and the first one's
patterns silently stop firing. Order the blocks so the narrowest comes last, and absorb the broader
patterns into it rather than relying on both to apply.

## Git

- **Trunk-based**: short-lived branches off `main`, PR, squash-merge. No develop branch, no release
  branches.
- Branch names: `feat/identity-login`, `fix/import-dedup`, `chore/bump-kysely`.
- **Conventional commits** enforced by commitlint (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`,
  `test:`, `ci:`). Scope optional but encouraged: `feat(identity): ...`. `subject-case` rejects a
  leading uppercase — write the subject lowercase.
- Hooks (husky): pre-commit = lint-staged (ESLint fix + Prettier on staged files only);
  pre-push = typecheck + unit tests; commit-msg = commitlint. Hooks are convenience — **CI is the
  enforcement** and re-runs everything in full.
- PRs: small, one concern. Description says WHY. Skill/doc updates ride in the same PR as the
  change that makes them true — except skills themselves, which live in `revtriever-vera/.github` and
  are synced (see below).

### The milestone is the join key

An epic ships as a `milestone/<slug>` branch: each card is a PR against that branch, and the branch
reaches `main` in a single PR. That last PR is **the only one CI and the review ever see** —
`ci.yml` and `claude-review.yml` both filter `branches: [main]`, so a PR against the milestone runs
nothing.

Which makes one thing non-optional: **every issue of the epic — the PRD and every card — carries a
GitHub milestone whose title is exactly the branch slug.**

```
branch   milestone/fundacao
milestone            fundacao     ← same string, no prose, no accents
```

Set it when the issue is created (`gh issue create --milestone "<slug>"`), not later. It is what
lets the reviewer load the whole epic in one call and judge the code against the decisions instead
of against itself; it is also the gesture that closes the cards when the epic ships.

Planning an epic produces **three** things in that milestone, all before the first line of code:

|                 |                                                                               |
| --------------- | ----------------------------------------------------------------------------- |
| `type: prd`     | one issue — the problem, the solution and the decisions                       |
| `type: feature` | one issue per card — a deliverable unit with acceptance criteria              |
| `type: qa`      | one issue — the handoff script, executed when the milestone closes (`qa-run`) |

The QA script is written **at planning time, not at the end**. Written afterwards it describes what
was built; written up front it describes what was promised, and the difference between the two is
the only thing the round is looking for.

The title is a slug on purpose. The milestone is a key, not a headline — the readable name of the
epic already lives in the PRD's title.

### "Fecha #123" does not close anything

Two independent reasons, both verified:

- GitHub only recognises `close/closes/fix/fixes/resolve/resolves` **in English**. `Fecha` is
  ordinary prose, and no link is recorded — `closingIssuesReferences` comes back empty.
- Auto-close only fires when the PR merges into the **default branch**. A card PR merges into
  `milestone/...`, so even `Closes #123` would not fire.

Write `Fecha #123` anyway — it is pt-BR and a human reads it. Just don't expect the board to move:
**closing the milestone when the epic reaches `main` is a manual step, and it is how the cards get
closed.** Skipping it is why the board accumulates delivered work marked open.

## Public repository: nothing sensitive in the tree

Every repository of the `revtriever-vera` organization is **public**. Never put in code, workflows,
docs, issues, PR descriptions or commit messages: AWS account IDs, VPC / subnet / security group /
RDS identifiers, endpoints, hostnames, ARNs, personal e-mails or phone numbers, tokens, keys or
passwords. Those values come from repository/organization **variables and secrets** or from SSM
Parameter Store, and examples use placeholders (`<account-id>`, `example.com`). A value that leaked
once is rotated, not just deleted in a later commit — it stays in the history.

## Skills are synced, not edited in place

`.claude/skills/` in this repo is **generated**. The source of truth is `revtriever-vera/.github` under
`skills/<group>/<name>/SKILL.md`, and the sync action mirrors it here — a skill edited locally is
overwritten on the next sync, and one that no longer exists upstream is pruned.

To change a skill, open a PR against `revtriever-vera/.github`. The human approval there is the gate;
the push into this repo happens without further review because it already passed.

A skill that is genuinely specific to one repo can live locally, but it must be listed in
`sync-config.json` as an exception first — otherwise the prune deletes it.

## Comments

**No comments in code.** Clean code, small methods, strong typing — the code explains itself; if it
needs narration, refactor until it doesn't. Context that can't live in code goes in docs/ or the
skill. `local/no-comments` lets exactly two things through: tool directives (`eslint-disable`,
`@ts-expect-error`, ...) and JSDoc (`/** */`) on a declaration, which shows up on hover for whoever
uses it — keep that rare, never narration. There is no exception for `//` or `/* */` — not even a
`skipConstraint` outside the identity module: its justification goes in the PR description (see
data-access skill).
