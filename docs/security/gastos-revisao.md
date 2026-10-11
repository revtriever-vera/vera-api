# Revisão de segurança do módulo de gastos

Checklist executado antes de ligar `PLUGGY_DRIVER=live` em produção. Ele é executado no QA do épico de Gastos (revtriever-vera/vera#81, seção F), e o resultado de cada item é anotado no PR de cada card que toca credencial (#13, #71, #15, #19). Os cards #13, #71, #15, #19 e #81 citam este arquivo.

A credencial do Meu Pluggy de cada usuário (`clientId` e `clientSecret`) dá leitura de toda a vida bancária dele. Por isso ela é selada por envelope pelo `SecretSealerPort` (`src/core/crypto`) e nunca aparece em claro fora da memória do job que a abriu.

## Como o cofre protege o segredo

- `SecretSealerPort.seal(plain, { companyId, purpose })` e `open(sealed, { companyId, purpose })`. O `purpose` é uma constante do módulo dono (por exemplo `pluggy-credentials`), para que um segredo de uma finalidade não abra em outra.
- Driver `kms` (versão hospedada): cada `seal` pede uma chave de dados nova ao KMS (`GenerateDataKey`, AES-256) com o contexto de criptografia `{ companyId, purpose, app: 'vera' }`, cifra localmente com AES-256-GCM (AAD `companyId|purpose`), zera a chave em claro e guarda só a chave cifrada. O `open` pede o `Decrypt` com o mesmo contexto, e o KMS recusa se a company não bater.
- Driver `local` (desenvolvimento, testes e quem hospeda sozinho): deriva uma chave por company e finalidade com HKDF-SHA256 a partir de `CRYPTO_KEY_HEX` e cifra com AES-256-GCM. A segurança é a do segredo `CRYPTO_KEY_HEX`.
- Formato selado versionado: base64url de um JSON compacto com a versão, o driver, a referência da chave, a chave cifrada (só no `kms`), o IV, a tag e o texto cifrado.
- Em produção (`DEPLOY_ENV=prod`) a API recusa iniciar com `SECRET_SEALER_DRIVER=local`, a menos que `SECRET_SEALER_ALLOW_LOCAL_IN_PROD=true`. Esse escape existe só para quem hospeda sozinho sem AWS e fica desligado na versão hospedada.
- Falhas viram `core.secret_open_failed`, `core.secret_seal_failed` ou `core.secret_sealer_mismatch` (500), com `meta` só de `driver` e `purpose`. O log `secret-sealer` e a métrica `vera_secret_sealer_total{driver,op,result}` nunca carregam conteúdo.

## Operação

- A chave KMS (`alias/vera-secrets-<env>`) tem rotação anual transparente e política de remoção `RETAIN`. A task da API só pode usá-la (`kms:GenerateDataKey` e `kms:Decrypt`) com o contexto de criptografia `app = vera`. A task de migração não tem permissão.
- Migrar de `local` para `kms`: suba a API com `SECRET_SEALER_DRIVER=kms`, `SECRET_SEALER_KMS_KEY_ID` e `SECRET_SEALER_ALLOW_LEGACY_LOCAL=true`, rode `npm run secrets:reseal` e depois desligue o `ALLOW_LEGACY_LOCAL`. O script é idempotente: pula o que já está no driver atual.
- Rotação de `CRYPTO_KEY_HEX` no driver local está fora do MVP: o selado antigo deixa de abrir, e o usuário cola a credencial de novo (o app trata como `connections.invalid_credentials`). Perder a chave tem o mesmo efeito.

## Checklist

1. O segredo não aparece em log, traço, métrica, resposta, export de conta nem payload de fila. Cada card que toca credencial tem um spec de sigilo com segredo-sentinela (`vera-sentinel-<uuid>`) que confere a saída capturada (#22, #13 e #71).
2. `GET /spending/connections/credentials` nunca devolve `clientSecret` nem `clientId` inteiro.
3. Rotação: `PUT` testa a credencial nova antes de substituir a antiga, e a antiga é apagada em seguida.
4. Remoção: `DELETE` apaga o selado, a exclusão de conta passa pelo eraser e o spec de cascata está verde.
5. Isolamento: abrir o selado de A com o contexto de B falha, a rota com o id de outra company devolve 404 e o job resolve a company pela linha.
6. Só leitura: o cliente HTTP da Pluggy só tem `POST /auth` e `GET` (teste do driver).
7. Limite de tentativa: `@RateLimit` em `PUT credentials` (5 por 10 minutos por company) e em "sincronizar agora".
8. Dependências: `npm audit --omit=dev` sem alta ou crítica nos pacotes novos (`@aws-sdk/client-kms` e o parser de OFX/CSV).
9. Upload: o arquivo de extrato tem limite de tamanho e de linhas, é parseado em memória e nunca gravado em disco nem em bucket. O XML do OFX passa por parser sem entidades externas (XXE).
10. Exportação: a planilha neutraliza fórmula e tem `Cache-Control: no-store`.
11. CSP do front: nenhuma origem nova (sem imagem de banco de terceiros).
12. KMS: a política só permite uso com `EncryptionContext`, e a task de migração não tem permissão (spec da stack em `infra/lib/app.stack.spec.ts`).

## Como registrar o resultado

No PR de cada card, uma linha por item aplicável: `item N: ok` com o teste ou o comando que prova, ou `item N: não se aplica` com o motivo. O QA (#81, seção F) repete os itens 1, 2, 5 e 12 contra o ambiente de teste antes de ligar `PLUGGY_DRIVER=live`.
