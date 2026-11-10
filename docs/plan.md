# Build and evaluation plan

The first bounded prototype is implemented; see [verification](prototype-verification.md) and [its contract](prototype-contract.md). This remains the broader evaluation roadmap, not a claim that every fixture or benchmark below has been completed. Each further stage should produce runnable evidence before adding the next layer.

## 1. Establish the evaluation contract

Create synthetic Pi-shaped fixtures before using private sessions. Include:

- A mistaken note corrected by an original tool result.
- A fact that was true earlier but is now stale.
- Repeated summaries of one unsupported claim.
- A useful strategy absent from the latest observable state.
- A question requiring evidence across several sessions.
- A question answered directly by one source, where a wiki adds no value.
- Divergent branches and similarly named projects that must not mix.
- Concurrent edits, missing sources, deletion, and prompt injection inside retrieved text.

Verify expected answers and provenance manually. Keep future-question evaluation separate from consolidation input; retrospective learning must not see held-out answers.

## 2. Inspect Pi and build source search

Read the installed SDK documentation and relevant examples. Map real session events and tool results into the smallest durable representation. Implement explicit search and source opening before automatic injection.

Verify session/branch identity, reconstruction, restart behavior, deletion, and source attribution. No Hermes dependencies.

## 3. Add selective forward notes

Provide deliberate note writing and bounded retrieval with references. Avoid mandatory per-turn summaries. Define source versus derived-record status explicitly.

Verify that useful notes become available immediately, failures do not corrupt existing memory, and irrelevant or cross-project records are not injected.

## 4. Add backward consolidation

Implement one manual, budgeted source-backed pass with transactional revisions and an inspectable change report. Include corrections and demotions, not just additions.

Verify the mistaken-note fixture is corrected from evidence; unsupported claims remain unsupported; malformed outputs do not increase trust; concurrent changes cannot be overwritten silently.

## 5. Evaluate promotion and representations

Compare, using identical source histories and model settings:

A. Source search only.
B. Source search plus forward notes.
C. Source search plus forward notes and backward consolidation.
D. C plus a small promoted index; add a topic wiki only where justified.

Measure future-task correctness, stale/unsupported claims, source attribution accuracy, retrieval omissions, injected tokens, latency, model cost, and maintenance cost. Repeat model-dependent trials and report variation rather than one favorable run.

Adopt a layer only if its measured utility justifies its cost and it passes deterministic isolation, correction, deletion, and provenance tests. Agree numeric performance thresholds before evaluating private real-world tasks.

## 6. Only then consider automation

Choose consolidation triggers and budgets from observed need: corrections, frequently accessed stale information, unresolved gaps, or explicit user requests. A periodic dream loop is an option, not the starting assumption.

## Stop conditions

If Pi cannot expose adequate evidence or branch identity, stop with the missing API contract rather than infer it. If consolidation cannot beat the simpler baseline, retain the baseline and report the result. If privacy boundaries or deletion propagation cannot be enforced, do not enable automatic capture.
