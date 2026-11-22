---
name: interaction-design
description: Use when specifying how a person completes a task, implementing a change to that interaction, or reviewing a flow for feedback, error recovery or accessibility.
---

# Interaction Design

Start with the person’s task and the action affected by the change. If choosing the product goal would change the flow, resolve that decision with `product-ux-framing`. Otherwise use the goal and constraints already recorded.

Walk the action from intent to result. How does the person discover it, perform it with the inputs they use, and know whether it worked? Inspect the existing flow or prototype where available. Distinguish what you observed from what you expect people to understand.

Follow the branches that change the person’s choices, feedback or recovery. Consider delay, access, concurrent edits and interrupted work where they affect the task. Group states with the same user-visible behavior. Give frequent actions a short path and irreversible actions a clear consequence.

For example, a timeout after saving a note can leave the result unknown. Specify what the person sees, where the draft remains available, and how a retry avoids creating a second note. Check what the system can actually confirm before promising success or safe recovery.

Record the behavior in the existing acceptance criteria. The interaction is specified when someone can exercise the affected path and tell, from an observable result, whether each consequential outcome worked. In a review, report the failing action, what the person experiences and what would resolve it.

- When evaluating a prototype or shipped flow, walk the task with the [interaction rubric](references/rubric.md).
- When deciding a trade-off such as undo versus confirmation, feedback timing or keyboard operation, consult the relevant section of [foundations](references/foundations.md).
- When a design decision rests on a research claim, check its [source and limitations](references/sources.md).
