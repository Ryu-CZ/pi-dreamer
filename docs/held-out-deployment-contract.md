# Held-out deployment evaluation — proposed contract

Status: **proposal for supervisor review; not implemented or authorized for live execution**. This specifies a small representation experiment, not a forward-capture policy or production feature. It extends the [measurement contract](benchmark-contract.md), following the forward/backward distinction in [research](research.md).

## Question and boundaries

Can history-only backward consolidation improve a future deployment artifact and its evidence attribution, compared with source search and the same authored notes without consolidation? Does any improvement justify its upfront cost? A separate direct-source diagnostic checks whether consolidation adds cost where search already suffices.

All requirements below are synthetic project conventions, explicitly stated in history or task inputs. Do not infer real deployment best practices. Source search remains available in every arm. No production prompt, injection, capture policy, scheduler, backend, or external memory integration changes.

## Historical packet (freeze before execution)

One synthetic project, `rook`; three sequential sessions, one branch each, no private transcripts. Logical IDs below become literal labels in source text, accompanied by original session/entry IDs, role, timestamp and tool identity. A retained mapping relates these labels to store-assigned IDs; generated UUIDs are not the stable grading identity.

| Logical ID / session | Role | Exact substantive evidence to encode |
|---|---|---|
| R1 / rook-1 | user | Deployment artifacts are `deploy/<service>.json`, containing exactly service, replicas, metricsEndpoint, imagePolicy. A separate `deploy/evidence.json` maps each service and historical field to supporting logical source IDs. |
| R2 / rook-1 | user | For rook deployments use replicas=2 and imagePolicy=`tag`. This is the current decision. |
| R3 / rook-1 | successful bash result | Environment inspection: metrics base port=9400; metrics endpoints use `http://127.0.0.1:<base+offset>/metrics`; registry=`registry.rook.invalid`. This is an observation of this environment, not a universal service rule. |
| R4 / rook-2 | assistant | Suggestion only: perhaps change replicas to 5 for all services; not approved or tested. |
| R5 / rook-2 | user | Supersedes only R2's imagePolicy decision: use imagePolicy=`digest` for future deployments; replicas remains 2. |
| R6 / rook-2 | successful bash result | After the environment upgrade, metrics base port=9460; endpoint construction is unchanged. R3 remains a valid record of the earlier environment, not the current base. Registry remains `registry.rook.invalid`. |
| R7 / rook-3 | user | For every service whose name starts `worker-`, replicas=1 overrides the default 2. Other services keep 2. |
| R8 / rook-3 | user | Docs preview uses port 3000. This is unrelated to deployment metrics. |

Chronology is explicit in timestamps and text; do not infer authority from timestamps alone. User decisions govern project policy; successful environment observations establish observed state. R4 is neither. An unresolved contradiction would require abstention/escalation, not an invented resolution; this packet deliberately has explicit supersession rather than an unresolved conflict. Testing unresolved conflicts is outside this unit.

### Authored notes

Freeze these as authored representations, not measured agent capture:

1. Deployment files and evidence layout, faithfully citing R1.
2. Default replicas=2 and imagePolicy=tag as of session 1, citing R2. A historically sound note that later becomes partly stale, not a fabricated false memory.
3. Metrics construction and base=9400 as observed in session 1, citing R3.
4. Registry=`registry.rook.invalid`, citing R3; this stays useful and correct.

R7's worker override is absent from notes. Consolidation and task solving must be able to search uncited sources. Do not encode R4 as established policy. These mixed notes measure representation exposure under later changes; do not claim they characterize the quality of real forward capture.

## Held-out tasks and evidence oracle

History and notes are frozen first. The runner must never pass future inputs, expected outputs, or grading rules to consolidation. The document is evaluator material and must not enter a dream or solve context.

**Main future request:** create deployment artifacts and the project's historical evidence sidecar for services `api-blue` with offset 7 and `worker-queue` with offset 13, following rook's current conventions. The task supplies the service names/offsets and requires files rather than chat. Neutral serialization instructions, identical in all arms, explicitly require one JSON object per service containing exactly service (string), replicas (integer), metricsEndpoint (string), imagePolicy (string), with no extra service artifacts. The request provides the evidence schema below: exactly the two requested service keys, each mapping exactly replicas, metricsEndpoint and imagePolicy to nonempty arrays of unique supporting logical source labels. Relevant superseded context may accompany sufficient current support; unrelated references are forbidden. It does not disclose historical values or supporting source IDs. New offsets/service names are absent from consolidation inputs.

Expected artifact values (evaluator only):

| Service | replicas | metricsEndpoint | imagePolicy |
|---|---:|---|---|
| api-blue | 2 | http://127.0.0.1:9467/metrics | digest |
| worker-queue | 1 | http://127.0.0.1:9473/metrics | digest |

The evidence sidecar schema is `{ "<service>": { "replicas": ["R..."], "metricsEndpoint": ["R..."], "imagePolicy": ["R..."] } }`. Main artifacts contain exactly the four R1 keys and correctly typed values. Sidecar contains exactly the two requested services and three historical fields per service. Service identities and offsets come from the current task, not historical evidence.

Predeclared supporting source sets: an array passes when all labels belong to its allowed set and it contains at least one sufficient subset below.

| Field | Allowed labels | Sufficient alternative subsets |
|---|---|---|
| api-blue replicas | R2, R5 | {R2} or {R5} |
| worker-queue replicas | R2, R5, R7 | {R7} |
| metricsEndpoint for both | R3, R6 | {R6} |
| imagePolicy for both | R2, R5 | {R5} |

R5 independently reaffirms default replicas=2, so it is sufficient alone. R6 includes both the current base and construction rule; R3 alone is stale. Correct endpoint arithmetic is checked in the artifact, not inferred from citations. R2/R5 may accompany R7 as overridden default context for worker replicas.

