# Research basis

Primary source: [Anthropic — Components of agent memory](https://www.anthropic.com/research/components-of-agent-memory). See the adjacent source snapshot for retrieved text; figures are not included.

## 1. Forward time: memory is a prediction

**Reported:** Agents write notes while doing work, judging what future sessions might need. Better examples preserve plans, strategies, validated rules, and non-obvious discoveries rather than indiscriminately duplicating observable state. The future is unknown, so salience judgments are necessarily imperfect.

**Design implication:** Make deliberate note-taking possible during work. Preserve experience separately so an omitted note is not necessarily lost knowledge. Do not require a note after every turn, or constrain all memory to failures.

## 2. Backward time: hindsight changes the representation

**Reported:** Dreaming revisits logs and notes between interactions. It can correct an erroneous memory against the original transcript, build linked wikis, promote a small subset into injected context, tailor representations to a goal, and repair gaps across sessions.

**Design implication:** Consolidation is not merely summarization. It must be able to inspect original evidence, revise or retire a claim, change organization, and leave an audit trail. A consistency check among summaries alone does not reproduce the transcript-grounded correction example.

**Boundary:** A transcript proves what was recorded, not that every statement within it is true. Tool observations, user statements, and agent guesses must remain distinguishable. This qualification is our engineering interpretation.

## 3. Search remains foundational

**Reported:** On the internal-document evaluation, search alone scored 53%; search plus the developed wiki reached 61%, whereas wiki-only reached 48%. Search plus wiki also saved about 20,000 tokens per question. These are task-specific results, not expected local performance.

**Design implication:** Keep source search available even after consolidation. Test representations as an addition to source access, not a replacement.

## 4. Representation must earn its cost

**Reported:** A wiki helped with cross-document reasoning in some evaluations, but not on every task. One wiki grew larger than the source material and abstracted little.

**Design implication:** Measure utility and maintenance cost. Do not require a wiki, graph, or vector database before a simpler baseline has been evaluated.

## 5. Promotion must stay small

**Reported:** Always-injected memories spend context and can propagate errors. Longer instruction files reduce adherence. A small header/index can point toward deeper notes instead of loading everything.

**Design implication:** Keep a bounded top layer with pointers. Promotion and demotion are explicit maintenance operations, not rewards for repetition.

## 6. Guidance depends on model and task

**Reported:** Read-memory and test-theory prompting helped an older model; rigid capture rules reduced gains for stronger models. Goal-specific wiki instructions and avoiding shared-page overwrites improved a contract task.

**Design implication:** Explain memory’s purpose, allow flexible salience judgments, and evaluate model-specific guidance. Protect writes against conflicts. Do not turn one successful benchmark prompt into a universal policy.

## Open research questions retained

- How much capture should happen in-session versus later?
- Which memories deserve rechecking, and at what cadence?
- When does maintaining a representation cost more than searching sources?
- How should consolidation reflect the user’s current goals without losing unrelated useful knowledge?

The article does not prescribe SQLite, a schema, a Pi hook, a fixed consolidation schedule, or a confidence-scoring algorithm. Those are implementation decisions to test.
