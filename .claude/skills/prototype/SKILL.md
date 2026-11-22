---
name: prototype
description: Build a throwaway prototype so the person can react to a product decision before the real build. Use when proposing something a person will see, when a rule or flow is hard to judge on paper, and when the person asks to see it first ("quero ver", "como ficaria", "me mostra opções").
---

# Prototype

Adapted from mattpocock/skills@4ae2317 `skills/engineering/prototype/` (MIT, licence in `skills/LICENSE-mattpocock-skills` of this repository). Adaptations: part of the Propose step of the working agreement; lives on a `prototype/<slug>` branch that never reaches `main`; every visible word in pt-BR; the verdict is recorded in the issue with the person's words.

A prototype is **throwaway code that answers a question**. A person who cannot read the code can still say "não é isso" to something they can click. The question decides the shape.

## Pick a branch

- **"Does this rule, flow or state feel right?"** Follow [LOGIC.md](LOGIC.md): one self-contained HTML file, with buttons to play freely and guided walkthroughs, that the person drives alone.
- **"What should this look like?"** Follow [UI.md](UI.md): several radically different variants on one route, switched by a URL parameter and a floating bar.

The two produce very different artifacts. When the question could be either, ask which in one line before building.

## Rules for both

1. **Throwaway from the first line.** Work in a worktree on a branch named `prototype/<slug>`. That branch never opens a PR into `main` or into a milestone.
2. **Trivial to reach.** A logic demo is one HTML file the person opens. A UI prototype is a link to the local app with the variant parameter, with the sign-in already done for them.
3. **Read-only.** A UI variant reads what its host page already reads and writes nothing: no migration, no write to a database or an external service. A logic demo keeps its state in memory, with examples that read like a real company.
4. **Skip the polish.** No tests, no abstractions, no error handling beyond what makes it run.
5. **Show the state.** After every action or variant switch, render what changed.
6. **Speak the product.** Every visible word is pt-BR, in the domain words of the product (patrimônio, gastos, contas, metas).
7. **Capture the answer.** Record in the issue that owns the decision: the question, the verdict, the person's words with the date, and the branch name. Remove the worktree. The real build starts over under the working agreement and is written again, never promoted from the prototype.
