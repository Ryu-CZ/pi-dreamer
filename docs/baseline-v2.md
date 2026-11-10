# Impact-summary baseline v2

## Change and reproduction

Only the impact-table task prompt changed: **“Save it as a file in this workspace, not just as a chat response.”** Historical filename, format and row ordering remain withheld. The historical artifact `artifact-migration` supplies `docs/summary-config-migration.md`, the title and table columns; `ordering-change` supplies oldest-first ordering; `emoji-correction` supplies plain styling. Task input supplies the new batch's items, impacts, follow-ups and landing days.

The filename pattern is inferred from one historical example, not an explicit standing user rule; results measure following that example as required by the existing grader. This is a narrow synthetic evaluation, not general coding performance.

No graders, runner, production extension or historical results were changed. V1 remains a separate diagnostic record; **do not pool these scores with v1**.

```sh
node benchmark/run.js --live --provider openai-codex --model gpt-6.1-sol \
  --thinking-level low --tasks impact-table --modes all --repeats 3 \
  --phase-timeout-ms 120000 --out .local/benchmarks/baseline-v2-impact-r3
```

- Run ID: `2026-11-10T00:12:49.913Z`
- Node `v26.10.0`, Pi `1.5.0`; existing Codex subscription, low reasoning.
- Fixture hash: `700217539cad9fb27ce99927e97d1f9c` (v1: `d84584fda7708fdeddc16f04ce9af8c4`).
- Implementation hash: `369409d678c9811f71062aafefd8d0ae42270e0cc0a91f4cd18676f864a1ef3e`; the fingerprint includes the changed fixture file.
- Full evidence: `.local/benchmarks/baseline-v2-impact-r3/{summary,report}.json`, per-trial `result.json`, workspaces and phase transcripts. These runtime artifacts remain local and Git-ignored.
- Exactly one sweep: 15 requested/completed trials, 15 solve phases and 6 dream phases. No provider switches or retries by the benchmark runner. No phase errors or timeouts; every failure remains in the denominator.

## Results

All values below are per-mode means over three trials. Costs are **Pi-reported pricing estimates in USD, not actual subscription charges**. An absent dream phase adds zero cost/time. All executed phases reported numeric costs in this run.

| Mode | Success | Dream seconds | Solve seconds | Dream estimated $ | Solve estimated $ |
|---|---:|---:|---:|---:|---:|
| none | 0/3 | 0 | 16.27 | 0 | 0.00847 |
| sources | 3/3 | 0 | 15.59 | 0 | 0.01238 |
| forward-notes | 0/3 | 0 | 15.77 | 0 | 0.00881 |
| dreamed-notes | 1/3 | 32.51 | 16.74 | 0.02914 | 0.01187 |
| dreamed-index | 0/3 | 32.81 | 13.71 | 0.02233 | 0.00825 |

Fixed execution order, uncontrolled caching/provider load, independently dreamed memories and three repeats limit interpretation. No significance or general superiority is claimed. Dreaming has **not demonstrated an accuracy advantage over source search**.

## Actual-artifact and transcript audit

All fifteen generated Markdown artifacts were opened and inspected, including files outside the grader's expected directory. Every trial saved a file: the file-versus-chat ambiguity is resolved.

- **None, r1–r3:** root-level filenames; wrong title/columns/order relative to historical conventions. Expected information absence, not an execution failure.
- **Sources, r1–r3:** `docs/summary-region-test-batch.md`, correct title, columns, follow-ups and Monday–Wednesday ordering. Solve transcripts show searches of original sources for `Impact` or `summary`, exposing the original artifact.
- **Forward notes, r1:** correct file location but obsolete impact-first ordering. Retrieval/use of stale guidance, not grader ambiguity.
- **Forward notes, r2–r3:** correct format/order but root-level `region-test-batch-summary.md`. Searches retrieved the ordering correction but did not recover the original artifact path.
- **Dreamed notes, r1:** correct file and content; solve searched original `summary` evidence as well as notes.
- **Dreamed notes, r2–r3:** correct content/order, wrong root-level location.
- **Dreamed index, r1–r3:** correct content/order, wrong root-level location. Each solve read the revised note but made no source-tool call.

All six dream transcripts show source reads and note revision; direct SQLite inspection confirms each Work summary format note reached **version 2 with two history entries**. Every revised note corrected oldest-first ordering, but **none included the historical file path**. The initial forward note also omitted that path. Dreaming repaired one rule without filling this coverage gap; source access remained available but was often unused by the solver.

One dream (`dreamed-index`, r1) also left the no-emoji preference “unconfirmed” despite an available source, illustrating incomplete evidence discovery. Its actual artifact had no emoji, so this did not cause its recorded failure.

The score difference is not proof that dreaming intrinsically harms performance. It identifies a concrete risk: a plausible revised note can appear sufficient while omitting a task-relevant convention. No grader relaxation, retroactive success assignment or extra live sweep was used.

## Completion audit

| Requirement | Concrete evidence |
|---|---|
| Read design and evaluation constraints before changes | README, research, benchmark contract, v1 baseline, fixture, grader, runner and existing tests inspected. |
| Small explicit file-delivery correction; no leaked answers | One sentence in `benchmark/fixtures.js`; regression assertion in `test/benchmark-review.test.js`; historical conventions remain absent from prompt. |
| Offline verification | `npm test`: **43 passed, 0 failed**, log `/tmp/dreamer-v2-tests.log`; `npm run benchmark`: successful 15-trial canned self-check, `/tmp/dreamer-v2-offline.log`. Offline scores are not model evidence. |
| Controlled live sweep | Recorded argv/configuration in report: exact model, low reasoning, five modes, three repeats, 120000ms timeout; fresh output directory; 21 phases total. |
| Artifact-based result and failure diagnosis | All 15 files inspected; memory-tool calls examined across all memory modes; all six revised notes checked directly in stores. |
| Costs, times, hashes and denominators | Above tables and retained reports; no failures dropped; estimates distinguished from billing; v1 not pooled. |
| Preserve production/grader/history and unrelated files | SHA-256 comparison against pre-edit snapshot `/tmp/dreamer-v2-before.json`; only the fixture, review test and benchmark documentation changed among pre-existing files. |
| No scope expansion | No production behavior, global configuration, scheduler, private-data ingestion or provider changes; no additional live sweep. |
| Discoverable report and diff hygiene | Linked from `docs/benchmark.md`; `git diff --check` and local Markdown link checks passed. |

**Next proposed experiment, not implemented:** improve source-backed coverage of conventions omitted from notes, especially artifact location, while preserving corrected rules. Keep v2 fixed as the baseline and obtain approval for the production/prompt change and subsequent live comparison. Do not add automatic promotion merely because the current index is available.
