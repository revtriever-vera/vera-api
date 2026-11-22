# Foundations

Consult the section that bears on the decision. Each section gives the origin of an idea, how it works and where its use breaks down.

## Progress in a situation — Jobs to be Done

**Origin.** Clayton Christensen's jobs theory, developed with Bob Moesta, Chris Spiek and others; Alan Klement's work on jobs as progress; Tony Ulwick's Outcome-Driven Innovation.

**Mechanism.** People "hire" a product to make progress in a particular circumstance, and "fire" it when something does that better. The circumstance — not the person's attributes — carries the causal weight, which is why the same person makes different choices in different situations.

**Concepts.**
- *Struggling moment*: the point when the current way became unacceptable. It is where demand starts and where the most useful evidence lives.
- *The job is solution-free*: it names the progress, not the means. A job that contains a technology is a solution in disguise.
- *Dimensions*: progress has a functional side (getting something done), an emotional side (how one wants to feel) and a social side (how one wants to be seen). Which dominates varies; noticing which one is deciding is often the insight.
- *Jobs nest*: a larger progress contains smaller ones. Framing at the level where the product can make a visible difference — and checking one level above and below — keeps the framing neither vague nor trivial.
- *Two lenses*. "Jobs as progress" (Christensen, Moesta, Klement) treats the job as a move from a current situation to a preferred one and studies it through causal stories of switching; it yields hypotheses about demand. "Jobs as activity" (Ulwick) treats the job as a functional process, decomposes it into steps and measurable desired outcomes, and surveys which are under-served; it yields ranked needs whose quality depends on survey craft. They answer different questions. Say which one you're using; presenting a narrative with numbers attached imports false precision, and treating a needs survey as insight into motivation imports false depth.

**Limits.** A job stated abstractly enough fits every product after the fact. There's no controlled evidence that jobs framing produces better decisions than alternatives (see [sources.md](sources.md)); its strength is that it moves attention from the product to the person's circumstance.

## The cost of change — forces of progress

**Origin.** Moesta and Spiek, from studying why people switch.

**Mechanism.** Four forces act at once. Two move people toward change: the *push* of the current situation and the *pull* of the new solution. Two hold them back: *anxiety* about the new and *habit* of the present. Change happens when the first pair outweighs the second. Switching also unfolds over time — first thought, passive looking, a triggering event, active looking, deciding, first use — and the triggers mark when people become reachable.

**What follows.** Adding value strengthens only one force. When good products fail to be adopted, the cause is often unaddressed anxiety or habit, and reducing them is design work as real as any feature.

**Limits.** The model explains switching behavior; it says less about value the person hasn't yet imagined, where no current way exists to switch from.

## Requests and needs — opportunity framing

**Origin.** Teresa Torres, *Continuous Discovery Habits*; the older design distinction between problem space and solution space (Indi Young, the Double Diamond).

**Mechanism.** A stated request compresses a need and an imagined solution into one sentence. Separating them reopens the space of answers. Torres's test: an opportunity is well framed when several substantially different solutions could address it, and it is specific — a moment, a context, a person — because specificity is what makes it testable.

**Concepts.**
- *Opportunity*: a need, pain or desire, from the customer's point of view, free of solution.
- *Opportunity solution tree*: an outcome at the root, the opportunities that could drive it, solutions for a chosen opportunity, tests for each solution. Its value is making the reasoning visible: why this opportunity, why this solution, what we're testing.
- *Grouping*: related opportunities sit under a broader need; the shape of that hierarchy is where strategy shows.

**Limits.** Problem and solution spaces blur in practice: building and prototyping are themselves ways of understanding the problem. Use the separation to keep solutions out of how needs are described, not as a phase that must finish before anything is built.

## Outcomes over outputs

**Origin.** Joshua Seiden, *Outcomes Over Output*; Melissa Perri, *Escaping the Build Trap*; Torres's distinction between business outcomes, product outcomes and traction metrics.

**Mechanism.** An organization that measures what it ships optimizes shipping. Defining success as a change in behavior forces the question of why that behavior matters and keeps the team free to change the solution.

**Concepts.**
- *Product outcome*: a behavior the team can influence, believed to drive a business result. The level most useful for focus.
- *Causal bet*: the stated link between the behavior and the business result. Writing it down makes it testable.
- *Stop condition*: the result, decided beforehand, that would end or redirect the effort.

