---
name: to-questionnaire
description: Turn a decision that belongs to someone outside the conversation into a short questionnaire that person can answer on their own time. Use when the work depends on an answer from the technical owner, from the product owner or from a customer who is not the one talking to you.
---

Adapted from mattpocock/skills@4ae2317 `skills/productivity/to-questionnaire/` (MIT, licence in `skills/LICENSE-mattpocock-skills` of this repository). Adaptations: the agent reaches it on its own; the document is in pt-BR and ready to forward; the answer is recorded in the issue.

Some decisions belong to a person who is not in the conversation: a technical invariant belongs to the technical owner, a product choice to the product owner. A **questionnaire** carries the decision to that person and brings the answer back.

**Grill the send, not the subject.** From the person you are talking to, you need only what they can always answer: who it goes to, and what you need back. Ask for it only when the conversation has not already said it.

1. **Who is it going to?** Their role and what they know that this conversation lacks. This sets how much context the document carries.
2. **What do you need back?** The concrete list of decisions or facts the work is waiting on. Done when each item is something the work will act on.
3. **Write it** with the structure below, in pt-BR, and put it in the reply inside a code block, ready to forward. Done when every item of step 2 has a question.
4. **When the answer comes back,** record it in the issue that owns the work, with the person's words and the date, and continue.

## Document structure

Order the questions most important first: an answer written between other things may cover only the first ones.

```
# <título>

**Para quê:** a decisão que depende destas respostas.
**De:** <quem pergunta> **Para:** <quem responde>

## Contexto

Um parágrafo para quem não acompanhou a conversa. O bastante para responder bem.

## Perguntas

1. <uma ideia por pergunta, nunca duas>
   Recomendação: <a resposta que você daria e por quê, para a pessoa poder só confirmar>

## Faltou alguma coisa?

O que não perguntamos e deveríamos saber.
```

A fact you can look up is not a question. Give every question your recommended answer, so that "sim" is a complete reply. "Não sei" is a useful answer: say so in the document.
