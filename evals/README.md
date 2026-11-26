# Evals das tarefas de IA

Teste com mock prova o encanamento, não a qualidade do texto. Os evals rodam os prompts de verdade contra casos inventados e reprovam o que a Vera não pode dizer.

## O que existe

- `cases/<tarefa>/*.json`: contexto agregado (mesmo formato que o modelo recebe), idioma, números que devem aparecer, termos que não podem, faixa de frases e um texto de referência. Mínimo de 8 casos em pt-BR e 4 em en por tarefa. Todo dado é inventado.
- `runner/`: linha de comando enxuta (`cli.ts`), checagens duras (`checks.ts`), juiz opcional (`judge.ts`), relatório (`report.ts`) e baseline (`baseline.ts`).
- `baseline.json`: notas da última rodada live aprovada.
- `out/`: relatórios de cada rodada (ignorado pelo git).

Tarefas cobertas: `summary_month`, `summary_cuts`, `summary_portfolio`, `ask_vera_step` (perguntas do copiloto, armadilhas e sondas) e `ask_vera_app_step` (a Vera dentro do app: ajuda do produto, onde fica cada tela, função que não existe, papel sem acesso, dado pessoal, Free perguntando de números e de mercado, aviso de compra ou venda).

Nos casos de `ask_vera_step`, `tools.required` lista as ferramentas que a rodada precisa chamar (`tool_missing` reprova) e `tools.allowed` as permitidas (`tool_unexpected`). `pending: true` marca o caso que espera outra entrega: só `empty`, `truncated`, ferramenta e `mustNotMention` contam, e a taxa de ferramenta dele sai à parte (`pending`), fora do portão.

Nos casos de `ask_vera_app_step`, `plan: free` entrega só `help_search` e `where_is` (como o registro faz com o Free), `role` define o papel que `where_is` enxerga, `screen` é a tela em que a pessoa está, e a pergunta e o histórico passam pela mascaragem de dado pessoal antes de ir ao modelo. As ferramentas de ajuda são as reais, sobre o catálogo (`HELP_CATALOG`). Mínimo de 12 casos em pt-BR e 4 em en, com ao menos um caso por família do catálogo (carteira, gastos, configurações e produto). No plano `premium`, as ferramentas de leitura do app (inclusive `concentration_overview`, `fixed_income_maturities` e `market_benchmarks`, de `appFixtureToolsOf`) devolvem dados inventados no mesmo formato que o modelo recebe; os casos delas exigem a linha do aviso de investimento.

## Comandos

```
npm run eval -- --task <tarefa|all> [--mode mock|live] [--judge] [--reps 3] [--reasoning minimal|provider-default] [--max-usd 1.5]
npm run eval -- --task all --mode mock --judge
EVALS_SECRETS_FILE=<arquivo local> npm run eval:live -- --task all --reps 3 --judge
```

Notas de corretagem (`investment_extract`): `cases/investment_extract/*.json` traz o arquivo sintético (`test/fixtures/investment-import/generated/notes`), a resposta de referência do modelo e o gabarito de cada linha (ticker resolvido, quantidade, preço, valor, taxa rateada, `check`), das linhas ignoradas e dos avisos da nota. O gerador de fixtures escreve esses arquivos (`npm run fixtures:investment-import`); não edite à mão. Em mock (specs, sem chave) a resposta de referência passa pelo pós-processamento e pelo `ModelReaderService` e tem de dar o gabarito. Ao vivo: `EVALS_SECRETS_FILE=<arquivo local> npm run eval:notes [-- <id do caso>]` manda cada nota ao modelo pelo `ModelReaderService` de verdade (texto mascarado ou PDF escaneado, prompt e schema do catálogo) e compara com o gabarito.

Sondas de entrada de arquivo: `EVALS_SECRETS_FILE=<arquivo local> npx tsx --tsconfig tsconfig.evals.json evals/probes/brokerage-note.ts <imagem.png> <nota.pdf>` manda uma nota de corretagem sintética ao modelo e confere ativo, quantidade, preço e data.

