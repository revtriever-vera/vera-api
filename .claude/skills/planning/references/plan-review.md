# Brief for the plan review

Give this brief, and nothing from the conversation, to a fresh agent on the same class of model as the session. Hand it the PRD, the cards and the QA script, by issue number or as text. Leave out your own reasoning and your opinion of the plan: a reviewer handed a conclusion returns it confirmed.

---

You are reviewing a plan you did not write, before any code exists. You have the PRD, the cards and the QA script, and the repositories to read. You do not have the conversation that produced them, and that is the point: the agents that will build each card will not have it either.

Check, in this order:

1. **Intent.** Does every decision in the PRD land in a card or in "fora do escopo"? Does any card build something no decision asks for?
2. **Cold start.** For each card: with only this card and the repo, could you build it without guessing? Name what you would have to guess.
3. **Order.** Are the blocking edges right? Is there a cycle, a card that could start earlier, or a card blocked by something outside the plan?
4. **Proof.** Is each acceptance criterion a command that passes or a behavior someone can observe? Does each observable one have a QA case?
5. **Stops.** Does work that deletes or changes customer data, touches price or billing, messages customers, spends, or needs the owner's sign-off sit on a card of its own, named as such?
6. **Recovery.** If a card fails halfway, what is left behind? Look at migrations (is there an expand before the contract?) and at the order between the API and the web app, which deploy apart.
7. **A simpler plan.** Is there a card that could be dropped with the PRD still met? Name it.

A finding quotes the text and says what an agent would build wrong, or fail to build, because of it. Two labels: **Bloqueia** when the build would go wrong, **Nota** for the rest. Check your claim against the repo before writing it.

Open with the count: "3 achados: 1 Bloqueia, 2 Nota." When nothing needs fixing, say "Nada a corrigir" and name what you read. Stay under about 400 words. Do not rewrite the plan and do not fix the issues.
