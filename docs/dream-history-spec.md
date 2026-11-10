# `/dream-history` — proposed specification

**Status: proposal. Not implemented.** This document defines a possible second dreaming command, distinct from `/dream`. It records design decisions and open questions so implementation can proceed without re-litigating the evidence boundary.

Related documents:

- [Research interpretation](research.md)
- [Proposed design](design.md)
- [Implementation and evaluation plan](plan.md)
- [First working prototype contract](prototype-contract.md)
- [Architecture fragments](architecture.html)

Diagrams below are textual sketches of **proposed** behavior. Nothing in this document should be read as implemented.

---

## 1. Summary

`/dream-history <duration|inf>` spends a bounded amount of backward-consolidation effort on **archived Pi session transcripts** for the current project.

It exists because `/dream` can only inspect evidence that someone explicitly captured into the project store. The research describes dreaming as a backward pass over original logs and transcripts, using them to test and correct memory. `/dream-history` widens that evidence boundary without turning the system into bulk transcript ingestion.

Execution uses configurable model roles. **Any model Pi supports may be selected** — local llama.cpp, a paid hosted provider, or another configured provider. Nothing in this command requires the local stack observed on this machine.

It is **not**:

- a forward replay or re-enactment of an old conversation;
- an automatic importer of every message;
- a replacement for `/dream`;
- a scheduler or background job.

```text
/dream <topic>                  /dream-history 5m
      |                                |
      v                                v
captured sources + notes       archived sessions + captured sources
      |                                |
      +----------+---------------------+
                 v
        backward consolidation
        (inspect, capture cited evidence,
         revise notes with reason + source)
                 v
        project memory + audit trail
```

---

## 2. Relationship to the research

The primary source is Anthropic's *Components of agent memory*. Relevant reported behavior:

- Agents capture work in logs or transcripts, and dreaming can reflect on those logs to fix mistakes or produce new representations.
- Dreaming can test a note against the original transcript. The Mt. Moon example describes Claude checking a wrong note against the session transcript and rewriting it.
- Transcript search is described as a reasonable foundation for memory; representations should supplement search, not replace it.
- The article leaves open when dreaming should run and how often memories should be rechecked.

This specification follows those observations as a **backward** activity. It does not claim that replaying an old session forward would recover the original agent's moment-to-moment salience.

See [research.md](research.md) for the project's interpretation and qualifications.

---

## 3. Command interface

```text
/dream-history <duration>
/dream-history <seconds>
/dream-history inf
```

Examples:

```text
/dream-history 5m
/dream-history 300
/dream-history 90s
/dream-history inf
```

Proposed optional flags:

```text
--topic <text>              Focus the pass on a topic without changing the time budget
--rank[=<model>]            Optional heuristic ranking; uses the configured decision model by default
--branch=active|all         Default: active; "all" is explicit and still preserves lineage
--dry-run                   Inspect and report; do not write
--model <provider>/<id>     Override the consolidation model for this run
--local-only                Refuse any non-local provider
```

Rules:

- `duration` is required.
- Accept `30s`, `5m`, `2h`, or bare seconds.
- `inf` is explicit and requires confirmation the first time it is used.
- Unknown flags and malformed durations are rejected before any model call or write.
- `/dream-history` never runs automatically.
- The consolidation model may be any model exposed by Pi's model registry. The command does not require a local model.
- A run must report the resolved provider/model and whether the selected provider is local or remote.

---

## 4. Budget semantics

The budget is **wall-clock time**, because that is the user-facing unit. The execution model may be local or remote; the resolved model, provider, and locality are recorded and reported. The budget is a soft target with hard stops.

```text
command starts
  |
  +-- validate -> select work -> capture cursor
  |
  +-- loop:
  |      process one bounded window
  |      check deadline between windows
  |      if deadline passed: stop launching new work
  |
  +-- watchdog: ctx.abort() as a last-resort hard stop
  |
  +-- record run + report progress
```

Requirements:

