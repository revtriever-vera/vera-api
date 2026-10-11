# Dados curados de categorias de gasto

Estes arquivos são lidos por import JSON pelo módulo `spending-categories` e validados por schema zod (`validation/data.schemas.ts`) no carregamento e nos specs `domain/merchant-dictionary.spec.ts` e `domain/pluggy-category-map.spec.ts`. Correções entram por PR.

## Precedência da categorização

Da mais forte para a mais fraca: correção manual da transação, regra do usuário, dicionário de estabelecimentos, categoria da Pluggy, sem categoria. Este módulo cobre da regra do usuário em diante; a correção manual é do módulo de transações.

## `merchant-dictionary.json`

```json
{ "pattern": "IFOOD", "match": "contains", "category": "eating_out", "direction": "out" }
```

- `pattern`: já normalizado, do jeito que `DescriptionNormalizerService.normalize` devolve a descrição do banco (maiúsculas, sem acento, sem pontuação, sem prefixo de meio de pagamento, sem número de 4 ou mais dígitos). O spec barra um padrão que a normalização alteraria. Por isso `PAG FATURA` não existe: o `PAG ` inicial é removido antes da comparação.
- `match`: `contains` casa o padrão como palavra inteira (ou sequência de palavras) em qualquer posição da descrição, então `DIA` não casa com `MEDIA`. `prefix` casa o começo da descrição, sem exigir fim de palavra (`NETFLIX` casa `NETFLIXCOM`).
- `category`: uma `systemKey` das categorias padrão (`groceries`, `eating_out`, `transport`, `subscriptions`, ...).
- `direction`: `out` só casa com valor negativo, `in` só com positivo, `any` com qualquer um. Entrada de renda (`income`, `other_income`) é sempre `in`; entrada `in` só aponta para `income`, `other_income` ou `investments`.
- Quando dois padrões casam, vence o mais longo (`UBER EATS` ganha de `UBER`). No empate, vence a ordem alfabética do padrão.
- A lista fica ordenada por `pattern` e sem repetição.

Prefira o padrão mais específico que ainda cubra as variações do banco. Um padrão curto demais (`DIA`, `TIM`, `MAX`) só entra quando o nome do estabelecimento é curto de verdade, porque o usuário sempre pode corrigir e a correção vale mais que o dicionário.

## `pluggy-category-map.json`

```json
{ "pluggyId": "11000000", "category": "eating_out" }
```

- `pluggyId`: id de oito dígitos da categoria da Pluggy. A busca vai do mais específico ao mais geral: id exato, depois o nível 2 (`XXYY0000`) e por fim o nível 1 (`XX000000`).
- `category`: uma `systemKey`.
- Quem não está no mapa fica sem categoria da Pluggy. É de propósito para `02` (empréstimos), `05` (transferências) e `06` (transferências para terceiros): Pix e TED para pessoas quase sempre são gasto e o usuário ensina uma vez.
- `income` (`01`) só vale para entrada; em saída é ignorado.

## Como contribuir

1. Edite o JSON mantendo a ordem e o formato.
2. Rode `npx vitest run --config vitest.config.mts src/modules/spending-categories/domain` e abra o PR citando o estabelecimento ou a fonte do id da Pluggy.
