# pi-dreamer

A first working Pi memory prototype: **capture looking forward, correct looking backward, retrieve for the next task.**

Inspired by Anthropic’s [Components of agent memory](https://www.anthropic.com/research/components-of-agent-memory). The research guides the design; it does not guarantee this implementation improves real-world performance.

## Try it

Requires Node >=22.19 and Pi (tested with Pi 1.5.0 on Linux, Node 26.10). SQLite is built into Node; no database server or dependency installation is needed for the core tests. Pi supplies its extension API and TypeBox.

From the project whose memory you want to use:

```sh
pi -e /home/tom/git/pi-dreamer/src/index.ts
```

This loads the extension for that invocation without changing global settings. Add `.pi/dreamer/` to **that project's** `.gitignore` before capturing private material. Memory lives at `realpath(cwd)/.pi/dreamer/memory.sqlite`: subdirectories are separate scopes, not automatically resolved to a Git root.

Ask Pi to:

1. List eligible entries with `dreamer_source` action `branch`.
2. Explicitly capture selected entry IDs with action `capture`.
3. Create a `dreamer_note` citing the returned source IDs.
4. Later run `/dream <topic>` to search notes **and uncited captured evidence**, inspect original sources, and revise supported mistakes.
5. In a new session in the same directory, ask Pi to search its notes.

Example request: “List recent Dreamer evidence candidates. Capture the service command result, then record an observation about its port with that source citation.” Then: `/dream Service port`.

## Tools

| Tool | Actions |
|---|---|
| `dreamer_source` | `branch`, `capture(entryId)`, `read(id)`, `search(query)`, `delete(id, confirm=true)` |
| `dreamer_note` | `create(title, kind, text, sourceIds)`, `read(id)`, `search(query)`, `history(id)`, `revise(id, expectedVersion, text, reason, sourceIds)` |

Kinds: `observation`, `decision`, `preference`, `hypothesis`, `procedure`. Search is literal substring matching, not semantic search; try short terms. Search returns at most 10 results with 600-character text previews; read opens full text. Branch lists the last 20 eligible entries with 400-character previews. Captures over 64,000 characters are rejected, never silently truncated. History currently returns all revisions; it is not token-budgeted.

## Boundaries

- Only visible user/assistant/tool-result text on the **current branch** can be captured. Thinking, images, tool-call arguments, result details, and Dreamer tool results are excluded. Tool identity and error status are preserved.
- Captured sources and notes are **project-shared publication**, not private branch state. Switching/forking a session does not rewind memory.
- Notes are derived claims. Citations establish attribution, **not truth**. Revisions require a reason, existing sources, and the current version; stale writes fail.
- `/dream` uses the current Pi agent/provider and its currently enabled tools. Selected evidence goes to that provider. This is prompt guidance, not a sandbox or an enforced approval gate; the agent can call registered tools as part of normal work.
- Source deletion requires `confirm=true` and removes every dependent note and its entire history, including historical-only dependencies. It does not delete original Pi transcripts, backups, or copies already sent to providers. SQLite secure deletion is not a guarantee of physical media erasure.
- Files use private permissions on POSIX (database 0600, memory directory 0700); obvious symlink redirects are rejected. This is not a defense against an adversary with control of the same account/filesystem.
- No automatic harvesting, startup capture, injection, scheduler, separate model backend, or Fabric/Hermes/Memory OS integration. Registration alone creates no store.

## Verify

```sh
npm test                       # deterministic store + adapter tests
npm run demo                   # synthetic forward/backward/reopen loop, no model
PI_SDK_ROOT=/path/to/installed/pi-coding-agent npm run test:pi
```

`test:pi` loads the actual extension and runs Pi’s tool loop using a scripted model, with fetch denied. `PI_SDK_ROOT` is the installed package directory containing `dist/index.js`; omit it if the package resolves locally.

Optional real-model trial (uses credentials and sends synthetic fixture data):

```sh
node scripts/live-smoke.js --run
```

Defaults to the authorized Codex subscription model `openai-codex/gpt-6.1-sol`, low thinking. `DREAMER_TEST_PROVIDER` / `DREAMER_TEST_MODEL` override that test's model only. Temporary synthetic artifacts are deleted on success unless `DREAMER_KEEP_LIVE_ARTIFACTS=1`; failures retain them for diagnosis. This is one correctness scenario, not a benchmark.

## Repeatable downstream-task benchmark

The benchmark compares no memory, sources, forward notes, dreamed notes, and a **benchmark-only** preloaded index on three held-out artifact-producing tasks. It does not enable automatic injection in the extension.

```sh
npm run benchmark                 # offline harness/validator checks only
npm run benchmark -- --live --provider openai-codex --model gpt-6.1-sol \
  --tasks release-note --modes none,dreamed-notes --repeats 1 \
  --out .local/benchmarks/smoke-001
```

Live runs are explicit and use the selected provider. Use a fresh output directory for each experiment; retain reports and transcripts. A smoke run validates execution, not a statistically meaningful memory benefit. See [benchmark usage and grading rules](docs/benchmark.md) and [measurement contract](docs/benchmark-contract.md).

## Read next

- [Verified prototype requirements and results](docs/prototype-verification.md)
- [Visual architecture fragments](docs/architecture.html) — self-contained HTML/SVG
- [Prototype contract](docs/prototype-contract.md)
- [Research interpretation](docs/research.md) and [source snapshot](docs/sources/components-of-agent-memory.md)
- [Reuse review](docs/reuse-review.md)
- [Broader design](docs/design.md) and [evaluation roadmap](docs/plan.md)
- [Proposed `/dream-history` specification](docs/dream-history-spec.md) — **not implemented**

Automatic consolidation, archived-session ingestion, embeddings, promoted context, wikis, schema migration, and real-world benefit evaluation remain outside this first prototype.
