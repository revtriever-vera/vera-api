# Dados curados dos emissores

Estes arquivos são lidos por import JSON pelo módulo `issuers`, validados por schema zod (`validation/issuer-data.schemas.ts`) e pelas regras de `domain/issuer-index.ts` quando a aplicação sobe (`IssuerDirectoryService.onModuleInit`) e em `services/issuer-directory.service.spec.ts`. Dado inválido derruba o boot. Correções entram por PR.

Nada aqui tem dado de conta, e nenhum CNPJ é usado como chave: a chave é um slug estável (`banco-inter`).

## `institutions.json`

Ordenado por `id`, sem repetição.

```json
{
  "id": "banco-inter",
  "name": "Banco Inter",
  "groupId": "inter-co",
  "kind": "bank",
  "fgcAssociated": true,
  "status": "active",
  "mergedInto": null,
  "aliases": ["Inter"]
}
```

- `kind`: `bank` emite CDB, LCI, LCA e LC; `company` emite debênture, CRI e CRA; `sovereign` é o Tesouro Nacional e o Tesouro dos EUA (as duas entradas `tesouro-nacional` e `tesouro-eua` são obrigatórias, cada uma no grupo de mesmo id).
- `groupId`: conglomerado prudencial (banco) ou grupo econômico (empresa). Aponta para `groups.json`.
- `fgcAssociated`: a instituição é associada ao FGC. A cobertura (card #90) lê este campo.
- `status` e `mergedInto`: uma instituição nunca é apagada. Quando é incorporada, vira `status: "retired"` com `mergedInto` apontando para quem ficou; os títulos antigos continuam válidos e passam a contar no grupo atual (`IssuerDirectoryService.resolve` segue a cadeia). `mergedInto` só vale em `retired`, aponta para um id que existe e não pode formar ciclo.
- `aliases`: nomes pelos quais as pessoas procuram. Alimentam a busca `GET /issuers`.

## `groups.json`

`{ "id": "btg-pactual", "name": "BTG Pactual" }`, ordenado por `id`. Serve a bancos (conglomerado) e a empresas (grupo econômico, usado na concentração). O catálogo também aponta para estes ids em `catalog/data/asset-profiles.json`, para que um CDB do Itaú e as ações ITUB4 somem juntos.

## `known-ids.json`

Todos os ids já publicados, ordenados. O spec exige que cada id conhecido continue em `institutions.json` e que nenhuma instituição nova entre sem estar aqui. A lista só cresce: é ela que impede apagar uma entrada e deixar `FixedIncomeTitles.issuerId` órfão, já que a coluna não tem chave estrangeira.

## Fonte e revisão

A lista nasce da relação de conglomerados prudenciais do Banco Central (IF.data) cruzada com a lista de instituições associadas ao FGC (site do FGC). Revisão à mão a cada trimestre; anote aqui a data de cada revisão e o que mudou.

| Lote         | Data       | Conteúdo                                                                                   | Conferência                                                                    |
| ------------ | ---------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 1 (primeira) | 2026-11-22 | Bancos que emitem CDB, LCI, LCA e LC para pessoa física; emissores frequentes de debênture | Montado de conhecimento público; a conferir contra as duas fontes (ver abaixo) |

O arquivo de terceiros não é copiado para o repositório. O lote 1 ainda precisa da conferência contra as duas fontes antes de ser tratado como revisado: rode o script abaixo e corrija por PR o que ele apontar.

### Script de comparação

`npm run issuers:compare -- --bc <arquivo> --fgc <arquivo>` lê duas listas de nomes (um nome por linha, ou CSV com o nome na primeira coluna), baixadas por você das duas fontes públicas, e imprime:

- bancos da lista que não aparecem nos conglomerados do BC;
- bancos marcados como associados que não aparecem na lista do FGC;
- associadas do FGC que não estão na lista curada.

A comparação ignora acento e caixa e usa `name` e `aliases`. O formato exato dos arquivos de cada fonte muda com o tempo: se a primeira coluna não for o nome, ajuste `namesOf` em `scripts/issuers-compare-core.ts`.

## Como contribuir

1. Confira a instituição e o conglomerado nas duas fontes públicas.
2. Acrescente a entrada em `institutions.json` (ordem por `id`), o grupo em `groups.json` se for novo, e o id em `known-ids.json`.
3. Para incorporação, não apague nada: marque a antiga como `retired` com `mergedInto`.
4. Rode `npx vitest run --config vitest.config.mts src/modules/issuers` e abra o PR citando a fonte e a data.
