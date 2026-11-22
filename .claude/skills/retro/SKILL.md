---
name: retro
description: Turn what went wrong in a delivery into one proposed change to the working agreement, a skill or a check. Use when a defect reached production, a review reached a third read, a step of the working agreement was skipped, a rule no longer fits the work, a session lost steps that a note would have saved, or the person asks for a retrospective.
---

Adapted from mattpocock/skills@4ae2317 `skills/engineering/retro/` (MIT, licence in `skills/LICENSE-mattpocock-skills` of this repository). Adaptations: the triggers come from the working agreement; the retro proposes and the change enters by PR in this repository; the owners are this organization's files.

You are improving the **environment** the agents work in, so the next delivery goes better. The retro ends in a proposal in the reply. It edits nothing.

## Steps

1. Read `writing-for-agents`: every change you propose is a document an agent reads.
2. Read the primary sources of the delivery: the issue and its comments, the PR with its review findings and what was answered, and the CI and deploy runs. GitHub is the record; the conversation is a secondary source.
3. Look for candidates in these categories.
   - **Skipped step**: a step of the working agreement that did not happen, or happened only because a person asked. _Find_ the sentence that should have triggered it and say why it did not.
   - **Contradiction**: two instructions the agent received that cannot both be followed. _Name_ both files and lines.
   - **Automated check**: a mistake a check could have caught. Read the checks that exist first (`package.json` scripts, the CI workflows, the guards), so a check that exists but is unwired or broken is the finding.
   - **Review rule**: a defect the review should have caught. A **mechanical** pattern calls for a check; a **judgement call** belongs to `pr-review`.
   - **Agreement load**: a sentence of the working agreement that only one kind of task needs. It belongs in a skill, behind a pointer.
   - **No-op**: an instruction that does not change what the agent would do anyway.
   - **Stale reference**: something written that no longer holds (a skill fact, an open issue or milestone already delivered, a dated note) and was read as an instruction. The change is to remove or close it at its source, after checking its history; a new rule about it is not.
   - **Information access**: something the agent needed and could not see.
4. Present the candidates in pt-BR, most severe first, in the person's terms. Each one carries the evidence (what happened, where), the change proposed, the file that would own it and what it replaces or removes. Mark the one you would do first. Building any of them waits for the GO.

## Reference

### One occurrence is a report, two are a rule

A first occurrence is reported as a first occurrence, with no rule proposed. A rule or a check enters on the second occurrence, with both cited, and it replaces something: an instruction that did not work is rewritten or removed, never joined by a second one.

### A guard is the last resort

A guard (a hook, a branch protection or a permission rule) stops what no review can undo. Propose a new one only for an irreversible action that happened twice, and name the one it replaces.

### Owners

- The root `AGENTS.md` / `CLAUDE.md` of a repo: loaded in every session. Decision rights, the chain and its stops, what done means, and what is true only of that repo. Spend it sparingly.
- `skills/<group>/<name>/`: a method or a body of knowledge reached by its description.
- `pr-review`: review judgement, read with a diff in hand, where context pressure is lowest.
- Checks: the repo's scripts and workflows. They belong to the repo and its PR waits for the owner when it touches CI.
