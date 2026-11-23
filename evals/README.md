# Evals das tarefas de IA

Teste com mock prova o encanamento, não a qualidade do texto. Os evals rodam os prompts de verdade contra casos inventados e reprovam o que a Vera não pode dizer.

## O que existe

- `cases/<tarefa>/*.json`: contexto agregado (mesmo formato que o modelo recebe), idioma, números que devem aparecer, termos que não podem, faixa de frases e um texto de referência. Mínimo de 8 casos em pt-BR e 4 em en por tarefa. Todo dado é inventado.
- `runner/`: linha de comando enxuta (`cli.ts`), checagens duras (`checks.ts`), juiz opcional (`judge.ts`), relatório (`report.ts`) e baseline (`baseline.ts`).
- `baseline.json`: notas da última rodada live aprovada.
- `out/`: relatórios de cada rodada (ignorado pelo git).

Tarefas cobertas: `summary_month`, `summary_cuts` e `summary_portfolio`. A tarefa `ask_vera_step` entra quando o prompt dela existir (#124), junto com as perguntas-armadilha.

## Comandos

```
npm run eval -- --task <tarefa|all> [--mode mock|live] [--judge] [--reps 3] [--reasoning minimal|provider-default] [--max-usd 1.5]
npm run eval -- --task all --mode mock --judge
EVALS_SECRETS_FILE=<arquivo local> npm run eval:live -- --task all --reps 3 --judge
```

Saída: uma linha por caso (passou ou falhou, com o motivo), uma linha por tarefa (casos, nota do juiz, taxa de texto vazio, tempo, tokens de saída, custo em BRL) e o custo total. Código de saída diferente de zero se uma checagem dura falhar, a nota média do juiz ficar abaixo de `evalThreshold` (do catálogo, em fração de 5) ou cair mais de 0,5 frente à baseline na mesma versão de prompt.

## Checagens duras

- `empty` e `truncated`: texto vazio ou resposta cortada no `maxOutputTokens`.
- `schema`: não é o JSON `{"paragraphs": [...]}`.
- `number`, `marker`, `forbidden_term`, `length`, `emphasis`: o `summary-guard` do produto.
- `sentences`: 3 ou 4 frases nos resumos (o texto fixo da meta batida tem faixa própria).
- `language`: idioma por heurística de stopwords.
- `tone`: menção a "assistente" ou "inteligência artificial".
- `expected_text` e `forbidden_text`: números e trechos que o caso exige ou proíbe.

Exclamação, emoji, "IA" e conselho de compra ou venda caem em `forbidden_term`.

## Modo mock

O mock devolve a referência do caso. Prova que os casos, o formato e as checagens estão de acordo, sem chave e sem custo. É o que o CI roda em PR que toca `src/core/llm`, `src/modules/ai-assistant` ou `evals/`.

## Modo live

Só com `EVALS_SECRETS_FILE` apontando para um arquivo local, fora do repositório, com `AI_GATEWAY_API_KEY` (ou `VERCEL_AI_GATEWAY_API_KEY`), e com `LLM_DRIVER=live` (o `evals/local.sh` já define). A chave é lida dentro do comando e nunca é impressa. `--base-url` e `--model` testam um provedor compatível com OpenAI (chave em `EVALS_API_KEY`, ou a do gateway). `--max-usd` interrompe a rodada quando o gasto reportado pelo gateway passa do teto. `EVALS_USD_BRL` ajusta a cotação do custo (padrão 5,5).

O juiz roda no mesmo modelo, com raciocínio mínimo, sobre os casos que passaram nas checagens duras. Nota de 1 a 5 sobre fidelidade aos números, clareza, tom e idioma.

## Mudou o prompt, o raciocínio ou o teto de tokens

Suba o `promptVersion` no catálogo, rode `--judge --reps 3` ao vivo, atualize a baseline com `--update-baseline` (só grava com rodada live, com juiz e sem problema) e cole a tabela no PR.