1. The budget clock starts after the model is ready. If the selected provider lazy-loads models, cold-start/model-load time is reported separately.
2. Work is processed in windows so the deadline is checked between coherent units.
3. A watchdog may call `ctx.abort()` if a window overruns badly; incomplete tool transactions are rolled back by the store.
4. Independent safety caps always apply, regardless of the time budget:
   - maximum entries processed per run,
   - maximum model calls,
   - maximum revisions per note per run,
   - maximum consecutive errors,
   - maximum captured sources per run.
5. `inf` means **no wall-clock deadline**, not unlimited work:
   - stop when no unprocessed eligible entries remain;
   - stop at a safety cap;
   - stop on user abort;
   - confirm explicitly before starting.
6. Repeated short runs must resume from a cursor, not restart.
7. A run that finds nothing worth changing must be allowed to end with “no changes.”

Suggested defaults (to be confirmed during implementation):

| Setting | Proposed value |
|---|---|
| Default if argument omitted | Reject; show usage |
| `inf` confirmation | Required |
| Max entries per run | 200 |
| Max model calls per run | 40 |
| Max revisions per note per run | 1 |
| Max consecutive errors | 3 |

---

## 5. Scope and evidence access

### 5.1 Project scope

- Default: current canonical `cwd` only.
- Session discovery uses `SessionManager.list(ctx.cwd)`.
- Opening a session uses `SessionManager.open(path)`.
- No custom JSONL parser.
- Cross-project history is out of scope for this specification. If added later, it requires an explicit flag and confirmation.

### 5.2 Branch scope

Archived sessions are trees. One session in this repository has 61 leaves.

- Default: the archived session's **active branch** (`getBranch()`).
- `--branch=all`: allowed, but every imported entry records `branchLeafId` and `isActiveBranch`.
- Abandoned branches are never silently merged with active evidence.
- Sibling-branch entries cannot be captured as if they were on the active path.

### 5.3 Eligible entries

Same text-only policy as the current prototype:

- entry `type` must be `message`;
- roles: `user`, `assistant`, `toolResult`;
- only `text` content blocks;
- exclude thinking, images, tool-call arguments, and tool-call details;
- exclude `dreamer_*` tool results to prevent recursive evidence;
- exclude system messages, custom entries, branch summaries, and compaction summaries.

### 5.4 Raw history versus model-visible context

- Use raw entries (`getEntries` / `getBranch`), not `buildSessionContext`.
- Skip compaction summaries as evidence.
- A `context_edit` changes only model context; it does not rewrite what was recorded. Raw text remains the evidence.
- This distinction must be stated in the tool description and in the run report.

### 5.5 No whole-transcript prompt stuffing

Do not inject an entire session into the prompt. Provide a bounded archive access tool and let the agent inspect evidence on demand. This keeps token use bounded and follows the “search remains foundational” finding.

---

## 6. Archive tool surface

Proposed companion tool, available to `/dream-history` but not a replacement for the current source tools:

```text
dreamer_archive
  sessions                          list current project's archived sessions
  entries  sessionId, [allBranches] list eligible message previews
  search   query, [sessionId]       lexical search in archived text
  read     sessionId, entryId       full text of one archived entry
  capture  sessionId, entryId       explicitly copy one entry into sources
```

Bounds mirror the existing tools:

- previews are truncated, full text requires `read`;
- result counts are capped;
- `capture` is explicit and never automatic;
- archived text is returned as untrusted data, not instructions.

`/dream-history` may use archive tools, while `/dream` continues to rely only on captured sources and notes.

---

## 7. Selection and work loop

With no session argument, selection must be deterministic by default.

Proposed policy:

1. Consider only sessions for the current project.
2. Exclude sessions with no eligible entries.
3. Prefer sessions with entries not yet processed by a history cursor.
4. Among those, prefer least-recently-dreamed, then oldest.
5. Within a session, process a bounded chronological window on the active branch.
6. Record a cursor after each completed window: `(sessionId, branchLeafId, lastEntryId)`.
7. On the next invocation, continue after the cursor.

