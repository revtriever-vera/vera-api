# A card a fresh agent can build

## The cold start

Read the card as an agent that has only this card and the repo. It passes when that agent can say, without guessing: what will work when the card is done, how to tell it works, what it must not touch, and what has to be done before it starts.

## Slicing

- **Vertical, never horizontal.** A card cuts a narrow but complete path through every layer it needs (schema, API, screen, tests). "Todas as tabelas", then "todos os endpoints", then "todas as telas" is three cards that prove nothing until the last one.
- **Checkable on its own.** When the card is done there is something to run or to see.
- **One fresh session.** Split a card when its acceptance criteria do not fit in three or four lines, when it touches two subsystems that do not depend on each other, or when its PR would pass about a thousand changed lines.
- **Foundation first, the screen last.** Data and server enter before what the person sees, and stay invisible until the screen that uses them.
- **The risky card early.** What can prove the plan wrong goes at the start of the order, where it is cheap to learn.
- **Prefactor as its own card, first.** Make the change easy, then make the easy change.
- **A wide refactor is the exception to vertical slicing.** One mechanical change whose blast radius crosses the whole codebase (renaming a column, retyping a shared symbol) is sequenced as expand and contract: add the new form beside the old, migrate the callers in batches, remove the old form last. Each batch is a card blocked by the expand.

## Body of a card (`type: feature`)

The fields of the issue template, with what each one must carry.

- **Contexto.** The PRD it belongs to, and the decision this card carries, with the person's words when the card exists because of one.
- **O que será feito.** The behavior that works when the card is done, end to end, from the point of view of whoever uses it. Not a list of layers.
- **Critérios de aceite.** A checklist where each line is a command that passes or a behavior someone can observe. "Funciona bem" is not a criterion.
- **Notas técnicas.** The modules it touches, the seam where it is tested and the prior art for that test, the skills that govern it, and any migration, queue or integration. Module and behavior, no file paths.
- **Bloqueado por.** The issue numbers that must be done first, or "nada".
- **Fora deste card.** What a reader would expect here and belongs to another card or to nobody.
- **Casos do QA.** The cases of the script this card makes pass.
- **Espera alguém?** Whether it touches a Stop of the working agreement or needs the owner's sign-off, and which.

## Body of the PRD (`type: prd`)

The fields of the issue template, plus two things the template does not ask for:

- **Decisões.** Each decision of the person with their words and the date, so that a review can tell a decision from an assumption.
- **Revisão do plano.** What the plan review found and what was done with each finding.

"Fora do escopo" is where the plan protects itself: what was discussed and left out is written there, so that no agent builds it by inference.