Every citation must belong to that field's allowed set; duplicates, unknown labels, note IDs, unsupported R4, and unrelated R8 fail. Existence alone does not establish support. Citations to superseded evidence alone fail. Graders validate this finite support map, not general natural-language entailment. Labels are normalized through the retained logical-ID/store-ID mapping, never by fuzzy text similarity.

**Separate diagnostic request:** write `deploy/registry.json` containing exactly registry (string) and sourceIds (nonempty array of unique supporting logical source labels), with no unrelated references. The request names output path and schema, but withholds registry value and supporting source IDs. The evaluator expects registry=`registry.rook.invalid`; allowed labels are R3 and R6, with sufficient alternative subsets {R3} or {R6}, so either alone or both pass. Grade the value and its source support separately. Run in a fresh solve workspace, not after the main task. Never pool its success with the main task.

## Arms and fair exposure

- **S:** historical sources only.
- **N:** identical sources plus frozen authored notes.
- **D:** identical starting sources/notes plus one history-only `/dream rook deployment` pass per independent repeat.

Same explicitly selected provider/model/thinking, solver system prompt, tool permissions, source search, task text and scaffold across arms. No preloaded index. Keep existing solve guidance; do not add the rejected source-verification treatment. Dream phase receives only the topic and memory tools. It cannot access the task scaffold, evaluator files or future inputs through configured tools; ordinary workspaces remain cooperative, not an adversarial sandbox.

Per repeat, clone D's completed memory snapshot separately into main and diagnostic solves; neither solve sees another solve's writes or transcripts. N and S also use isolated fresh copies for each solve. Preserve source byte hashes across every exposure, note versions/history and before/after memory hashes. No new runner/backend: adapt existing sweep/executor only after design approval; any required lifecycle change returns to supervisor review.

## Offline acceptance (implementation gate)

All checks must pass; zero model calls:

- Positive artifacts for both tasks, including api-blue replicas supported by R2 alone, R5 alone or both, registry supported by R3 alone, R6 alone or both, other allowed supporting sets and JSON key-order/whitespace variants, pass.
- Negative artifacts fail for stale base, ignored offset, stale tag policy, default replicas applied to worker, guessed replicas=5, missing/extra services or keys, wrong types, invalid/missing JSON.
- Evidence negatives fail for absent required sources, existent-but-irrelevant sources, stale-only support, R4, R8, unknown/duplicate labels, wrong-field citations, and missing sidecars. A correct artifact with bad evidence reports artifact=true, evidence=false, joint=false.
- Arm exposures, stable provenance mapping, fresh stores/sessions, one dream per repeat, isolated downstream copies, historical-only dream inputs and retained snapshot hashes are checked deterministically.
- Injected dream/solve failures and timeouts count in denominators; no retries, silent dropped cases, cost substitution, or grader exceptions reported as success.
- Full deterministic suite and offline orchestration checks pass. Grader expected values derive from immutable evaluator fixtures, not solver-mutated files.

Offline success establishes harness behavior only. It cannot demonstrate memory utility.

## Proposed exploratory limits — NOT live authorization

If separately authorized, use three independent repeat blocks; each block has one D consolidation and six solves (three arms × two tasks): **3 dreams + 18 solves, maximum 21 phases**, each limited to 120 seconds. No retries/fallbacks. Freeze exact provider/model/thinking with the authorized run manifest; propose the previous baseline setting openai-codex/gpt-6.1-sol, low, only for continuity, not assumed future availability.

Counterbalance arm order across blocks S/N/D, N/D/S, D/S/N. Alternate main/diagnostic solve order by block. Record actual execution order and cache fields; this reduces a simple order bias but does not control provider load or prove independence.

Report artifact correctness, evidence correctness, joint success, stale/unsupported fields, phase failures, latency, reported tokens and estimated cost separately by arm and task. A D dream failure makes both associated D task exposures phase failures: skip their solve calls and retain failed exposure records; do not substitute N or repeat consolidation. Any separately inspected partial artifacts are troubleshooting only, never successful D scores. The 21 phases are a maximum, not guaranteed spend. Every requested exposure remains in its denominator. Save failed-phase logs and partial artifacts.

Numeric decision proposal: an exploratory signal worth a larger independently designed follow-up requires D main joint success=3/3, no unsupported or stale fields in D, at least one paired main joint improvement over **each** S and N with no paired regression, and no diagnostic joint regression. If S and N already get 3/3, there is no accuracy benefit demonstrated. These deliberately strict tiny-sample thresholds are only a resource-allocation screen, not significance or production adoption criteria. Failure means retain source search/current behavior, report findings, and choose the next hypothesis with supervisor review—not tune this frozen task until D wins.

No production adoption follows from any result here. A larger diverse held-out evaluation and separately agreed cost/quality thresholds would be required.

## Cost and freeze record

Report consolidation cost/time separately and solve-only cost/time per task. Show cumulative workload for exactly these **two** future tasks per repeat: `dream + main solve + diagnostic solve`, versus the corresponding two S/N solves. Also show amortized consolidation cost per task as `dream/2`, explicitly hypothetical outside this workload; do not project savings to unmeasured tasks. Do not double-count the shared dream. Unknown usage/cost remains unknown; provider pricing estimates are not subscription charges. Human-authored note preparation has unmeasured human cost, not zero-cost automated capture.

Before live authorization, commit and fingerprint the complete source packet/provenance, authored notes, task prompts/scaffolds, evidence map, graders/positive-negative corpus, model/settings, phase limits/order and implementation. Retain the resulting manifest plus actual source-ID mapping and each generated snapshot hash with reports. Any substantive post-freeze change creates a new experiment identity; retain old reports unchanged. No private runtime artifacts enter Git.
