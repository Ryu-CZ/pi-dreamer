# Frozen-memory retrieval experiment

## Question and decision

Does explicitly asking the solver to inspect a note's cited sources reduce omissions, holding the memory constant?

**No benefit was demonstrated. Do not adopt the new instruction in production on this evidence.** The control succeeded 3/3, treatment 2/3, and source-only reference 3/3. This tiny experiment is descriptive, not evidence that source inspection generally hurts performance.

## Design

`scripts/frozen-retrieval.js` reuses the three `dreamed-notes` SQLite stores from [baseline v2](baseline-v2.md). Their previous solve transcripts were inspected: no memory-tool mutations or ordinary tool writes to the store occurred. Each new trial starts from the fixture scaffold only, never previous generated artifacts or transcripts. Both frozen arms receive byte-identical copies of the corresponding saved memory; SHA-256 values are recorded per exposure. No new dreaming occurs.

The only prompt change is:

> Treat retrieved notes as incomplete guidance. Inspect their cited sources for task-relevant requirements before acting.

Three arms, three repeats each:

1. `frozen-control`: saved memory, unchanged solver prompt.
2. `frozen-verify`: same saved memory, extra instruction above.
3. `sources`: fresh historical sources only, unchanged prompt, contemporary reference.

All use `openai-codex/gpt-6.1-sol`, low reasoning, 120000ms phase timeout, unchanged impact-table v2 fixture and graders. Order is fixed by arm, not randomized; cache/provider conditions remain uncontrolled. Dreamed memories differ between repeat IDs, but each control/treatment pair shares the same memory. No index is preloaded.

## Reproduce

Requires the retained v2 baseline artifacts; these are local and Git-ignored, not distributed with the code. `--from` can point to that archived run elsewhere. The runner rejects a changed fixture hash, obvious uncheckpointed stores, previous memory-tool mutations and nonempty output directories. The ordinary-tool audit is manual, not an enforced sandbox.

```sh
# Canned offline orchestration check; no model-quality evidence.
node scripts/frozen-retrieval.js --out .local/benchmarks/frozen-retrieval-offline-01

# Explicit live opt-in: nine solve phases, no dream phases.
node scripts/frozen-retrieval.js --live \
  --out .local/benchmarks/frozen-retrieval-live-01
```

Use new output directory names on subsequent runs. The helper uses the existing sweep/executor, not a second model backend. Model/settings are intentionally fixed for this bounded experiment. No automatic retries or provider fallback are added.

## Recorded results

Run ID: `2026-11-10T00:41:30.329Z`. Full reports, transcripts and artifacts: `.local/benchmarks/frozen-retrieval-live-01/`. `experiment.json` records source-run identity, snapshot hashes, exact prompt, each exposure's argv and helper script hash. The main implementation hash covers benchmark/src files, not scripts, so retain both fingerprints.

Means over three trials; token counts include provider-reported cache fields via `totalTokens`, not only generated tokens. Costs are Pi pricing estimates, **not actual Codex subscription charges**.

| Arm | Correct | Solve seconds | Reported tokens | Estimated solve USD |
|---|---:|---:|---:|---:|
| Frozen control | 3/3 | 19.18 | 12,471 | 0.01292 |
| Frozen + source verification | 2/3 | 20.92 | 16,595 | 0.01682 |
| Sources only | 3/3 | 17.92 | 13,439 | 0.01441 |

Treatment minus paired control artifact success: repeat 1 = 0, repeat 2 = 0, repeat 3 = -1. Built-in sweep `pairedDifferences` is empty because it expects a `none` arm; the pairing here is by frozen snapshot/repeat ID, not that field.

All nine trials completed without phase errors or timeouts; none were dropped. New dream cost is zero, but generating the reused memories previously incurred the v2 dream cost. These figures isolate retrieval/solve behavior and are **not** an end-to-end amortization result. Source-only does not need that prior consolidation expenditure.

## Inspection and verification

- Opened all nine generated Markdown files. All used the historical directory/name pattern and correct row order. Treatment repeat 3 omitted the `Impact summary` heading; the unchanged grader rejected it. No score was relaxed.
- Treatment made three source-read calls in every solve. Control also accessed sources, through searches or reads. The added instruction therefore increased explicit reading, but did not uniquely enable source access.
- Live exposure audit confirmed byte-identical paired memory hashes and argv identical except trial-local paths and the one instruction. The task prompt was identical.
- Original snapshot hashes remained unchanged after offline and live runs.
- Offline check: nine successful canned trials, zero dream phases, matching memory hashes and prompt-only treatment difference.
- `npm test`: 43 passed, 0 failed; log `/tmp/frozen-retrieval-tests.log`.
- Production code, graders and existing baseline reports were not edited. Changes are the bounded helper and documentation.

## Interpretation and next decision

The unchanged prompt scored 3/3 here versus 1/3 in the original v2 dreamed-notes run, despite reusing those memories. This demonstrates observed run-to-run variability; it does not identify whether sampling, provider conditions or another uncontrolled factor caused it. Do not credit the new instruction with fixing prior failures or combine the old run as its concurrent control.

Keep the existing production behavior. Before further prompt tuning, prioritize an independently specified held-out task with explicit historical conventions and a predeclared comparison, so improvements cannot merely fit this task's grading details. If stronger confidence is required on this task, increase balanced repetitions and control execution order in a separately authorized experiment. Do not spend another sweep trying to manufacture a favorable result.
