# First working prototype contract

This is a bounded implementation milestone, not the full research roadmap.

## Required demonstration

1. Load an actual Pi extension without modifying global configuration.
2. Deliberately capture text evidence from an entry on the current Pi branch, with session ID, entry ID, role, timestamp, and tool identity where relevant. Exclude hidden thinking, images, and automatic whole-session ingestion.
3. Write a source-linked project note while working (forward time).
4. Invoke a manual dreaming command, inspect original evidence, and revise a mistaken note with a reason and optimistic version check (backward time).
5. Retrieve the corrected note in a later session for the same project; retain correction history and original evidence.
6. Demonstrate stale-write rejection, missing-source rejection, explicit deletion propagation, project isolation, and rejection of attempts to capture a sibling-branch entry.
7. Provide reproducible tests, a real Pi SDK smoke path, a synthetic learning-loop demonstration, and visually verified architectural fragments.

## Scope and trust

Notes and explicitly captured sources are shared within one project. Writing them is an explicit publication to project memory, NOT private branch-local storage. Capture only accepts entries on the current branch. Every captured entry retains its original session and entry identity. Forking or navigating Pi history does not rewind project memory; this must be stated in tools and docs. No automatic merging, harvesting, or injection in this prototype.

Model-generated notes are derived claims, not independently verified facts. Source linkage proves attribution, not truth. Dreaming uses the current Pi agent only after an explicit command: this can send selected memory to the configured model provider and must be disclosed. No separate provider configuration or silent remote calls.

## Engineering choices

- ESM JavaScript core using Node built-in SQLite, no runtime service or external database.
- Small TypeScript Pi adapter, using host-provided APIs and schema package.
- One project-local `.pi/dreamer/memory.sqlite` store with restricted filesystem permissions; docs must instruct ignoring it. Tests use disposable directories only.
- Explicit source search/read, note creation/search/read, source-backed revision, and deletion. Retain version history; use transactions for corrections and deletion propagation.
- Plain lexical search for the prototype. Embeddings and automatic promotion remain deferred.

## Completion evidence

Record commands, results, limitations, and requirement-to-test mapping in docs/prototype-verification.md. Deterministic synthetic tests prove plumbing, not measured real-world memory benefits. A live model demonstration is additional evidence, not a substitute for deterministic correctness checks.