```text
sessions, newest history first
   |
   +-- cursor complete? skip
   +-- no new eligible entries? skip
   +-- select next window
          |
          v
   inspect -> capture cited evidence -> revise/create notes
          |
          v
   record cursor -> check deadline -> next?
```

Optional `--rank` may reorder candidates using the configured decision model. A specific model may be supplied with `--rank=<provider>/<model>`. This is a heuristic only:

- it never replaces the deterministic cursor policy as the default;
- it never counts as verification of a claim;
- its scores and inputs are not persisted as truth.

---

## 8. What the pass may change

Allowed:

- capture an archived entry as a source, with origin provenance;
- create a note linked to captured sources;
- revise a note using `expectedVersion`, `reason`, and `sourceIds`;
- leave contradictions unresolved when the evidence does not settle them;
- report that nothing changed.

Not allowed:

- automatic truth verification;
- automatic deletion of notes or sources;
- automatic promotion or context injection;
- wiki, graph, or embedding construction;
- modifying the archived session files;
- re-executing archived tool calls;
- writing outside the current project store.

The existing store rules remain in force:

- stale version writes are rejected;
- source deletion propagates to dependent notes;
- notes retain correction history;
- attribution proves provenance, not truth.

To reduce oscillation, limit each note to at most one revision per history run unless a later source in the same run clearly supersedes the earlier revision.

---

## 9. Provenance and persistence

### 9.1 New source provenance

Archive-derived sources must record both identities:

```text
originSessionId     archived session id
originEntryId       archived entry id
originSessionFile   archive path, for verification and purge
branchLeafId        branch leaf at capture time
isActiveBranch      whether the branch was active
capturedAt          when the project store imported it
```

Existing `sources.timestamp` remains the **event** timestamp. The captured-at time is separate.

Proposed uniqueness:

```text
UNIQUE(originSessionId, originEntryId)
```

so re-running history processing does not duplicate the same archived entry.

The existing `UNIQUE(sessionId, entryId)` remains for non-archive captures. A small schema-version/migration mechanism is required before adding these columns.

### 9.2 Run and cursor state

```text
history_runs(
  id, startedAt, endedAt, budgetMs, status,
  provider, model, quantization, paramsJson,
  entriesProcessed, sourcesCaptured, notesCreated, notesRevised
)

history_cursors(
  sessionId, branchLeafId, lastEntryId, updatedAt,
  PRIMARY KEY(sessionId, branchLeafId)
)
```

`paramsJson` records temperature, top-p, seed, context size, thinking budget, and any other settings that affect reproducibility.

### 9.3 Time semantics

- Event time: when the archived message occurred.
- Capture time: when the project store imported the evidence.
- Run time: when the history pass executed.
- Revision time: when a note was corrected.

These must remain distinguishable in reports and storage.

---

## 10. Trust and safety boundaries

Archived transcripts are **data**, not instructions.

- A user message, tool result, or assistant text from the archive must not gain the authority of a current instruction.
- Prompt-injection text in archived content must be presented as untrusted evidence.
- The pass must not reconstruct archived messages as live user/assistant turns in the current conversation.
- The pass must not re-run archived tool calls.
- Only `dreamer_source`, `dreamer_archive`, and `dreamer_note` are needed. No bash, edit, write, or network tools.

Provider boundaries:

- `/dream-history` uses the resolved model roles; it must not switch providers implicitly.
- If `localOnly` is enabled, fail closed when any required role resolves to a non-local provider or when the provider is unavailable.
- No silent fallback between providers, whether local to remote, remote to local, paid to free, or vice versa.
- If a remote or paid provider is selected, the command must disclose that selected transcripts and evidence are sent to that provider, consistent with the existing `/dream` disclosure.
- Model, provider, locality, and parameters must be visible in the command output and stored in the run record.

Decision-model limits:

- The configured decision model may prioritize work, not verify claims.
- A classifier approval is not evidence.
- Any classifier-derived ordering is recorded as heuristic.

Deletion:

