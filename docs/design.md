# pi-dreamer — proposed design

Status: broader design proposal. A deliberately smaller first prototype is implemented; its exact scope is in [the contract](prototype-contract.md) and [verification](prototype-verification.md). Promoted context, wikis, archived-session ingestion, and automatic processing below remain proposals. The behavioral model follows the research; mechanisms are local engineering choices.

## Three activities, two temporal perspectives

```text
                   FORWARD: while doing the task
Pi interaction ──► retained source experience
       └─────────► selective immediate notes
                             │
                   BACKWARD: after experience
sources + notes + goal ──► inspect / correct / connect / reorganize
                             │
                    versioned representations
                             │
                   NEXT TASK: look forward again
            small index + relevant notes + source search
```

Backward processing improves what the next forward session can see. It must not erase the evidence that made correction possible.

## Logical layers, not mandatory services

1. **Source experience:** references to original messages, tool results, and artifacts, preserving session/branch identity and event order. Retention, redaction, and deletion are explicit; do not collect secrets merely because they appeared in a transcript.
2. **Working notes:** useful goals, plans, decisions, discoveries, and hypotheses captured during work. Immediately retrievable; clearly attributable.
3. **Derived representations:** corrected notes, topic pages, navigation indexes, and reusable procedures, each linked to sources. Build only representations useful to actual tasks.
4. **Promoted context:** a small, scoped index and especially useful notes. Other detail stays searchable.

A single local store may implement all four. Search indexes are derived and rebuildable. SQLite plus text artifacts is a candidate, not a research requirement.

## Forward path

- Capture source references through verified Pi integration points, keeping branch and project boundaries.
- Let the agent write salient notes without interrupting every interaction for bookkeeping.
- Distinguish user assertions, observed tool outcomes, agent hypotheses, and inferred lessons.
- Retrieve relevant prior knowledge for the current request; allow explicit source search when an excerpt is insufficient.
- Do not equate retrieval relevance with factual certainty.

## Backward path

Start with an explicitly invoked, bounded consolidation pass, not a scheduler.

1. Select sources and notes around a task, goal, correction, or knowledge gap.
2. Inspect the original evidence, including context around relevant events.
3. Propose corrections, merges, links, new representations, or retirement of stale material.
4. Attach source references and reasons to changes. Preserve unresolved contradictions rather than inventing a resolution.
5. Apply changes as a versioned transaction against the version inspected; stale concurrent proposals must be retried or rejected.
6. Update derived indexes and dependent representations; record what changed and why.
7. Evaluate whether the changed representation improves a held-out future task.

Do not treat an LLM approval as external verification. Parse failures must not become successful checks. Generated notes must retain their derived status even if later consolidated again.

## Time and correction semantics

Record when an event occurred separately from when a note was written or revised. A current observation may supersede an older state claim without making the older observation historically false.

A decision can be authoritative about what was chosen then, yet obsolete for what should be done now. A procedure that passed one test carries that test’s scope, not universal correctness.

Maintain supersession links and provenance across derived records. Source deletion must remove or invalidate dependent content where necessary; preserving history is not permission to retain deleted private data indefinitely.

## Pi-specific boundaries

Before implementation, verify native session persistence, branch semantics, lifecycle event payloads, compaction behavior, extension storage, and tool registration in installed Pi documentation.

- Never merge divergent session branches silently.
- Do not confuse compaction with durable cross-session memory.
- Tool outcomes must remain distinguishable from an assistant’s description of them.
- Injection is untrusted contextual data, not a new source of system instructions.
- Project isolation is the default; cross-project personal memory requires explicit scope.
- No implicit remote processing of private transcripts.

## Decisions deliberately deferred

Exact tool API, schema, embedding model, token budgets, consolidation model, scheduling policy, and wiki format. Select them using evaluation rather than architecture by accumulation.

A separate proposal covers bounded, manually invoked backward consolidation over archived session transcripts: see [`/dream-history` specification](dream-history-spec.md). It is not implemented and does not change the boundaries in this document.
