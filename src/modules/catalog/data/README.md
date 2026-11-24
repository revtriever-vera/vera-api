# Dados curados do catálogo

Estes arquivos são lidos por import JSON pelo módulo `catalog` e validados por schema zod (`validation/curated-maps.schemas.ts`) no carregamento e em `domain/curated-maps.spec.ts`. Correções entram por PR.

## Fonte do catálogo da B3

O catálogo de ações, units, BDRs, FIIs e ETFs vem do Portal de Dados Abertos da CVM (`dados.cvm.gov.br`), licença ODbL (Open Data Commons): cite a CVM como fonte onde a Vera mostrar esses dados. Nenhum arquivo ou página da B3 é lido. O endereço base é `CVM_DATA_BASE_URL`.

| Tipo                                                  | Conjunto                                                                                    | O que dá                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Ação, unit, BDR patrocinado                           | FCA, `valor_mobiliario` (ano corrente e anterior)                                           | ticker (`Codigo_Negociacao`), nome, CNPJ; só mercado `Bolsa` ou `Balcão Organizado` e sem data de fim de negociação |
| Unit com código em branco no FCA, BDR não patrocinado | CDA dos fundos, `BLC_4` (último mês publicado)                                              | ticker e nome como os fundos os declaram; só os que algum fundo manteve no mês                                      |
| FII                                                   | Informe mensal de FII, `geral` (ano corrente e anterior), cruzado com o cadastro de classes | ticker, nome, CNPJ                                                                                                  |
| FIAGRO                                                | Informe mensal de FIAGRO (último mês publicado), cruzado com o cadastro de classes          | ticker, nome, CNPJ                                                                                                  |
| ETF                                                   | Cadastro de fundos por classe (CVM 175), `registro_classe`                                  | nome e situação do ETF da lista curada abaixo                                                                       |

O tipo vem da classe da CVM (`Tipo_Classe`: FII e FIAGRO viram `fii`, FIIM, o fundo de índice, vira `etf`), nunca de heurística sobre o ticker. A CVM não publica o ticker de um fundo: o do FII e do FIAGRO sai do código do emissor no ISIN da cota (`BR` + 4 letras + `CTF`...) mais `11`, e o do ETF vem da lista curada. Só entra fundo com situação `Em Funcionamento Normal` no cadastro.

## Fundos (FIF) pelo cadastro e pelo informe diário da CVM

A fonte `cvm_funds` (`CvmFundCatalogDriver`, `market = 'CVM'`, `kind = 'fund'`, `typeGroup = 'fundos'`) grava uma linha por série (classe ou subclasse) de fundo FIF com cota pública. Fonte: Portal de Dados Abertos da CVM, licença ODbL; cite "Fonte: CVM – Portal Dados Abertos" onde a Vera mostrar esses dados.

| Conjunto                                                                           | O que dá                                                                                                     |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `FI/CAD/DADOS/registro_fundo_classe.zip` (`registro_classe`, `registro_subclasse`) | classe, nome, classificação CVM e ANBIMA, situação, exclusividade, público-alvo, patrimônio líquido          |
| `FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_AAAAMM.zip`                                 | quais séries têm cota no mês corrente (e no anterior nos 5 primeiros dias úteis) e a última cota de cada uma |

- Entra a classe `Classes de Cotas de Fundos FIF` em `Em Funcionamento Normal`, `Exclusivo = N`, `Publico_Alvo` Público Geral ou Qualificado e `Patrimonio_Liquido >= 1.000.000`. A subclasse entra quando está em funcionamento, não é exclusiva e o público dela é aberto (ou vazio, herdando o da classe).
- Série sem cota no informe do mês não entra. O `externalId` é o CNPJ da classe (14 dígitos) ou `CNPJ:ID_SUBCLASSE`; o `symbol` é sempre o CNPJ.
- `name` é a denominação social sem os sufixos regulatórios (lista fechada em `drivers/cvm-fund-parsers.ts`); a denominação completa e a classificação ficam no `raw` da fonte.
- Classe sugerida (`asset-classification.ts`): `Classificacao = 'Renda Fixa'` vira `rf_pos`, `'Ações'` vira `acoes_br`; fica `null` quando a classificação ANBIMA tem "Exterior", "Previdência" ou "Índice", e para qualquer outra classificação CVM.
- No modo `mock`, os três fundos de exemplo vêm de `seed-assets.json` (`fundClassification` e `fundAnbima` alimentam a sugestão).
- O leitor do informe (`CvmDailyInformeReaderService`) é exportado para o `market-data`: `seriesKeys` e `latestQuotes`.