- If the archived session file is deleted, imported sources must not silently remain indefinitely.
- Add a `verify`/`purge` path that checks `originSessionFile` existence and removes or invalidates dependent memory according to the project's deletion policy.
- Preserving history is not permission to retain deleted private data.

---

## 11. Model configuration

Model choice is a configuration decision, not part of the command semantics. `/dream-history` resolves models through Pi's existing model registry and provider configuration. It must not introduce a separate API-key path, provider list, or credential store.

**Any model Pi supports may be selected**, including local llama.cpp models, paid hosted models, free hosted models, and classifiers.

### 11.1 Roles

| Role | Required | Purpose | Examples |
|---|---|---|---|
| `consolidation` | Yes | Read evidence and draft revisions/notes | Any tool-capable Pi chat model: local or hosted |
| `decision` | No | Optional ranking/triage for `--rank` | Any Pi classifier: local or hosted |
| `embedding` | No | Future semantic retrieval | Deferred |

A single model may fill more than one role. The decision model never substitutes for the consolidation model, and neither role implies a particular vendor.

### 11.2 Selection and precedence

1. Explicit command override: `--model` for consolidation, `--rank=<model>` for decision.
2. Project configuration: `dreamer.history.models.*`.
3. Pi's current session model for consolidation, if no override is configured.
4. No default decision model: deterministic cursor selection is used unless `--rank` or a configured decision model is present.
5. No default embedding model: lexical search remains the baseline.

Model identifiers use Pi's `<provider>/<model>` form. Credentials and provider endpoints remain in Pi's own configuration.

### 11.3 Proposed configuration shape

```json
{
  "dreamer": {
    "history": {
      "models": {
        "consolidation": "llama.cpp/Qwen3.8-27B-Q4_K_M",
        "decision": "llama.cpp/Kev-4B-Artemis"
      },
      "execution": {
        "localOnly": false,
        "allowProviderFallback": false,
        "idleOnly": true,
        "maxConcurrency": 1
      },
      "params": {
        "temperature": 0.2,
        "seed": 3407,
        "maxTokens": 4096
      }
    }
  }
}
```

A paid provider is equally valid:

```json
"consolidation": "openai-codex/gpt-6.1-sol"
```

The config names above are illustrative; the implementation should fit the project's existing configuration conventions rather than creating a parallel settings system.

### 11.4 Parameter recording

Every run records the resolved values, not the requested ones:

- provider and model id;
- local or remote classification;
- model parameters that affect output: temperature, top-p, seed, max tokens, thinking/reasoning budget;
- context size and quantization when the provider exposes them;
- whether a cold load occurred.

Consolidation should use a low-variance profile where the provider supports it. The command must not silently inherit a high-temperature generation profile without recording it.

### 11.5 Example local profile (non-normative)

One observed environment on this machine:

- llama.cpp router at `127.0.0.1:7484`;
- `Qwen3.8-27B` variants, including `Qwen3.8-27B-Q4_K_M` with a large context window;
- `Kev-4B-Artemis` as a local decision/classifier model;
- `Qwen3-Embedding-8B` available;
- single-slot inference for the main model (`parallel 1`).

This is an example, not a requirement. It implies some useful defaults:

1. Prefer single-flight and idle-aware execution when the provider has limited concurrency.
2. Report cold model load separately from the budget.
3. Use a lower-temperature profile for consolidation.
4. Keep embeddings deferred until lexical archive search is measured.
5. The report should expose provider, model, locality, and parameters for any provider, not only local ones.

---

## 12. Reporting

Every run ends with a concise report:

```text
Processed: 4 windows across 3 sessions
Captured: 6 sources
Created: 1 note
Revised: 2 notes (1 correction, 1 demotion)
Unresolved: 1 contradiction
Skipped: 1 compaction summary, 2 sibling branches
Remaining: ~12 sessions with new history
Model: <provider>/<model> (local|remote; temp ..., seed ...)
Budget: 5m elapsed, 37s in model load
Status: stopped at deadline
```

