# Reuse review

The user explicitly prefers established libraries and existing practices over unnecessary new code. This prototype reuses the host and database engine; custom code is limited to the evidence/revision semantics and the Pi adapter.

## Inspected references

- **Installed Pi 1.5.0 SDK documentation and examples**: extension tool/command registration, `SessionManager.getBranch()`, stable entry identity, `DefaultResourceLoader`, `createAgentSession`, and package peer-dependency conventions. These are directly reused. No custom transcript parser, tool dispatcher, model client, or session runtime.
- **Node `node:sqlite`**: reused for persistence, transactions, foreign keys, optimistic version updates, and deletion. No custom file database, ORM, SQLite native-addon build, or database service. Requires the Node version documented in package.json; built-in SQLite may emit an experimental warning on some supported releases.
- **Local `/home/tom/git/pi-icarus-hook`**: inspected adapter/package conventions. Reused the thin ESM registration shape, JSON tool responses, runtime validation, and side-effect-free startup pattern—not Hermes storage or lifecycle capture. No source copied.
- **[LaPis](https://github.com/GeneGulanesJr/LaPis)** README: an existing Pi-native SQLite memory system with project scopes, lifecycle hooks, code-linked trust and a Dream Cycle. Helpful precedent for one local store and inspectable lifecycle documentation. Not adopted as a dependency: its documented scope includes automatic capture/recall, indexing, trust heuristics, CLI/MCP and other harnesses, beyond this deliberately explicit evidence-revision prototype. This is a README-level assessment, not a code audit or claim that LaPis cannot support the design.
- **[Engraphis](https://github.com/Coding-Dev-Tools/engraphis)** README: scoped provenance, temporal history, bounded context, abstention, and reviewed consolidation proposals. Useful design precedents. Not adopted as a dependency because this milestone requires a small in-process Pi adapter rather than a Python service/MCP integration. Implementation suitability was not audited.
- **[Anthropic knowledge-wiki quickstart](https://github.com/anthropics/claude-quickstarts/tree/main/managed-agents/knowledge-wiki)** README: preserve sources, keep unresolved conflicts, separate building from answering, and measure maintenance cost. Its Managed Agents/Python runtime is not reused. Its documented shared-page overwrite tradeoff reinforces using version checks for our mutable representations.

## Deferred choices

Full-text indexes, embeddings, graph storage, automatic consolidation, and wiki generation are not needed to prove the first capture/correction/recall loop. If evidence demonstrates a need, evaluate existing libraries before adding custom implementations. Substring search is a transparent tiny baseline, not a claim of production retrieval quality.

External project claims above are attributed to their documentation, not independently reproduced benchmarks. No third-party project was installed or executed during this review.
