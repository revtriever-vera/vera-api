# Foundations

Consult the section that bears on the decision. Each section gives the origin of an idea, how it works and where its use breaks down.

## Effort and goals — goal-directed design

**Origin.** Alan Cooper, *About Face* and *The Inmates Are Running the Asylum*.

**Mechanism.** People pursue goals at several levels: what they want to accomplish (end goals), how they want to feel while doing it (experience goals — in control, not stupid), and what they want from life more broadly. Tasks and actions are only means; a task the system demands that the goal doesn't need is pure cost.

**Concepts.**
- *Excise*: effort spent on the tool instead of the goal — navigation, data the system already has, confirmations, waiting, remembering across screens.
- *Perpetual intermediates*: most people learn enough to work and then stop learning. They are the majority on any path that is used regularly.

**Limits.** Some effort carries value — the effort of learning, of craft, of play, or friction that protects against harm. Excise is effort that serves neither the goal nor the person.

## Mental models — the system image

**Origin.** Don Norman, *The Design of Everyday Things*.

**Mechanism.** There are three models: the designer's (how it actually works), the user's (how they believe it works), and the *system image* between them (everything the person can perceive: appearance, behavior, feedback, documentation). The user's model is built only from the system image and their prior knowledge. Where the system image is incomplete or misleading, the person forms a wrong model, acts on it, and usually blames themselves.

