# Amostras sintéticas de importação de investimentos

Relatórios da B3 e prints de corretora **inventados**, para specs e evals da importação (cards #305, #311, #317, #319, #320).

## Regra: nada real aqui

O repositório é público. Nenhum arquivo real, nem "anonimizado à mão", entra neste diretório. Tudo sai do gerador em `generator/`:

- titular `PESSOA EXEMPLO`, CPF `123.456.789-00` (dígito verificador inválido de propósito), corretora `CORRETORA EXEMPLO`, emissor `BANCO EXEMPLO`, código de cliente e conta inventados;
- CNPJs e ISINs inventados (dígito verificador inválido);
- tickers e nomes de empresa listados na B3 são públicos e servem para o catálogo casar; preços, quantidades e datas são inventados.

O spec `generator/synthetic-fixtures.spec.ts` falha se algum fixture, arquivo do gerador ou este README tiver um CPF com dígito válido.

## Como regenerar

```
npm run fixtures:investment-import
```

Os arquivos de `generated/` ficam versionados: os specs leem eles direto e não dependem do gerador. O spec também confere que o que está versionado é o que o gerador produz (CSV, JSON e PDF byte a byte; XLSX e PNG só existem e abrem).

## O que sai

- `generated/b3/b3-negociacao`, `b3-movimentacao`, `b3-posicao` em `.xlsx` (abas `Negociação`, `Movimentação`, `Acoes`, `BDR`, `ETF`, `Fundo de Investimento`, `Renda Fixa`, `Tesouro Direto`) e em `.csv` (separador `;`, decimal com vírgula, uma planilha por arquivo na posição).
- `generated/b3/b3-posicao.pdf`: resumo da posição para o eval de leitura por modelo.
- `generated/b3/b3-renda-fixa.expected.json`: a taxa declarada de cada título de renda fixa e o preço CURVA esperado (insumo do #317).
- `generated/prints/*.png`: tela de corretora inventada em sete variações: nítida, foto inclinada, recorte parcial, escura, número ilegível, ativo que não existe e tela em inglês.

## Renda fixa de taxa conhecida

O preço CURVA é calculado a partir da taxa declarada (`112% do CDI`, `IPCA + 6,5%`, `PRE 12,3% a.a.`) sobre o PU de face de 1.000,00 na data de emissão, até a data de referência `2026-10-30`, com as séries de CDI (a.a., por mês) e IPCA (variação mensal) de `generator/reference-series.ts`. Dias úteis são segunda a sexta, sem feriados, base 252. As séries são inventadas.

Casos-limite na aba `Renda Fixa`: carência (`CDB-EX-CAREN`, tudo indisponível), pagamento de juros e amortização (`DEB-EX-JUROS`, linhas na `Movimentação`), emissão diferente da aplicação (`CDB-EX-APLIC`, aplicação em 10/06/2024 na `Movimentação`), linha sem indexador (`CDB-EX-SEMIDX`) e linha sem CURVA (`CDB-EX-SEMCURVA`).

## Reaproveitar

As notas de corretagem (#305) e o extrato Avenue/Apex (#319) entram como novos módulos em `generator/`, registrados em `generate.ts`, escrevendo em `generated/`.
