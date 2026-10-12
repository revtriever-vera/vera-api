# vera-api

API da [Vera](https://github.com/revtriever-vera/vera), plataforma financeira open source. Este repositório é a base do back: a arquitetura, os padrões e os portões de qualidade, sem nenhuma regra de negócio. O que a Vera faz de fato entra nos épicos seguintes (veja o épico de Fundação, revtriever-vera/vera#30).

## Stack

NestJS + TypeScript · Kysely + Postgres 16 · BullMQ + Redis · pino + OpenTelemetry.

## O que já vem pronto

| Peça            | Onde                                       | O que faz                                                                                                                  |
| --------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Multi-tenant    | `src/core/context`, `src/core/database`    | `AppContext` em AsyncLocalStorage (com `locale`), `TenantRepository` com `companyId` automático                            |
| Erros           | `src/core/http`                            | problem+json por `AppErrorFilter`: `type`/código estável, `detail` técnico (nunca traduzido), sem catálogo de mensagens    |
| E-mail          | `src/core/mail`                            | `MailPort` com SES e SMTP, allowlist de destinatário, template por `(nome, locale)` com fallback para pt-BR                |
| Filas           | `src/core/queue`                           | Publisher/worker BullMQ, `BULL_PREFIX = '{vera}'`, comando agendado reconciliado, `@JobMutex`, `@HandleJobFailure`         |
| Rate limit      | `src/core/throttle`                        | `@RateLimit`/`RateLimitGuard`, janela persistida na tabela `Throttles`                                                     |
| Criptografia    | `src/core/crypto`                          | `CryptoPort` (AES-GCM), `HmacPort` (HMAC-SHA256) e `SecretSealerPort` (cofre de segredos por envelope, KMS ou chave local) |
| Observabilidade | `src/core/observability`, `src/tracing.ts` | pino + OpenTelemetry, `requestId` em todo ponto de entrada                                                                 |
| Health          | `src/modules/health`                       | `GET /health` (liveness), `GET /health/ready` (banco)                                                                      |
| Qualidade       | `eslint.config.mjs`, `eslint-rules/`       | Fronteiras de camada, zero comentários, sem `else`; Vitest unitário e de integração                                        |

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
export VERA_HOST_PREFIX=<prefixo-opcional>
export CLOUDFLARE_ACCOUNT_ID=<id-da-conta-cloudflare>
export CLOUDFLARE_API_TOKEN=<token-da-api-cloudflare>
export AWS_PROFILE=<perfil-aws-do-ambiente>
npx tsx scripts/tunnel.ts dev
```

O argumento `dev` ou `prod` é obrigatório, sem padrão. O script cria ou reaproveita o túnel `vera-<ambiente>`, publica `<prefixo>api[-dev].<domínio>` (em dev também `<prefixo>mail-dev.<domínio>`, o Mailpit; o prefixo é o `VERA_HOST_PREFIX`, vazio por padrão), cria ou atualiza os CNAMEs e grava o token do túnel no SSM em `/vera/tunnel-token` usando o perfil AWS informado. Com `--routes-only` só mexe em rotas e DNS, sem AWS. `PORT`, `MAILPIT_UI_PORT` e `AWS_REGION` ajustam as portas locais e a região. Atenção: rodar com `prod` e o perfil de produção troca o túnel de produção.

### Banco

`npm run codegen` regenera `src/core/database/generated/database.types.ts` a partir do banco migrado; o arquivo gerado é versionado.

#### Exclusão de conta e dados pessoais

Toda tabela com a coluna `companyId` precisa de chave estrangeira para `Companies` com `ON DELETE CASCADE`: `DELETE /account` apaga a linha da company e deixa o banco apagar o resto. O spec `test/integration/account-deletion-cascade.int-spec.ts` consulta o catálogo do Postgres e quebra o CI de quem esquecer. O que o cascade não alcança (segredo cifrado, chave no KMS, arquivo, cache, fila) entra por uma subclasse de `AccountDataEraserPort`, e o que a pessoa pode baixar por uma de `AccountDataExporterPort` (ambas em `src/modules/identity/services/`). Basta registrar a subclasse como provider no módulo dono; o `AccountDataRegistry` as descobre sozinho.

### Cofre de segredos

Credenciais de terceiros guardadas por company passam pelo `SecretSealerPort`, escolhido por `SECRET_SEALER_DRIVER`:

- `local` (padrão em `IS_LOCAL=true`): deriva uma chave por company e finalidade de `CRYPTO_KEY_HEX` (HKDF-SHA256) e cifra com AES-256-GCM. Não precisa de conta na nuvem. A segurança é a do segredo `CRYPTO_KEY_HEX`: guarde-o fora do repositório e faça cópia, porque perdê-lo ou trocá-lo faz os segredos selados deixarem de abrir (o usuário cola a credencial de novo).
- `kms`: envelope com AWS KMS, usado na versão hospedada. Exige `SECRET_SEALER_KMS_KEY_ID` (alias ou ARN da chave).

Fora do ambiente local a variável é obrigatória, e com `DEPLOY_ENV=prod` o driver `local` só inicia com `SECRET_SEALER_ALLOW_LOCAL_IN_PROD=true`, o escape de quem hospeda sozinho em produção sem AWS. Para migrar de `local` para `kms`, use `SECRET_SEALER_ALLOW_LEGACY_LOCAL=true` e rode `npm run secrets:reseal`. O checklist de segurança está em `docs/security/gastos-revisao.md`.

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
VERA_HOST_PREFIX=<opcional, por exemplo vera->
SHARED_INFRA_DEV='{"vpcId":"...","availabilityZones":["..."],"publicSubnetIds":["..."],"databaseInstanceId":"...","databaseEndpoint":"...","databaseSecurityGroupId":"...","redisEndpoint":"...","redisSecurityGroupId":"...","openIdConnectProviderArn":"..."}'
SHARED_INFRA_PROD='<mesmo formato>'
```

```bash
set -a && . ./.env.local && set +a
npx cdk synth
```

`VERA_ENVIRONMENTS=prod` (ou `dev`) limita a síntese a um ambiente e dispensa as variáveis do outro; `IMAGE_PULL_ACCOUNTS` (IDs separados por vírgula) autoriza outras contas a puxar imagens do ECR. Se faltar variável ou o JSON for inválido, o `cdk` falha dizendo qual.

#### Hosts e prefixo (`VERA_HOST_PREFIX`)

Os hosts saem de `${VERA_HOST_PREFIX}<nome>[-dev].${VERA_DOMAIN}`, com `<nome>` igual a `app`, `api` ou `mail` (o Mailpit existe só em dev). Todos ficam num único nível de subdomínio, compatível com o certificado SSL gratuito do Cloudflare. `VERA_HOST_PREFIX` é opcional e vazio por padrão, então quem clona o repositório continua com `app.<domínio>` e `api.<domínio>`. Quando o domínio já tem esses nomes em uso, defina o prefixo: com `VERA_HOST_PREFIX=vera-` e `VERA_DOMAIN=exemplo.com` saem `vera-app.exemplo.com`, `vera-api.exemplo.com`, `vera-app-dev.exemplo.com`, `vera-api-dev.exemplo.com` e `vera-mail-dev.exemplo.com`. O valor só aceita `a-z`, `0-9` e hífen, até 20 caracteres, e precisa terminar em hífen. Nos workflows ele vem da variável de repositório `VERA_HOST_PREFIX` (deixe sem definir para não usar prefixo) e alimenta o CDK (host da API, `CORS_ORIGINS`, outputs `ApiUrl` e `MailUrl`) e o script do túnel. O front precisa da mesma variável para apontar para a API. O banco lógico `vera` e o papel dele na instância compartilhada são criados à mão, de uma máquina liberada no security group do RDS, e a URL de conexão é gravada no SSM em `/vera/database-url`.

## Licença

AGPL-3.0, veja `LICENSE`.