**Concepts.**
- *Affordance*: a relationship between a thing and a person that makes an action possible.
- *Signifier*: a perceivable cue that shows where and how to act. Trouble comes from an affordance without a signifier (a hidden gesture) or a signifier without an affordance (something that looks clickable and isn't).
- *Mapping*: the relationship between controls and their effects; natural mappings borrow from spatial or cultural correspondence.
- *Constraints*: physical, logical, semantic and cultural limits that leave fewer ways to act wrongly.

**Limits.** A perfectly explicit system image can overwhelm. The aim is enough signification for the next action, not exposure of the whole designer's model.

## Prior knowledge and convention

**Origin.** Norman on cultural constraints; Jakob Nielsen's observation that people spend most of their time in other products ("Jakob's law"); platform guidelines.

**Mechanism.** Conventions are learned mappings shared across products. A person brings them to every new interface for free. Each departure requires unlearning, and the cost is paid by every user, every time they cross between products.

**Limits.** Conventions encode history, not optimality, and can be poor. Breaking one is justified when the gain is large, the new behavior can be learned quickly, and the old expectation fails safely.

## The action cycle — gulfs of execution and evaluation

**Origin.** Norman, the seven stages of action.

**Mechanism.** Acting has two halves. Execution: form a goal, plan, specify the action, perform it. Evaluation: perceive the state of the world, interpret it, compare it with the goal. The *gulf of execution* is the distance between what the person wants and what the interface lets them see and do; the *gulf of evaluation* is the distance between what the system did and what the person can perceive and understand. Locating which stage breaks is the fastest diagnosis of a confusing interaction.

**Concepts.**
- *Locus of attention*: a person attends to one thing at a time. Feedback, status and controls far from it are effectively invisible.
- *Working memory*: about four chunks. What must be remembered across screens is a burden; what is visible is free. Recognition beats recall.
- *Cognitive load*: intrinsic (the task's real complexity), extraneous (imposed by the design — remove it) and germane (building understanding — support it).

**Limits.** Experts bridge both gulfs from memory and prefer density over signification; the same design must serve them without hiding the path for others.

## Human time — response and motion

**Origin.** Robert Miller (1968) and Card, Moran and Newell on response time thresholds, popularized by Nielsen; Michotte's studies of perceived causality; research on change blindness.

**Mechanism.** Around 0.1 s, a response is perceived as directly caused by the action. Around 1 s, the flow of thought survives a delay. Around 10 s, attention leaves for something else. Use these times as rough guides. Choose feedback based on the task, the delay people experience and whether they can continue working.

**Motion as information.** People miss changes they don't see happen (change blindness), and they read motion as causation. Animation therefore earns its place by carrying continuity (where something went), causality (what caused what) or attention (what changed). Motion without one of these is waiting. Motion also affects some people physically — vestibular discomfort, distraction, seizure risk with flashing — which is why reduced-motion preferences exist and must reduce movement without removing the information it carried.

**Limits.** Thresholds are about perception; latency depends on devices and networks people actually use, which are often slower than the ones designers use.

## Habituation and learning

**Origin.** Cooper's perpetual intermediates; Jef Raskin, *The Humane Interface*, on habituation and modes; skill acquisition research.

**Mechanism.** Repeated actions become automatic and stop receiving conscious attention. That is what makes skilled use fast — and why a confirmation shown on every action stops being read, why a decorative animation becomes a delay, and why a mode the person forgets about produces errors. Interfaces that let actions become automatic, and that stay safe when they do, get better with use.

**Concepts.**
- *Modes*: the same action means different things depending on a state the person must remember. Mode errors are habituation colliding with hidden state. Visible modes, or temporary modes held by the person (quasi-modes), reduce them.
- *Layering*: a common path for regular use, with help for newcomers and accelerators for experts that don't stand in the common path's way.

## Reversibility

**Origin.** Shneiderman's direct manipulation principles (rapid, incremental, reversible actions); Carroll on congruent inverse operations; Raskin on undo over confirmation.

**Mechanism.** When actions can be undone, mistakes are cheap, and people explore, learn faster and act with confidence. Confirmation dialogs attempt the same protection by interrupting, but habituation turns them into a reflex, so they protect least exactly when they're shown most.

**Limits.** Some actions cross a boundary that undo can't reach: something sent, paid, or already seen by other people. Grace periods (a delay before the irreversible step) recover much of the benefit. True undo is a system design decision — versions, soft deletion, compensating actions — and becomes very expensive when decided late.

## Error

**Origin.** James Reason, *Human Error*; Norman on slips and mistakes.

**Mechanism.** Errors are not random. *Slips* occur when the intention is right and execution goes wrong: a habit captures the action, two similar things are confused, the intention is lost mid-action, a mode is forgotten. *Mistakes* occur when the intention itself is wrong: a misapplied rule, an incomplete model, a forgotten step. Each kind has its own remedy: slips yield to constraints, distinctiveness and distance between routine and dangerous actions; mistakes yield to a better system image — visible state, previews, labels that name the outcome.

**Concepts.**
- *Forcing functions*: interlocks (an order must be followed), lock-ins (leaving mid-action requires deliberate intent), lockouts (dangerous states can't be entered). Justified where danger is real; friction elsewhere.
- *Recovery*: an error message states what happened in the person's terms, keeps what they did, and offers the way forward. Blame and codes don't help anyone recover.

## The state space of a surface

**Mechanism.** A surface's appearance and behavior are a function of several independent conditions: the data (none, some, typical, a great deal, malformed), time (waiting, stale, expired), connection (present, intermittent, absent), access (allowed, partly, not at all), content size and language, and other people's concurrent actions. The happy path is one combination. Each condition that can vary multiplies the states the surface can be in, and behavior in each is either designed or left to chance.

**Limits.** Not every combination can occur; reasoning about which ones can is part of the design, and stating why one can't is as useful as designing it.

## Directness — direct manipulation and instrumental interaction

**Origin.** Ben Shneiderman, "Direct Manipulation" (1983); Michel Beaudouin-Lafon, "Instrumental Interaction" (2000). See the [bibliography](sources.md).

**Mechanism.** Shneiderman: when the object of interest is continuously visible and changed through physical actions with rapid, incremental, reversible, immediately visible effects, people work at the level of the task (semantic knowledge, stable and transferable) instead of command syntax (arbitrary and easily forgotten). Beaudouin-Lafon: most interfaces aren't truly direct — people act on *instruments* (scrollbars, handles, dialogs, menus) that act on *domain objects*. Instruments can be compared by three properties:
- *Degree of indirection*: the spatial offset (screen distance between instrument and object) and the temporal offset (delay between action and the object's response). Short temporal offsets exploit the perception–action loop and give a sense of causality.
- *Degree of integration*: the degrees of freedom the instrument controls relative to those the input device provides.
- *Degree of compatibility*: how closely the physical action resembles the object's response.

Instruments are activated *spatially* (always visible, pointed at — costs space and attention) or *temporally* (selected, then active until changed — a mode, costing an action and risking mode errors). *Reification* turns concepts — styles, layers, saved searches, even commands — into objects people can see and manipulate.

**Limits.** Shneiderman names them himself: representations don't automatically help (what's shown matters more than that it's graphical); icons must be learned; metaphors suggest operations that don't exist; graphics consume space experts would rather use for information. Precision, batch work, repetition and delegation favor symbolic interaction.

## Quantitative models

- *Fitts's law*: time to reach a target grows with distance and shrinks with size.
- *Hick–Hyman law*: decision time grows with the logarithm of the number of equally likely choices; grouping and ordering change the effective number.
- *Keystroke-level model*: expert task time as a sum of elementary operators; useful for comparing designs of a frequent task, blind to learning, errors and satisfaction.

They settle close comparisons and support arguments; they rarely decide a design on their own.

## Ability and situation — inclusive design

**Origin.** Microsoft Inclusive Design (the persona spectrum of permanent, temporary and situational limitation); the social model of disability; W3C WCAG.

**Mechanism.** Ability isn't binary and isn't fixed: everyone moves along ranges of vision, hearing, motor control, cognition and attention, permanently, temporarily or for the length of a situation. Interactions that depend on a single channel or input exclude whoever is outside it at that moment. Designs made for the edges of the range tend to work better for the middle too. Native platform semantics carry behavior and meaning to assistive technologies for free; custom constructions must rebuild all of it.

WCAG is the shared, testable minimum and the legal reference in many places; consult the current version rather than a summary of it. Passing it is necessary, not sufficient: automated checks catch a fraction of problems, and the rest only appear when the task is attempted with a keyboard alone, a screen reader, magnification, or reduced motion.

## Meaning and emotion

**Origin.** Norman, *Emotional Design* (visceral, behavioral, reflective levels); Brenda Laurel, *Computers as Theatre*.

**Mechanism.** An interaction is experienced as a sequence with a beginning, a build, a moment of commitment and a resolution, and it is remembered through its peaks and its end. Commitment moments carry weight; resolution confirms what changed and what comes next. Tension can engage (a real decision, anticipation) or frustrate (not knowing whether it worked, fear of the irreversible). Interaction design acts mostly on the behavioral level — the felt sense of control and fluency — which is what shapes the reflective one.

**Limits.** Expression is welcome where a moment matters and grating where it doesn't; celebrating the trivial feels patronizing.

## Honesty and trust

**Mechanism.** Trust is a prediction that the system will behave as it appears to. Every false success, hidden cost or manipulative pattern (Harry Brignull's catalog of *deceptive patterns*) trades a short-term gain for a lasting loss of that prediction — and, increasingly, for regulatory exposure.

## Evidence

**Mechanism.** Observed behavior predicts behavior; stated preference predicts it poorly; predictions about one's own future behavior predict it least. Usability testing with a handful of people on real tasks reveals most severe problems on those tasks; analytics shows where behavior changes but not why. A design built on assumptions is legitimate when the assumptions are visible and paired with what would test them.
