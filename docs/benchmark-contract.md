# Repeatable downstream-memory benchmark contract

This benchmark measures whether memory helps produce a correct artifact on a later task. It is not a recall quiz, a deterministic model benchmark, or a claim of FrontierMemory compatibility.

## Comparison

Use the same synthetic history, held-out task input, task model, reasoning setting and tool permissions across five conditions:

1. No memory.
2. Captured sources only.
3. Sources plus forward notes.
4. Sources plus forward notes revised by an actual `/dream` run.
5. Condition 4 plus a bounded, benchmark-only preloaded memory index.

The fifth condition evaluates a proposed integration; it must not silently add automatic injection to the production extension. Each condition/repeat starts from fresh project and session state. Dreaming and task execution are separate sessions. Report the actual exposure differences; do not call a model-generated selection procedure implemented if the index is constructed deterministically.

## Task validity

Cover project/task conventions, user preferences, and environment conventions. Each history must contain evidence for the required convention plus irrelevant material. Later tasks use different inputs. Expected outputs and grading code stay outside the workspace; neither the dreamer nor solver receives the answers. All graded requirements must follow from the task and its historical conventions, with justification in fixture documentation.

Grade actual artifacts with deterministic semantic checks. Test the graders on correct, incorrect and missing artifacts. Absence of memory should remove historical information, not make ordinary task tools unavailable. These small tasks measure a narrow capability, not general coding intelligence.

## Measurement and reproducibility

- Persist fixture and implementation fingerprints, configuration, model/provider, reasoning settings, repeat IDs, transcripts and phase results.
- Count every requested trial, including errors and timeouts, in the denominator. Never improve scores by silently dropping failed calls or retrying them.
- Track dreaming and task latency/usage separately. Missing provider cost is unknown, not zero; only sum costs when both are known. Zero cost for a phase that was not run is legitimate.
- Repeated model calls are stochastic. Compare success counts and paired outcomes, not just a single favorable example. Do not infer statistical significance from a tiny sample.
- Offline self-checks validate the harness and graders only. Clearly separate them from real model results.
- Live calls require explicit opt-in and model selection; no scheduled jobs or implicit paid trials.

## Acceptance

Offline tests cover verifiers, mode exposure, workspace isolation, reporting, errors and argument validation. A bounded real-model smoke verifies actual execution and record generation, regardless of whether that model passes the task. Broader gains require repeated trials and are not a prerequisite for calling the benchmark itself operational.

Ordinary local CLI workspaces are not adversarial sandboxes. Evaluation assumes a cooperative solver; stronger isolation is future work, not a claimed security boundary.
