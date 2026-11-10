# Initial baseline (v1)

Model: `openai-codex/gpt-6.1-sol`, reasoning `low`. No benchmark code, fixtures or graders changed between the two runs. This is a small descriptive baseline, not a statistically established model ranking.

## Reproduction and identity

Earlier release run: `.local/benchmarks/verified-codex-r2` (two repeats per mode; see [verification](benchmark-verification.md)).

Remaining-task run:

```sh
node benchmark/run.js --live --provider openai-codex --model gpt-6.1-sol \
  --thinking-level low --tasks impact-table,local-endpoints --modes all \
  --repeats 3 --phase-timeout-ms 120000 \
  --out .local/benchmarks/baseline-remaining-r3
```

- Run ID: `2026-11-09T18:09:12.966Z`
- Node `v26.10.0`; Pi `1.5.0`.
- Implementation hash, shared with the release run: `caa5473419decfd34bd280bf4fb9456cde120b11389755dea95c3c261944501f`.
- Impact fixture: `d84584fda7708fdeddc16f04ce9af8c4`.
- Environment fixture: `3a26c5d6f18e078e970e6f2a26952db2`.
- Full reports/transcripts and actual workspaces remain under the output directories. These local runtime files are Git-ignored.

## Artifact success

| Task | None | Sources | Forward notes | Dreamed notes | Dreamed index |
|---|---:|---:|---:|---:|---:|
| Release (earlier run) | 0/2 | 2/2 | 2/2 | 2/2 | 2/2 |
| Environment | 0/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| Impact summary — diagnostic only | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 |

All 30 new trials completed with no phase errors or timeouts. All failures were artifact-verifier failures, and remain in the reported denominators. The manager directly opened all 12 successful environment artifacts: each contained exactly the three requested fields, endpoint `http://127.0.0.1:9156/metrics`, cache `/var/cache/pigeon/build`, and config `/etc/pigeon/conf`.

## Summary-task ambiguity

Fourteen of fifteen impact-summary trials failed because no `docs/summary-*.md` file was created. One forward-note trial created a file but retained obsolete impact-based ordering. Inspection of the first repeat in each mode showed that sources and both dreamed conditions returned appropriately ordered tables **in chat**, not as files; forward notes retained stale ordering.

The task said “Write the batch summary the way irisbot summaries are kept.” History illustrated a saved file, but the task did not explicitly require saving an artifact. Thus these zeros conflate response-delivery interpretation with memory quality. They are retained unchanged, not regraded as successes, and should not support claims that memory failed to recover the conventions.

Before treating this task as a clean quality baseline, create a new fixture version explicitly requiring a file in the workspace, without giving away historical format or ordering. Rerun all conditions under that new hash; do not merge its scores with this version.

## Cost-effectiveness observations

Mean elapsed dream + solve seconds for the environment task:

| None | Sources | Forward notes | Dreamed notes | Dreamed index |
|---:|---:|---:|---:|---:|
| 21.3 | 16.1 | 17.1 | 58.1 | 60.6 |

Per-phase token usage and estimated cost are retained in `report.json`. These are Pi pricing estimates, not actual subscription billing. Timing is descriptive: provider load and cache state are uncontrolled.

On the two tasks with interpretable artifact results, source search matched the accuracy of dreaming at substantially lower latency. There is still **no demonstrated incremental accuracy benefit from dreaming**. The summary responses suggest correction may help stale notes, but the current artifact metric cannot establish that benefit.

Use this as the frozen initial baseline and diagnostic record. Next: repair the summary task's delivery ambiguity in a new version, then add a harder held-out task only if needed to distinguish consolidation from retrieval. Keep model/settings fixed while changing one component at a time.
