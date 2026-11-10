# First prototype: completion audit

## Objective and outcome

Deliver a working Pi-native prototype that captures evidence and notes while working, revisits original evidence to correct a mistaken note, and retrieves that correction in a later project session. Keep work bounded, research existing implementations first, delegate deliberately through visible Herdr workers using Codex sol low where possible, and verify actual artifacts rather than treating green tests as the objective.

**Outcome: achieved for the first-prototype scope below.** This is not completion of the broader evaluation roadmap or `/dream-history` proposal.

## Prompt-to-artifact checklist

| Requirement | Artifact and inspected evidence |
|---|---|
| Think through work before and during delegation | `docs/prototype-contract.md` bounded the milestone; separate store and adapter ownership. Manager integrated actual SDK and live tests, inspected implementation, and acted on the independent review. |
| Discover applicable skills/processes | Installed Pi extension, SDK, package/session docs and examples were inspected before adapter implementation. `animated-html/SKILL.md` informed rendered visual inspection. No Mermaid tooling was needed for HTML/SVG. |
| Prefer visible Herdr workers, sol 6.1 low | `dreamer-scout` and `dreamer-core` were launched in sibling Herdr panes using `openai-codex/gpt-6.1-sol --thinking low`; no hidden orchestration. Scoped ownership, read-only review, and manager verification followed. |
| Research reuse before building replacements | `docs/reuse-review.md`: Pi SDK, Node SQLite, Icarus adapter conventions, LaPis, Engraphis, Anthropic wiki example. Pi supplies session/model/tool infrastructure; Node supplies the database. External project review was documentation-level, not a code audit. |
| Anthropic research; forward vs backward time | `docs/research.md`, source snapshot, design, and architecture distinguish findings from decisions. `scripts/demo.js` and SDK/live trials exercise wrong forward hypothesis → original evidence → reasoned versioned correction. |
| Contract 1: actual Pi loading, no global config changes | `test/pi-smoke.js` uses installed `DefaultResourceLoader` and `createAgentSession`; checks zero load errors, exactly two active tools, and no DB at registration. Live CLI uses explicit `-e`, disabled unrelated extensions/MCP/context files, disposable project. |
| Contract 2: deliberate current-branch text and provenance | `src/adapter.js` uses `getBranch()`, not `getEntries()`. Unit tests exclude thinking/signatures/images/tool calls/details; retain role, IDs, timestamps, tool name/error. Actual SDK test branches a real SessionManager and rejects sibling capture through registered tool execution. |
| Contract 3: source-linked forward note | Store tests, demo, and actual Pi scripted tool loop capture sources and create version 1 with required existing citations. |
| Contract 4: manual backward correction | `/dream` searches notes and captured sources including uncited contradictions, opens originals, requests reason/current version. SDK smoke discovers evidence via source search rather than supplying the answer source ID. Real Codex CLI trial searched, read the original observation, and persisted version 2 citing it. |
| Contract 5: later-session corrected retrieval | SDK smoke creates a second real AgentSession in the same project. Live trial launches a separate Pi process and checks its tool search and final answer. History keeps version 1; current text search does not retrieve its superseded text. |
| Contract 6: failure and deletion boundaries | Store tests reject stale revisions across two connections and missing citations, preserve state after failures, isolate databases, and cascade source deletion across historical-only dependencies. Actual SDK tool loop also rejects stale/missing-source writes, rejects unconfirmed deletion, and confirms deletion removes both revisions. |
| Contract 7: reproducible tests and visuals | Commands below; `README.md` reproduction instructions; `docs/architecture.html` rendered with Chromium and image inspected. Four separate visual fragments cover temporal flow, versioned correction, trust boundaries, and scope/deletion. |
| Privacy/scope and excluded infrastructure | Tool descriptions, `/dream` prompt and README disclose project publication, provider visibility and branch behavior. Source inspection shows no lifecycle harvest, scheduler, automatic injection, migration, external model client, or integration with existing memory systems. Git remote list is empty. |
| Usable local project | `/home/tom/git/pi-dreamer`, `package.json`, three source files, tests, demos, README and linked docs. No dependency service/build required. No commit or remote publication was made. |

## Commands actually run

Environment: Linux, Node **v26.10.0**, installed Pi **1.5.0**. Minimum Node version declared by the package was not separately tested.

```sh
npm test
# 20 tests passed, 0 failed

npm run demo
# PASS: forward version 1 → source-backed version 2 → reopen and recall

PI_SDK_ROOT=/home/tom/.pi/agent/install/releases/1.5.0/node_modules/@earendil-works/pi-coding-agent npm run test:pi
# PASS: actual extension loading and registered-tool success/failure paths;
# /dream command, separate session recall; fetch denied, zero fetch attempts

DREAMER_KEEP_LIVE_ARTIFACTS=1 node scripts/live-smoke.js --run
# PASS: openai-codex/gpt-6.1-sol, low thinking, revision 2,
# sourceOpened=true, separate process answer identifies port 4317

git diff --check
# passed

chromium --headless --disable-gpu --no-sandbox \
  --screenshot=/tmp/pi-dreamer-architecture-final.png --window-size=1280,3400 \
  file:///home/tom/git/pi-dreamer/docs/architecture.html
# Rendered and inspected: readable labels, intact arrows, no overlap/clipping on desktop.
```

Synthetic live artifacts were retained at `/tmp/dreamer-live-qT3IAs` for this run. They are temporary evidence, not required project dependencies. The real model’s later-session answer was: “The stored ‘Service port’ note reports the service observed listening on **127.0.0.1:4317**—port **4317**.”

## Review findings addressed

1. The first dreaming prompt only reopened a wrong note’s citations; it could miss uncited contradictory evidence. Added source search and explicit contradiction inspection, plus tests.
2. The first SDK scenario supplied a previously known source ID. Replaced that shortcut with discovery from tool search results and added actual-tool rejection/deletion paths.
3. Real CLI initially exited while `/dream`'s asynchronous turn was starting. Pi `sendMessage` returns void; the command now waits for idle after dispatch. The same real CLI test then passed.
4. Searches initially returned full source text. Adapter search now returns at most ten 600-character text previews, with full reads explicit.

## Limits, not concealed completion claims

- Scripted-model tests establish plumbing and invariants, not reasoning quality. One successful real-model synthetic trial is not a benchmark or evidence of general memory improvement.
- The model is prompted to inspect evidence; the store enforces citations/versioning, **not semantic truth or proof that a source was actually read**. No confidence promotion exists.
- Prompt injection resistance is guidance, not a security guarantee. `/dream` retains the normal agent’s tools and provider policy.
- Read/history payloads are not fully token-budgeted; history is unpaginated. Search is substring-only and source capture is text-only. Broader evaluation fixtures in `docs/plan.md` remain future work.
- Private POSIX permissions and symlink checks do not defend against a same-user filesystem adversary. Deletion covers the local memory dependency graph, not Pi transcripts, provider retention, backups, or physical media erasure.
- No schema migration, archived-session ingestion, `/dream-history`, automatic capture/injection, scheduling, wiki, embeddings, or held-out real-world quality evaluation is claimed.

No required first-prototype deliverable remains unverified; the deferred roadmap is explicitly outside this milestone.
