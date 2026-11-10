# Benchmark verification

## Delivered

- Visible OpenCode worker on **GLM-5.3-Flash Free**, followed by manager inspection, corrections and independent verification. The pre-existing pane was left open; no global configuration was changed.
- `benchmark/{fixtures,verifiers,executor,sweep,run}.js`: three held-out tasks, five conditions, offline/default mode, explicit live execution, reports and transcripts.
- `test/benchmark.test.js` and `test/benchmark-review.test.js`: deterministic verification of graders, mode exposure, failure accounting, parsing, isolation and repeatability safeguards.
- `npm run benchmark`, README usage, measurement contract and evaluator documentation. No production extension behavior was changed.

## Checks actually run

```sh
npm test
# 42 passed, 0 failed (includes existing store/adapter tests)

npm run benchmark
# Offline positive orchestration self-check; 15 trials, no model calls.
# This is deliberately NOT a memory-quality result.

PI_SDK_ROOT=/home/tom/.pi/agent/install/releases/1.5.0/node_modules/@earendil-works/pi-coding-agent npm run test:pi
# Existing actual-Pi SDK integration smoke still passed.

git diff --check
# passed
```

Manager regression checks include partial/missing usage accounting; exit-zero/no-assistant detection; absolute handling of relative output paths; keeping dream session transcripts outside the task workspace; duplicate/empty selection rejection; explicit task-specified outstanding work; and grading newly computed endpoints rather than banning historical numbers indiscriminately.

## Live results: one task, repeated twice

```sh
node benchmark/run.js --live --provider openai-codex --model gpt-6.1-sol \
  --tasks release-note --modes all --repeats 2 --phase-timeout-ms 120000 \
  --out .local/benchmarks/verified-codex-r2
```

- Run ID: `2026-11-09T11:08:45.102Z`
- Runtime: Node `v26.10.0`, Pi `1.5.0`; reasoning `low`.
- Fixture hash: `12d7a52d5705cc1d7dab23dfecaff461`
- Implementation hash: `caa5473419decfd34bd280bf4fb9456cde120b11389755dea95c3c261944501f`
- Full artifacts: `.local/benchmarks/verified-codex-r2/{report,summary}.json` and per-trial directories (ignored local runtime material).

| Mode | Correct / trials | Mean dream + solve time | Mean estimated cost* |
|---|---:|---:|---:|
| none | 0 / 2 | 19.5 s | $0.0096 |
| sources | 2 / 2 | 20.3 s | $0.0138 |
| forward-notes | 2 / 2 | 21.2 s | $0.0137 |
| dreamed-notes | 2 / 2 | 54.8 s | $0.0411 |
| dreamed-index | 2 / 2 | 52.1 s | $0.0399 |

*Summed Pi-reported pricing estimates, not subscription billing. Times exclude fixture setup/verification. Trials are sequential and cache/provider state is not controlled.

The manager opened **all eight successful release files**, confirming actual Included/Planned sections and correct new changes/outstanding work. All four dreaming trials persisted **version 2 with two history entries**, replacing the obsolete Deferred rule with Planned. These were checked directly in the SQLite stores, not inferred from tool-call success alone.

Both no-memory trials failed to produce the required artifact. There were no execution errors/timeouts in this final ten-trial sweep.

**Interpretation:** historical evidence helped this fixture. There is **no observed accuracy gain from dreaming over source search** here; dreaming added overhead. Two repeats on one small task cannot establish a general ranking or significance. The preference/environment tasks have offline coverage only; their live performance remains unmeasured.

## Failures retained, not hidden

1. `.local/benchmarks/review-baseline-r1`: Pi access to `opencode/glm-5.3-flash-free` returned HTTP 429 (`FreeUsageLimitError`), although the same named free model was available inside OpenCode. The report counted a phase error despite process exit 0. There was no automatic provider fallback.
2. `.local/benchmarks/review-codex-r1`: an ambiguous release task left the outstanding item unspecified. Memory-enabled solvers reasonably chose shell completions from the latest historical artifact, while the grader required config merging. The manager corrected the task to explicitly supply config merging as new input; the historical format remained withheld. Old reports were retained. Their fixture hash differs and their scores must not be combined with the corrected run.

Other review fixes: cost fields no longer turn missing values into zero; exit failures/timeouts stay in denominators; reused directories are rejected; completed trials are saved incrementally; strict JSON grading replaces substring checks for environment output; expected values do not depend on solver-mutable input; source timestamps reflect historical order; preloaded entries carry IDs and an untrusted-data label.

## Scope audit

| Requested capability | Evidence |
|---|---|
| Requested Herdr/OpenCode/free-model collaboration | Worker identified in UI as GLM-5.3-Flash Free; actual created files reviewed and corrected. |
| Repeatable inputs and settings | Fixture and implementation hashes, per-run configuration/runtime, fresh stores/sessions, repeat IDs, nonempty-directory rejection. |
| Task/user/environment knowledge | Three documented fixtures and positive/negative verifier tests; environment applies a rule to a new offset. |
| Compare memory strategies | Five conditions; all exercised in the repeated live release-task run. |
| Grade actual work | Artifact graders plus manager inspection of actual live outputs. |
| Honest failures and costs | Injected error/timeout/unknown-cost tests; real exit-zero provider failure retained; separate dream/solve usage. |
| Support iteration | New output directories, per-trial records, retained transcripts, paired baseline differences, explicit guidance for comparing hashes and configurations. |
| Do not claim unsupported gains | Offline results labelled synthetic; live evidence bounded to one task; no benefit beyond source search claimed. |

This delivers a usable first benchmark, not a complete scientific evaluation. Broader repeated live tasks, stronger isolation, matched dreamed snapshots for preload ablation, and order/cache controls remain future improvements.