## `etf-class-map.json` (ETFs da B3)

Cada entrada diz a **exposição** de um ETF negociado na B3, não onde ele é negociado, e qual classe da CVM é o ETF.

```json
{ "symbol": "IVVB11", "cnpj": "19909560000191", "classKey": "acoes_eua", "dollarExposure": true }
```

- `symbol`: ticker na B3, em maiúsculas. A lista fica ordenada por `symbol` e sem repetição.
- `cnpj`: 14 dígitos do CNPJ da classe de cotas no `registro_classe` da CVM (`Tipo_Classe` `FIIM`). É o que liga o ticker ao cadastro: sem entrada aqui o ETF não entra no catálogo, e uma classe que a CVM cancela sai do catálogo.
- `classKey`: uma das chaves padrão (`rf_pos`, `rf_pre`, `rf_ipca`, `acoes_br`, `fii`, `acoes_eua`, `reits`, `cripto`) ou `null` quando a exposição não tem classe padrão (ouro, China, Europa, global). Com `null` o front pede que o usuário escolha.
- `dollarExposure`: `true` só quando a carteira do fundo é de ativos dos EUA sem hedge cambial.

O mapa vale antes de qualquer outra regra.

O `typeGroup` (card de tipo no modal de cadastro) segue a exposição: `acoes_eua` e `cripto` e `fii` para ETFs com essas classes; todo o resto dos ETFs da B3, inclusive os de renda fixa e os com `classKey` nulo, cai em `acoes_br`.

## `us-reit-map.json` (REITs dos EUA)

Símbolos dos EUA (ações de REIT e ETFs imobiliários) que ficam no grupo `reits` com classe `reits`. Mesmo formato do mapa de ETFs; `classKey` é sempre `reits` e `dollarExposure` é `true`.

## `popular-assets.json`

Lista por `typeGroup` dos ativos mostrados quando a busca vem sem texto, na ordem de popularidade. Cada item é `{ "market", "externalId" }`. O índice na lista vira `popularRank`. Todo item precisa existir em `seed-assets.json`.

## `seed-assets.json`

Catálogo de exemplo servido pelo driver `mock` (`CATALOG_DRIVER=mock`, o padrão). Inclui a carteira de exemplo do protótipo e alguns outros ativos por grupo. `npm run catalog:seed` grava esse conteúdo no banco local.

## `asset-profiles.json` (setor e grupo emissor)

Perfil curado dos ativos de renda variável, aplicado na leitura (sem coluna em `Assets`). O catálogo devolve `sector` e `issuerGroupId` na busca de ativos e na consolidação.

```json
{ "market": "B3", "symbol": "ITUB4", "sector": "financeiro", "issuerGroupId": "itau-unibanco" }
```

- `market` e `symbol`: a chave do ativo. A lista fica ordenada por `market` e `symbol` e sem repetição.
- `sector`: uma chave da lista fechada em `domain/sectors.ts` (`financeiro`, `energia_eletrica`, `petroleo_gas`, `imobiliario_logistica`, `etf_indice`...). Nunca texto livre: o front traduz a chave. Setor novo entra em `sectors.ts` no mesmo PR.
- `issuerGroupId`: um id de `issuers/data/groups.json`, ou `null` para ETF e FII sem grupo. É o que faz um CDB do Itaú e ITUB4 somarem juntos; a BDR e a ação do mesmo grupo (AAPL34 e AAPL) também.
- Ativo fora do mapa fica sem setor e sem grupo. Os títulos do Tesouro Direto não precisam de entrada: todos caem no grupo `tesouro-nacional`, sem setor.

O spec exige que todo ativo de `popular-assets.json` e de `seed-assets.json` (fora o Tesouro) tenha perfil e que todo `issuerGroupId` exista em `groups.json`. Fonte do setor: classificação pública da B3 e site de relações com investidores; cite a fonte no PR. Uma fonte automática de setor fica para depois.

## Como contribuir

1. Para um ETF novo, ache a classe no `registro_classe` da CVM (`Tipo_Classe` `FIIM`) e confira nome, CNPJ e ticker. Confira o regulamento do fundo (ou o índice que ele replica) antes de propor uma classe. Se a exposição for mista ou você não tiver certeza, não inclua o ticker: `classKey: null` só serve para exposição que de fato não tem classe padrão.
2. Edite o JSON mantendo a ordem por `symbol`.
3. Rode `npx vitest run --config vitest.config.mts src/modules/catalog/domain` e abra o PR citando a fonte (regulamento ou página do índice).