**Limits.** Every metric is a proxy and can move for reasons unrelated to the job (Goodhart's law). Metrics that grow when the product gets worse at its job — time spent, clicks — mislead most.

## Choosing with alternatives

**Origin.** Decision research on single-option evaluation and confirmation bias; Torres's "compare and contrast"; Roger Martin's "what would have to be true?".

**Mechanism.** People judge an option far more accurately against another option than in isolation, and the first idea tends to collect supporting evidence while contrary evidence is discounted. Alternatives that differ in kind expose the assumptions each depends on. Asking what would have to be true for each option to be the best turns disagreement into a list of testable conditions.

**Limits.** Alternatives cost effort; for small reversible choices, deciding fast and observing is better.

## Assumptions and risk

**Origin.** Marty Cagan, *Inspired* (four risks); Lean Startup's leap-of-faith assumptions (Eric Ries); assumption mapping (David Bland, *Testing Business Ideas*); Gary Klein's pre-mortem.

**Mechanism.** A solution succeeds only if many things are simultaneously true: people want it (value), can use it (usability), it can be built (feasibility), and it works for the business (viability) — plus that it does no harm. Some of these are well supported; some are hopes. The cost of learning rises with commitment, so the rational order is to test the important, weakly supported assumptions first, with the cheapest method able to change the decision.

**Concepts.**
- *Falsifiable assumption*: stated so that a result could prove it wrong.
- *Threshold set in advance*: protects against motivated reading of results.
- *Pre-mortem*: imagining the failure in advance surfaces the assumptions people avoid saying aloud.

**Limits.** Some assumptions can only be tested by building; then build the smallest version that tests that one assumption.

## Evidence strength

**Origin.** The intention–behavior gap in behavioral research; Rob Fitzpatrick, *The Mom Test*; standard research methods.

**Mechanism.** What people did is the best predictor of what they'll do. Stories about specific past moments come close. Opinions are weaker, and predictions about their own future behavior or willingness to pay are weakest — people are sincere and still wrong. Compliments cost nothing; commitments of time, money or reputation carry signal.

**What follows.** Every claim in a framing carries its source and strength; decisions that are expensive to reverse need the stronger kinds. Existing traces of behavior — records of what people did, asked for, complained about, or gave up on — are often richer evidence than new opinions.

**Limits.** Past behavior says little about genuinely new possibilities; there, small experiments that create real behavior are the better evidence.

## Structure before surface — the object model

**Origin.** Mental model research (Norman; Indi Young); Sophia Prater's Object-Oriented UX and its ORCA process; domain-driven design's *ubiquitous language* (Eric Evans).

**Mechanism.** People think about a domain in terms of its things and how they relate, and act on those things. When the product's concepts match theirs, people predict where things are and what they can do; when the product's concepts mirror its database or its org chart instead, people get lost no matter how polished the screens.

**Concepts.**
- *Objects*: the things users care about, with identity and their own detail.
- *Relationships*: how objects connect, which become the paths people navigate.
- *Calls to action*: what each kind of person can do to each object — which also defines permissions.
- *Attributes*: what describes each object, and which attributes people sort, filter or decide by.
- *One name per concept*: the same thing called differently in different places splits the product; different things sharing a name produce confusion.

**Limits.** Object modeling fits products made of things people manage; for experiences that are mainly a flow or a single act, the flow may be the better primary structure.

## Worth before solution — appetite and slicing

**Origin.** Ryan Singer, *Shape Up* (Basecamp); Jeff Patton, *User Story Mapping*; Parkinson's law.

**Mechanism.** An estimate begins with a design and ends with a number, so it inherits every ambition of the design. An appetite begins with how much the problem is worth and ends with a design that fits, so scope becomes the variable instead of time. Unknowns that could multiply the effort (*rabbit holes*) are found and resolved while shaping, and exclusions (*no-gos*) are stated so nobody builds them by accident. Delivering value end to end — a *walking skeleton* across the whole journey — teaches more than perfecting one step, because the outcome only appears when the whole path works.

**Limits.** Some problems can't be cut to a fixed budget without losing the thing that makes them worth doing; then the honest answer is a bigger appetite or not now.

## Proportion

**Mechanism.** Framing is itself an investment with a return: it pays when being wrong is expensive or hard to undo, and costs more than it saves when a change is cheap and reversible. Reversibility of the decision is the main variable.