The model line reports the resolved role, not a hardcoded model. The values above are illustrative; a paid provider or a different local model is equally valid.

The report must distinguish:

- work completed versus work remaining;
- evidence inspected versus evidence captured;
- claims corrected versus claims left unresolved;
- model time versus cold-start time.

---

## 13. Acceptance criteria

Deterministic tests should cover:

1. Duration parsing: `5m`, `300`, `90s`, malformed input, `inf` confirmation.
2. Current-project isolation: another project's sessions are invisible.
3. Active-branch default: sibling branches are not selected or captured.
4. `--branch=all` records branch lineage and never merges branches.
5. Compaction summaries and `context_edit` replacements are skipped as evidence.
6. Text-only capture: no thinking, images, tool-call arguments, or dreamer results.
7. Origin provenance: `originSessionId` / `originEntryId` survive capture.
8. Idempotency: re-running the same window creates no duplicate sources.
9. Cursor resume: a second short run continues where the first stopped.
10. Deadline: no new window starts after the budget expires; incomplete work is not reported as complete.
11. `inf` terminates on exhaustion or safety cap, not forever.
12. Provider fail-closed: an unavailable provider produces an error with no implicit fallback.
13. `--local-only` refuses a non-local provider and never silently substitutes a local one.
14. Model resolution precedence: command override, project config, then current session model.
15. Any Pi-supported model id is accepted for the consolidation role; no local-only hardcoding.
16. A remote/paid selection is disclosed and recorded as remote in the run report.
17. Existing stale-write and missing-source rejections still apply.
18. Deletion verification/purge behavior for removed session files.
19. No automatic capture, no automatic promotion, no automatic deletion.

Model-dependent evaluation should:

- use identical archived histories and model settings across trials;
- record variance rather than one favorable run;
- separate deterministic plumbing tests from memory-quality measurements;
- compare against `/dream` and source search alone.

---

## 14. Non-goals and deferred work

Out of scope for this specification:

- forward replay or re-enactment of archived sessions;
- automatic transcript ingestion;
- automatic context injection or promotion;
- wiki, graph, or embedding representations;
- background scheduling or daemon jobs;
- cross-project or global memory;
- implicit or silent remote processing of private transcripts (explicit user-selected remote/paid providers are allowed);
- re-executing archived tools;
- automatic truth verification by a model or classifier.

Forward replay remains a separate experiment. If pursued, it must be labeled a simulation and must not be conflated with the reported dreaming behavior in the research.

---

## 15. Open questions

1. Should the budget be required, or default to a small finite value?
2. What are the right safety caps for entries, model calls, and sources?
3. Is one revision per note per run the correct anti-oscillation rule?
4. Should `--topic` be part of the first version or deferred?
5. Which archived-session deletion policy is acceptable: invalidate, purge, or require explicit cleanup?
6. Should `--branch=all` exist at all in the first version?
7. Should the configured decision model rank sessions, entries, or both?
8. Is wall-clock the right user unit, with tokens/entries as internal caps, or should tokens be exposed too?
9. Does `/dream-history` reuse the `/dream` prompt or need a separate prompt with explicit raw-history framing?
10. How should duplicate or near-duplicate notes created across history runs be detected without adding a new representation layer?
11. Should model roles live in project configuration, Pi settings, or both?
12. Should the run report distinguish local/remote per model role or only for consolidation?

---

## 16. Proposed implementation order

No code is part of this document. When implementation begins:

1. Add archive read/search/read/capture access with provenance columns.
2. Add run and cursor records with a minimal schema migration.
3. Implement `/dream-history <duration>` using the deterministic cursor and finite budget.
4. Add `inf`, safety caps, and the progress report.
5. Add configurable model-role resolution through Pi's model registry, explicit provider selection and disclosure, fail-closed behavior, and model-parameter recording.
6. Add deletion verification/purge.
7. Add model-dependent evaluation and requirement-to-test mapping in `docs/prototype-verification.md`.

Each step should produce a runnable artifact and evidence before the next layer is added.
