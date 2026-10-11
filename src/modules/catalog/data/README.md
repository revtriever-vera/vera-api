# Dados curados do catálogo

Estes arquivos são lidos por import JSON pelo módulo `catalog` e validados por schema zod (`validation/curated-maps.schemas.ts`) no carregamento e em `domain/curated-maps.spec.ts`. Correções entram por PR.

## `etf-class-map.json` (ETFs da B3)

Cada entrada diz a **exposição** de um ETF negociado na B3, não onde ele é negociado.

```json
{ "symbol": "IVVB11", "classKey": "acoes_eua", "dollarExposure": true }
```

- `symbol`: ticker na B3, em maiúsculas. A lista fica ordenada por `symbol` e sem repetição.
- `classKey`: uma das chaves padrão (`rf_pos`, `rf_pre`, `rf_ipca`, `acoes_br`, `fii`, `acoes_eua`, `reits`, `cripto`) ou `null` quando a exposição não tem classe padrão (ouro, China, Europa, global). Com `null` o front pede que o usuário escolha.
- `dollarExposure`: `true` só quando a carteira do fundo é de ativos dos EUA sem hedge cambial.

O mapa vale antes de qualquer outra regra. Um ticker que não está aqui e que a B3 classifica como ETF fica com `suggestedClassKey = null`.

O `typeGroup` (card de tipo no modal de cadastro) segue a exposição: `acoes_eua` e `cripto` e `fii` para ETFs com essas classes; todo o resto dos ETFs da B3, inclusive os de renda fixa e os com `classKey` nulo, cai em `acoes_br`.

## `us-reit-map.json` (REITs dos EUA)

Símbolos dos EUA (ações de REIT e ETFs imobiliários) que ficam no grupo `reits` com classe `reits`. Mesmo formato do mapa de ETFs; `classKey` é sempre `reits` e `dollarExposure` é `true`.

## `popular-assets.json`

Lista por `typeGroup` dos ativos mostrados quando a busca vem sem texto, na ordem de popularidade. Cada item é `{ "market", "externalId" }`. O índice na lista vira `popularRank`. Todo item precisa existir em `seed-assets.json`.

## `seed-assets.json`

Catálogo de exemplo servido pelo driver `mock` (`CATALOG_DRIVER=mock`, o padrão). Inclui a carteira de exemplo do protótipo e alguns outros ativos por grupo. `npm run catalog:seed` grava esse conteúdo no banco local.

## Como contribuir

1. Confira o regulamento do fundo (ou o índice que ele replica) antes de propor uma classe. Se a exposição for mista ou você não tiver certeza, não inclua o ticker: `classKey: null` só serve para exposição que de fato não tem classe padrão.
2. Edite o JSON mantendo a ordem por `symbol`.
3. Rode `npx vitest run --config vitest.config.mts src/modules/catalog/domain` e abra o PR citando a fonte (regulamento ou página do índice).
