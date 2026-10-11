# vera-api

API da [Vera](https://github.com/revtriever-vera/vera), plataforma financeira open source. Este repositório é a base do back: a arquitetura, os padrões e os portões de qualidade, sem nenhuma regra de negócio. O que a Vera faz de fato entra nos épicos seguintes (veja o épico de Fundação, revtriever-vera/vera#30).

## Stack

NestJS + TypeScript · Kysely + Postgres 16 · BullMQ + Redis · pino + OpenTelemetry.

## O que já vem pronto

| Peça            | Onde                                       | O que faz                                                                                                               |
| --------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Multi-tenant    | `src/core/context`, `src/core/database`    | `AppContext` em AsyncLocalStorage (com `locale`), `TenantRepository` com `companyId` automático                         |
| Erros           | `src/core/http`                            | problem+json por `AppErrorFilter`: `type`/código estável, `detail` técnico (nunca traduzido), sem catálogo de mensagens |
| E-mail          | `src/core/mail`                            | `MailPort` com SES e SMTP, allowlist de destinatário, template por `(nome, locale)` com fallback para pt-BR             |
| Filas           | `src/core/queue`                           | Publisher/worker BullMQ, `BULL_PREFIX = '{vera}'`, comando agendado reconciliado, `@JobMutex`, `@HandleJobFailure`      |
| Rate limit      | `src/core/throttle`                        | `@RateLimit`/`RateLimitGuard`, janela persistida na tabela `Throttles`                                                  |
| Criptografia    | `src/core/crypto`                          | `CryptoPort` (AES-GCM) e `HmacPort` (HMAC-SHA256)                                                                       |
| Observabilidade | `src/core/observability`, `src/tracing.ts` | pino + OpenTelemetry, `requestId` em todo ponto de entrada                                                              |
| Health          | `src/modules/health`                       | `GET /health` (liveness), `GET /health/ready` (banco)                                                                   |
| Qualidade       | `eslint.config.mjs`, `eslint-rules/`       | Fronteiras de camada, zero comentários, sem `else`; Vitest unitário e de integração                                     |

Idiomas suportados: `pt-BR` (padrão) e `en`.

## Ambiente local

Pré-requisitos: Node 22 (`.nvmrc`), Docker e npm. Nada exige acesso à AWS: o e-mail local usa SMTP e a fila usa um Redis local.

```bash
npm install
npm run env:pull
```

`env:pull` copia o `.env.example` para `.env` (só valores de desenvolvimento, nenhum segredo). Suba um Postgres 16 e um Redis compatíveis com o `.env`; o `docker-compose.yml` do repositório (card #33) faz isso. Sem ele, dá para subir na mão:

```bash
docker run -d --rm -p 5436:5432 -e POSTGRES_USER=vera -e POSTGRES_PASSWORD=vera -e POSTGRES_DB=vera postgres:16
docker run -d --rm -p 6379:6379 redis:7-alpine
```

Com o Redis avulso, ajuste no `.env` `REDIS_CLUSTER=false` e `REDIS_NODES=localhost:6379`. Depois:

```bash
npm run migrate:latest
npm run start:dev
```

Smoke manual, com a API de pé:

```bash
curl -s localhost:3333/health
curl -s localhost:3333/health/ready
```

A API sobe em `http://localhost:3333` (ou na porta de `PORT`), com o Swagger em `/docs` (quando `DOCS_ENABLED=true`) e o painel de filas em `/admin/queues` (quando `QUEUES_DASHBOARD_ENABLED=true`).

`npm run codegen` regenera `src/core/database/generated/database.types.ts` a partir do banco migrado; o arquivo gerado é versionado.

## Verificação

```bash
npm run lint
npm run typecheck
npm test
npm run test:cov
npm run test:int -- <caminho dos specs>
npm run build
```

Os testes de integração sobem Postgres e Redis por Testcontainers e são pesados: rode só os specs afetados.

## Antes do primeiro deploy

O deploy ainda não existe neste repositório. A infraestrutura de dados (CDK, pasta `infra/`) já existe e o pipeline de CI/CD chega no #36. Quando existirem, nenhum valor de infraestrutura (conta, rede, banco, endpoint) fica no código: tudo vem de variáveis e secrets do repositório ou do SSM Parameter Store. Este repositório é público, então nunca grave nesses arquivos IDs de conta, hosts internos, e-mails pessoais, tokens ou chaves.

### CDK local

O CDK lê tudo o que identifica a infraestrutura das variáveis de ambiente, nunca do código. Crie um `.env.local` (ignorado pelo git) com os valores da sua conta e carregue-o antes de qualquer comando `cdk`:

```bash
AWS_ACCOUNT_ID_DEV=<id da conta de dev>
AWS_ACCOUNT_ID_PROD=<id da conta de prod>
VERA_DOMAIN=<seu domínio>
SHARED_INFRA_DEV='{"vpcId":"...","availabilityZones":["..."],"publicSubnetIds":["..."],"databaseInstanceId":"...","databaseEndpoint":"...","databaseSecurityGroupId":"...","redisEndpoint":"...","redisSecurityGroupId":"...","openIdConnectProviderArn":"..."}'
SHARED_INFRA_PROD='<mesmo formato>'
```

```bash
set -a && . ./.env.local && set +a
npx cdk synth
```

`VERA_ENVIRONMENTS=prod` (ou `dev`) limita a síntese a um ambiente e dispensa as variáveis do outro; `IMAGE_PULL_ACCOUNTS` (IDs separados por vírgula) autoriza outras contas a puxar imagens do ECR. Se faltar variável ou o JSON for inválido, o `cdk` falha dizendo qual. O banco lógico `vera` e o papel dele na instância compartilhada são criados à mão, de uma máquina liberada no security group do RDS, e a URL de conexão é gravada no SSM em `/vera/database-url`.

## Licença

AGPL-3.0, veja `LICENSE`.
