# Repeatable downstream-memory benchmark

Built with the visible OpenCode **GLM-5.3-Flash Free** worker, reviewed and integrated by the manager. See [measurement contract](benchmark-contract.md).

This is a small local evaluation harness, not FrontierMemory compatibility or a claim of general memory improvement. It grades artifacts on later tasks, not an agent's assertion that it remembered something.

## Run

```sh
npm test                         # offline: graders, failure cases, isolation, reporting, CLI
npm run benchmark                # offline: 15 canned successful orchestration trials

# Real, bounded smoke: 1 task × 2 modes × 1 repeat; 3 model phases total.
npm run benchmark -- --live --provider openai-codex --model gpt-6.1-sol \
  --smoke --out .local/benchmarks/smoke-001

# Full comparison: 3 tasks × 5 modes × 3 repeats = 45 trials, 63 model phases.
npm run benchmark -- --live --provider openai-codex --model gpt-6.1-sol \
  --repeats 3 --out .local/benchmarks/full-001
```

Live execution requires `--live`, `--provider`, and `--model`. Choose credentials/models you authorize. The GLM free model worked for the OpenCode worker, but the first Pi `opencode/glm-5.3-flash-free` trial returned HTTP 429 (`FreeUsageLimitError`, stating free models work inside OpenCode). That failed trial was retained; the runner does **not** switch providers or retry automatically. Verified live trials used the existing Codex subscription.

Use a **fresh output directory** for every experiment; nonempty directories are rejected. `.local/` is ignored by this repository. Model responses are stochastic: repetition is essential, and fixed inputs do not guarantee identical outputs.

## Tasks and grading

Fixtures: `benchmark/fixtures.js`. Graders and offline example outputs: `benchmark/verifiers.js`. Graders and expected outputs are never passed to the solving model.

| Task | Historical knowledge | New work and graded artifact |
|---|---|---|
| `release-note` | Release file layout; `Deferred` was renamed to `Planned` | Release 1.2 with new changes. `docs/releases/1.2.md` must use the historical title/sections, describe the supplied JSON-output and empty-argument fixes, and place **task-specified** outstanding config merging under Planned. |
| `impact-table` | Table columns, plain style, ordering changed from impact to landing date | New region batch. A `docs/summary-*.md` file must have an Impact summary title, Change/Impact/Next table, correct impacts and follow-ups, rows in Monday–Wednesday order, no emoji. Exact topic filename suffix is not enforced. |
| `local-endpoints` | Authoritative base port and environment rule; cache/config paths | Apply the rule to a new workspace offset. `connector/run/local.json` must parse and contain the explicitly requested keys `metricsEndpoint`, `buildCache`, `configDir` with correct values. Expected offset comes from the immutable fixture, not solver-modified files. |

The impact-table grader requires exactly three data rows with three cells each. Each Change cell must identify exactly one supplied item, and each item must appear once; mentions in Impact or Next do not establish identity. Extra, duplicate, ambiguous, and malformed rows fail. This corrects earlier false positives without changing fixtures or prompts. Prior reports retain their original implementation fingerprints and scores; they have not been rescored and must not be treated as results from the corrected grader.

Forward notes are intentionally stale or partial; later captured evidence supports correction. Histories include unrelated material. The held-out inputs differ from past examples. History establishes conventions, while the task supplies its new work items. Markdown graders use deterministic structural/content checks—not complete natural-language semantic understanding. Tests exercise valid variants and wrong/missing artifacts, but these graders are not adversarial-proof.

## Five conditions

| Mode | Initial memory | Separate `/dream` phase | Preload |
|---|---|---|---|
| `none` | None | No | No |
| `sources` | Captured historical sources | No | No |
| `forward-notes` | Sources + stale forward notes | No | No |
| `dreamed-notes` | Same starting sources + notes | Yes | No |
| `dreamed-index` | Same starting sources + notes | Yes | Small deterministic index of post-dream notes |

All modes use the same task prompt, task tools, model and reasoning setting. The extension is loaded even for `none`, but that mode starts without historical memory. Dreaming gets only the topic and memory tools—not the held-out task prompt or ordinary workspace tools.