Tarefa `investment_extract` (leitura por modelo de documento de investimento): `cases/investment_extract/*.json` aponta para um arquivo de `test/fixtures/investment-import/generated` e para o gabarito (`*.expected.json`). `npm run eval:extract` roda no modo mock (o gabarito vira a resposta: prova os casos) e `EVALS_SECRETS_FILE=<arquivo local> npm run eval:extract -- --live` manda o PDF ao modelo (`EVALS_EXTRACT_MODEL` troca o modelo) e compara período, operações, proventos, posições, retenções e remessas contra o gabarito. Valor bruto só é comparado quando o modelo o devolve (o produto deriva de quantidade vezes preço) e só em ações. Sai com código 1 se algum caso falhar.

Saída: uma linha por caso (passou ou falhou, com o motivo), uma linha por tarefa (casos, nota do juiz, taxa de texto vazio, tempo, tokens de saída, custo em BRL) e o custo total. Código de saída diferente de zero se uma checagem dura falhar, a nota média do juiz ficar abaixo de `evalThreshold` (do catálogo, em fração de 5) ou cair mais de 0,5 frente à baseline na mesma versão de prompt. Também reprova: texto vazio acima de 2%, ferramenta certa abaixo de 90% nos casos que exigem ferramenta (fora os `pending`) qualquer rodada com conselho de compra ou venda (`forbidden_term`/`forbidden_text`, tolerância zero) e mais de 10% das rodadas reprovadas numa checagem dura (o modelo varia de uma repetição para outra; abaixo disso o `summary-guard` do produto já cai no texto de reserva). Quando texto vazio, o relatório lista `finishReason`, tokens de saída e de raciocínio e se houve texto de raciocínio (sem conteúdo).

## Checagens duras

- `empty` e `truncated`: texto vazio ou resposta cortada no `maxOutputTokens`.
- `schema`: não é o JSON `{"paragraphs": [...]}`.
- `number`, `marker`, `forbidden_term`, `length`, `emphasis`: o `summary-guard` do produto.
- `sentences`: 3 ou 4 frases nos resumos (o texto fixo da meta batida tem faixa própria).
- `language`: idioma por heurística de stopwords.
- `tone`: menção a "assistente" ou "inteligência artificial".
- `expected_text` e `forbidden_text`: números e trechos que o caso exige ou proíbe.

Só na tarefa do app:

- `link_in_catalog`: link em markdown para rota que o catálogo de ajuda não tem.
- `catalog_grounded`: nome de tela (link ou negrito) que não está no catálogo, ou frase que afirma função que a Vera não tem (boleto, cartão de crédito, empréstimo, conta digital) sem negar.
- `redaction`: padrão de dado pessoal (CPF, CNPJ, e-mail, telefone, cartão, CEP, chave Pix aleatória) em alguma requisição montada para o modelo.
- `notice`: resposta que cita ativo (ou usou ferramenta de carteira) sem a linha do aviso, ou com a linha sem ativo. O texto é o mesmo nos dois canais.

Exclamação, emoji, "IA" e conselho de compra ou venda caem em `forbidden_term`.

## Modo mock

O mock devolve a referência do caso. Prova que os casos, o formato e as checagens estão de acordo, sem chave e sem custo. É o que o CI roda em PR que toca `src/core/llm`, `src/modules/ai-assistant` ou `evals/`.

## Modo live

Só com `EVALS_SECRETS_FILE` apontando para um arquivo local, fora do repositório, com `AI_GATEWAY_API_KEY` (ou `VERCEL_AI_GATEWAY_API_KEY`), e com `LLM_DRIVER=live` (o `evals/local.sh` já define). A chave é lida dentro do comando e nunca é impressa. `--base-url` e `--model` testam um provedor compatível com OpenAI (chave em `EVALS_API_KEY`, ou a do gateway). `--max-usd` interrompe a rodada quando o gasto reportado pelo gateway passa do teto. `EVALS_USD_BRL` ajusta a cotação do custo (padrão 5,5).

O juiz roda no mesmo modelo, com raciocínio mínimo, sobre os casos que passaram nas checagens duras. Nota de 1 a 5 sobre fidelidade aos números, clareza, tom e idioma.

## Mudou o prompt, o raciocínio ou o teto de tokens

Suba o `promptVersion` no catálogo, rode `--judge --reps 3` ao vivo, atualize a baseline com `--update-baseline` (só grava com rodada live, com juiz e sem problema) e cole a tabela no PR.
