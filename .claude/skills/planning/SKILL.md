---
name: planning
description: Plan the execution before the first line of code, so an agent with no memory of the conversation can build each part. Use right after a GO, whenever a conversation reaches a conclusion that will be built ("fechado", "pode fazer", "vamos seguir"), before creating a milestone or its issues, and when resuming work whose plan is missing or no longer matches the code.
---

# Planning

Built on the milestone section of `conventions` (the artifacts of an Epic), with ideas adapted from mattpocock/skills@4ae2317 `to-spec` and `to-tickets` and from addyosmani/agent-skills@301b02b `planning-and-task-breakdown` (both MIT; licences in `skills/` of this repository).

The person decides what is worth building. The plan is their guarantee that someone thought through how: they cannot check the code, so they check the plan. The agents that build it start with no memory of the conversation, so what they need is in the issues or it does not exist.

**The plan is done when it passes the cold start**: an agent given one card and the repo, and nothing else, could build that card; and the person given the summary could say what they will be able to do after each card. Until then, write no code.

## Size the plan to the class

| Class             | The plan is                                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Hotfix            | one `type: bug` issue: what happens, what should happen, how to reproduce, and the cause once it is shown (`diagnosing-bugs`)           |
| Small improvement | one `type: feature` issue that passes the cold start ([references/card.md](references/card.md))                                         |
| Epic              | a milestone: the PRD, one card per slice and the QA script, by the steps below                                                         |

A Small improvement that grows a second card or a second repo while you plan it is an Epic. Say so to the person before going on, because the path and the proof change.

## Planning an Epic

1. **Settle what was decided.** From the conversation, write the problem, the solution in the user's terms, each decision with the person's words and the date, and what stays out. A product decision still open stops the plan: go back to `grilling`. Done when every sentence of the proposal the person accepted is in one of those four lists.
2. **Read the ground.** In the code, find where this lives today, the seams where it can be tested (an existing one, as high as possible), the prior art to follow and the skills that govern each part. Find what touches the Stops of the working agreement or needs the owner's sign-off: that work gets a card of its own, so the wait holds one card and not the Epic.
3. **Slice into cards.** Each card is a tracer bullet: a complete path through every layer it needs, checkable on its own, small enough for one fresh session. Give each card its blocking edges. The rules and the body of a card are in [references/card.md](references/card.md). Done when every decision of step 1 lands in a card or in "fora do escopo", no card is blocked by something outside the plan, and at least one card has no blocker.
4. **Write the QA script now**, as the `type: qa` issue. Written before the code it describes what was promised; written after, what was built. Each case proves one acceptance criterion, and each card names the cases it makes pass. Done when every acceptance criterion a person can observe has a case.
5. **Have the plan reviewed** by a fresh agent that saw none of the conversation, on the same class of model as the session, with the brief in [references/plan-review.md](references/plan-review.md). Fix what it shows. Record in the PRD what it found and what you did with each finding.
6. **Publish** the issues in dependency order, so each blocking edge cites a real issue number. Milestone, slug and labels follow the milestone section of `conventions`.
7. **Show the plan to the person**, in pt-BR: one line per card, in order, saying what they will be able to see or do after it, and what waits on whom. The GO already given covers the build. Ask again only when planning changed what was accepted: it grew, it got riskier, or it will do something different.

Then build the frontier: any card whose blockers are done.

## Keeping the plan true

The plan lives in the issues, and it stays true while the work runs.

- A deviation found while building goes on the card as a comment, with the reason, before the code that deviates. Pick the conservative option, write it down, keep going.
- When the code and the plan disagree about **what** was decided, the plan is right and the code is the defect. When they disagree about **how**, the code is right and the card is updated.
- A new decision of the person goes into the PRD, with their words and the date.
- To resume, load the milestone in one call, read the PRD, the cards and their comments, and take the frontier. Rebuilding the plan from the commits loses every decision.

## Gotchas

- **An Epic that crosses repos keeps its PRD and its QA issue in `vera-api`.** Each card lives in the repo it changes, and the milestone has the same slug in every repo. A review in another repo that cannot find the PRD reviews without the decisions.
- **The API deploys before the web app, and they deploy apart.** A screen that needs a new field gets an API card first, and must still work against the API that is in production. If the web app ships first, the screen calls an endpoint or field that production does not have yet, and it breaks for every user.
- **A migration that deletes or transforms existing data is its own card**: expand first, contract later, and it waits for the owner.
- **A QA case that needs something outside the machine** (a Pluggy sandbox credential, a test bank connection) declares it in the script's preconditions now. Found during the round, it is a blocked case.
- **A card names the module and the behavior, never a file path or a snippet.** Paths go stale before the card is built. The exception is a snippet from a prototype that encodes a decision more exactly than prose.
- **"Como combinamos" in a card is a hole.** The agent that builds it was not there: write what was agreed.
- **A title with "e" is two cards.**
