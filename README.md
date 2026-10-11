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

Pré-requisitos: Node 22 (`.nvmrc`), Docker e npm. Nada exige acesso à AWS: o e-mail local usa SMTP, a fila usa um Redis Cluster local e SSM/SQS são emulados pelo LocalStack.

```bash
npm install
npm run env:pull
docker compose up -d
npm run migrate:latest
npm run start:dev
```

`env:pull` copia o `.env.example` para `.env` (só valores de desenvolvimento, nenhum segredo) e não sobrescreve um `.env` existente.

### Serviços do compose

| Serviço      | Imagem                         | Porta local                    | Para quê                                                 |
| ------------ | ------------------------------ | ------------------------------ | -------------------------------------------------------- |
| `postgres`   | `postgres:16`                  | 5437                           | banco (`vera`/`vera`/`vera`), volume persistente         |
| `redis`      | `grokzen/redis-cluster:7.0.10` | 7200-7205                      | Redis Cluster, igual à topologia hospedada               |
| `localstack` | `localstack/localstack:4`      | 4577                           | SSM e SQS (`SERVICES: sqs,ssm`), nenhuma fila criada     |
| `mailpit`    | `axllent/mailpit`              | 1027 (SMTP) e 8027 (interface) | captura todo e-mail enviado pela API                     |
| `lgtm`       | `grafana/otel-lgtm`            | 3003 (Grafana) e 4320 (OTLP)   | opcional: `docker compose --profile observability up -d` |

As portas são próprias da Vera para convivência com outros stacks de compose na mesma máquina (que costumam usar 5432, 7000-7005, 4566, 1025/8025, 3001/4318). A API escuta em `3333`; se ela estiver ocupada, suba com `PORT=3334 npm run start:dev`.

`docker compose up -d --wait` espera os quatro serviços padrão ficarem saudáveis.

### Smoke manual

Com a API de pé:

```bash
curl -s localhost:3333/health
curl -s localhost:3333/health/ready
```

O e-mail enviado pela API aparece em `http://localhost:8027`. A API sobe com o Swagger em `/docs` (quando `DOCS_ENABLED=true`) e o painel de filas em `/admin/queues` (quando `QUEUES_DASHBOARD_ENABLED=true`).

### Tick de fila

```bash
npm run tick -- <parte-do-nome-da-fila> [parte-do-tipo]
```

Publica uma mensagem de fumaça na fila cujo nome contém o argumento, com o mesmo `BULL_PREFIX` e `QUEUES` do app. Fila inexistente falha listando as disponíveis. O mapa `TICK_TYPE_BY_QUEUE` em `scripts/tick.ts` está vazio: cada épico acrescenta a entrada da sua fila.

### Túnel Cloudflare (opcional)

Só para quem precisa receber chamadas externas no computador de desenvolvimento. Nada disso é necessário para desenvolver.

```bash
export VERA_DOMAIN=<dominio-da-vera>
export CLOUDFLARE_ACCOUNT_ID=<id-da-conta-cloudflare>
export CLOUDFLARE_API_TOKEN=<token-da-api-cloudflare>
export AWS_PROFILE=<perfil-aws-do-ambiente>
npx tsx scripts/tunnel.ts dev
```

O argumento `dev` ou `prod` é obrigatório, sem padrão. O script cria ou reaproveita o túnel `vera-<ambiente>`, publica `api[-dev].<domínio>` (em dev também `mail-dev.<domínio>`, o Mailpit), cria ou atualiza os CNAMEs e grava o token do túnel no SSM em `/vera/tunnel-token` usando o perfil AWS informado. Com `--routes-only` só mexe em rotas e DNS, sem AWS. `PORT`, `MAILPIT_UI_PORT` e `AWS_REGION` ajustam as portas locais e a região. Atenção: rodar com `prod` e o perfil de produção troca o túnel de produção.

### Banco

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