The index is a **benchmark-only simulation**, not production promotion. It selects notes by the topic's first word, keeps at most ten results (the store's default search limit), and uses 120-character text previews with note IDs/versions. It is labelled untrusted and supplied through `--append-system-prompt`. Titles/metadata are not fully token-budgeted. No learning-based promotion policy is claimed.

Each trial has fresh project/store/session state. Dream and solve sessions are separate; session transcripts live **outside** the solver's workspace so normal workspace browsing cannot reveal the dream transcript. The model still has ordinary local tools: this is a cooperative evaluation, **not a filesystem sandbox**.

## Flags

```text
--live                        Explicit real-model execution
--provider NAME --model ID    Required in live mode
--tasks all|CSV                release-note,impact-table,local-endpoints
--modes all|CSV                none,sources,forward-notes,dreamed-notes,dreamed-index
--repeats N                    1..20; default 3 live, 1 offline/smoke
--out PATH                     Fresh output directory; temporary default
--phase-timeout-ms N           Integer >=1000; default 300000
--thinking-level LEVEL        Passed to Pi for both phases; default low
--smoke                       release-note; none and dreamed-notes; default 1 repeat
```

`PI_BIN` overrides the Pi executable. `--smoke` overrides task/mode selections. Empty, duplicate and unknown selections are rejected. No implicit retries or scheduled runs.

## Reports and iteration

- `summary.json`: run ID, Node/Pi versions, fixture/implementation hashes, configuration, success counts/rates by mode/task, paired binary differences against `none` for matching task/repeat IDs.
- `report.json`: full configuration and all trial records.
- `trials/<task>-<mode>-r<N>/result.json`: saved after each finished trial, preserving progress if a later trial is interrupted.
- Each trial retains its workspace, phase transcripts and session files for review.
- Phase records include CLI arguments, session ID, elapsed milliseconds, usage/cost, errors, sampled tool calls and last assistant text. Full tool output remains in transcripts.

Both dream and solve costs are recorded. Total cost is summed only when every executed phase reports numeric cost; an unrun dream phase adds no cost. Missing per-call usage makes the affected phase total unknown (`null`), not silently partial. **Pi's cost fields are estimates based on its model pricing metadata, not proof of an actual bill**, especially for subscriptions/free models.

Every requested trial remains in the denominator, including provider errors, timeouts and orchestration failures. A model failure reported inside an exit-0 process still counts as `phase-error`. An exit-0 process with no assistant messages is also an execution failure. Live CLI exit 0 means the sweep produced its report, not that the tasks passed; inspect outcomes. Offline self-check exits nonzero if its canned positive orchestration trials fail. Negative grader tests are in `npm test`.

To iterate: retain the baseline report, change one component, rerun the same task/mode/repeat configuration in a new directory, and compare hashes/configuration before interpreting score changes. Changed fixture hashes mean changed tasks; changed implementation hashes may include grader changes, so inspect those before attributing any gain to memory.

## Verified run

See [benchmark verification](benchmark-verification.md) for the first repeated live results and [initial baseline](baseline-v1.md) for the subsequent 30-trial run covering the other two tasks. The summary task exposed a file-versus-chat delivery ambiguity; its unchanged scores are retained as diagnostic evidence, not a clean memory-quality comparison. [Impact-summary baseline v2](baseline-v2.md) explicitly requires saving a file and reports a separate 15-trial sweep with unchanged graders. It resolves delivery ambiguity while exposing omitted file-location guidance in notes. The subsequent [frozen-memory retrieval experiment](frozen-retrieval-experiment.md) isolates a source-verification prompt change using identical paired memories; it showed no benefit in nine live trials, so the instruction was not adopted in production.

## Limits

Three small tasks and two or three repeats cannot establish significance or general superiority. Dreamed conditions perform independent dreaming runs, so their memories are not identical snapshots; the preload comparison is not a clean single-variable ablation. Execution order is fixed, so cache warming/provider load can affect cost and timing. Forward notes are authored fixtures, not a measured online capture policy. No cross-model generalization, strong sandboxing, or production automatic context injection is claimed.
