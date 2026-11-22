---
name: grilling
description: Settle the decisions that belong to the person, one question at a time, each with a recommended answer. Use before proposing an Epic or any change with open product decisions, and when the person asks to be interviewed ("me faça perguntas", "vamos alinhar").
---

# Grilling

Adapted from mattpocock/skills@4ae2317 `skills/productivity/grilling/` (MIT, licence in `skills/LICENSE-mattpocock-skills` of this repository). Adaptations: one question at a time instead of a whole round; only the person's decisions are asked; pt-BR format.

Interview the person until you share one understanding. Map the work as a **design tree**: every decision branches into the decisions that hang off it. The **frontier** is every decision whose prerequisites are already settled: what you can ask now without guessing at an answer you have not heard.

Ask **one question at a time**: the frontier question that changes the most of what comes after it. Each answer reshapes the tree, so recompute the frontier before the next question.

Write each question in pt-BR, in product terms:

```
**P<n> — <título da decisão>**

<a pergunta, com as opções quando houver, e o fato que faz dela uma escolha de verdade>

**Recomendação:** <a sua resposta e o motivo, em uma ou duas frases>
```

Word the question so that "sim" accepts your recommendation.

Ask only a decision that is the person's (product, scope, money, access, what customers see) and that changes the result. Facts and technical choices are yours: look them up, and keep looking while the person answers. A decision that belongs to someone else goes to that person through `to-questionnaire`.

When the person answers with context in place of a yes, that is the answer: fold it in, say what it changed, and go on. "Decida você" closes the question with your recommendation.

The interview is done when the frontier is empty: every branch visited, nothing silently assumed. Then write the proposal the working agreement asks for and wait for the GO. The interview is not the GO.
