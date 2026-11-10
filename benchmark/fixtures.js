// Deterministic benchmark fixtures: three synthetic, held-out, artifact-producing tasks.
// Forward notes are deliberately stale/partial: they cite only evidence that existed when such a
// note would plausibly have been written; later captured evidence justifies correcting them.
// Expected outputs and grading rules live in verifiers.js and are documented in docs/benchmark.md.
import { createHash } from 'node:crypto';

export const TASKS = ['release-note', 'impact-table', 'local-endpoints'];
export const MODES = ['none', 'sources', 'forward-notes', 'dreamed-notes', 'dreamed-index'];

const scaffold = (project, blurb, extra = {}) => ({
  'README.md': `${project} — ${blurb}\nThis is a benchmark scaffold; project habits are not documented here.\n`,
  'src/index.js': `#!/usr/bin/env node\n// ${project} entry point (scaffold stub).\n`,
  ...extra,
});

// Task 1: project/task convention ("release note"). The note section name changes mid-history.
const birdfeedScaffold = scaffold('birdfeed', 'a tiny CLI relay utility.');
const birdfeedHistory = [
  { sessionId: 'birdfeed-h1', entryId: 'goal-0.4', role: 'user',
    text: 'Ship birdfeed release 0.4 following our usual release ritual.' },
  { sessionId: 'birdfeed-h1', entryId: 'artifact-0.4', role: 'toolResult', toolName: 'read', isError: false,
    text: 'docs/releases/0.4.md:\n# Release 0.4\n## Included\n- add --dry-run flag\n## Deferred\n- config merging' },
  { sessionId: 'birdfeed-h1', entryId: 'retire-root-file', role: 'user',
    text: 'Correction: RELEASE_NOTES.txt at the root stays retired; the docs/releases files are the only release notes birdfeed keeps.' },
  { sessionId: 'birdfeed-h2', entryId: 'rename-sections', role: 'user',
    text: 'Ritual change going forward: the second release-note section is "## Planned" now, not "## Deferred". Same content rule: outstanding work goes under Planned.' },
  { sessionId: 'birdfeed-h2', entryId: 'artifact-0.5', role: 'toolResult', toolName: 'read', isError: false,
    text: 'docs/releases/0.5.md:\n# Release 0.5\n## Included\n- parallel fetch rewrite\n## Planned\n- shell completions' },
  { sessionId: 'birdfeed-h2', entryId: 'bench-note', role: 'toolResult', toolName: 'bash', isError: false,
    text: 'bench output: relay cache warm-up 41ms -> 9ms after decoder inlining.' },
  { sessionId: 'birdfeed-h2', entryId: 'pr-template', role: 'user',
    text: 'Contributor reminder: pull requests use docs/templates/pr.md; unrelated to release notes.' },
];
const birdfeedNotes = [
  { title: 'Release ritual', kind: 'procedure',
    text: 'birdfeed release ritual (as of 0.4): docs/releases/<version>.md titled "# Release <version>", section "## Included" then "## Deferred". Shipped work under Included, outstanding work under Deferred.',
    derivedFrom: ['artifact-0.4'] },
  { title: 'Relay bench', kind: 'observation',
    text: 'Relay cache warm-up measured 9ms after decoder inlining.', derivedFrom: ['bench-note'] },
];

// Task 2: user preference ("work summary"). The row ordering rule changes mid-history.
const irisbotScaffold = scaffold('irisbot', 'a queue orchestration bot.');
const irisbotHistory = [
  { sessionId: 'irisbot-s1', entryId: 'migration-ask', role: 'user',
    text: 'Config migration wrapped. Write it up the way I keep irisbot summaries.' },
  { sessionId: 'irisbot-s1', entryId: 'artifact-migration', role: 'toolResult', toolName: 'read', isError: false,
    text: 'docs/summary-config-migration.md:\n# Impact summary — config migration\n\n| Change | Impact | Next |\n| --- | --- | --- |\n| parser swap to envv3 | blocks rollout | hotfix 1.1 |\n| drop envv2 keys | low | ask maintainers |' },
  { sessionId: 'irisbot-s1', entryId: 'emoji-correction', role: 'user',
    text: 'And drop the emoji from summaries again. Keep it plain: table first, no decorative icons anywhere in these files.' },
  { sessionId: 'irisbot-s2', entryId: 'ordering-change', role: 'user',
    text: 'Standing rule change for all future irisbot summaries: rows are sorted by landing date, oldest first. Impact no longer decides the order; keep the Impact and Next columns exactly as they are.' },
  { sessionId: 'irisbot-s2', entryId: 'brainstorm-noise', role: 'assistant',
    text: 'Maybe the impact column could carry a score of 1-10 instead of words? Leaving that aside until the user asks.' },
  { sessionId: 'irisbot-s2', entryId: 'style-member', role: 'user',
    text: 'Ruby code style for this repo: two-space indentation, not tabs.' },
];
const irisbotNotes = [
  { title: 'Work summary format', kind: 'procedure',
    text: 'irisbot impact summaries: "# Impact summary — <topic>" with one table, header Change|Impact|Next, sorted by biggest impact first; pending follow-ups in Next. No emoji.',
    derivedFrom: ['artifact-migration'] },
  { title: 'Ruby indentation', kind: 'preference', text: 'Ruby sources in irisbot use two-space indentation.', derivedFrom: ['style-member'] },
];

// Task 3: environment convention ("connector values"). Held-out task applies a rule (base port +
// workspace port_offset from the scaffold's connector/env.toml) to a NEW input; history establishes
// which values are authoritative, not the held-out endpoint value.
const pigeonScaffold = scaffold('pigeon', 'a local telemetry connector.', {
  'connector/env.toml': '[ports]\nport_offset = 6\n',
});
const pigeonHistory = [
  { sessionId: 'pigeon-h0', entryId: 'first-ask', role: 'user',
    text: 'Find the local pigeon metrics endpoint so onboarding stops guessing.' },
  { sessionId: 'pigeon-h0', entryId: 'envstat-jun', role: 'toolResult', toolName: 'bash', isError: false,
    text: 'envstat.sh (June snapshot):\nmetrics endpoint: http://127.0.0.1:9159/metrics\nbuild cache: not settled' },
  { sessionId: 'pigeon-h1', entryId: 'cache-ask', role: 'user',
    text: 'Continue the wiring: confirm the endpoint and report where the pigeon build cache lives.' },
  { sessionId: 'pigeon-h1', entryId: 'cache-guess', role: 'assistant',
    text: 'My guess: the build cache probably lives at /var/tmp/pigeon/bare.' },
  { sessionId: 'pigeon-h1', entryId: 'envstat-aug', role: 'toolResult', toolName: 'bash', isError: false,
    text: 'envstat.sh (August snapshot):\nmetrics endpoint: http://127.0.0.1:9177/metrics\nbuild cache: /var/cache/pigeon/build' },
  { sessionId: 'pigeon-h1', entryId: 'cache-correction', role: 'user',
    text: 'Right: the build cache is /var/cache/pigeon/build, not the /var/tmp path floated earlier.' },
  { sessionId: 'pigeon-h2', entryId: 'upgrade-ask', role: 'user',
    text: 'Upgrade is over. Record the environment rule so connector work stops hardcoding endpoints.' },
  { sessionId: 'pigeon-h2', entryId: 'envstat-final', role: 'toolResult', toolName: 'bash', isError: false,
    text: 'envstat.sh (final snapshot):\nmetrics base port: 9150\nbuild cache: /var/cache/pigeon/build' },
  { sessionId: 'pigeon-h2', entryId: 'env-rule', role: 'user',
    text: 'Pigeon environment rule: the envstat "metrics base port" is authoritative; a workspace endpoint is that base plus the port_offset in its connector/env.toml. Cache and conf paths never receive an offset. Full URLs inside older envstat snapshots are superseded.' },
  { sessionId: 'pigeon-h2', entryId: 'conf-dir', role: 'toolResult', toolName: 'read', isError: false,
    text: 'pigeon relay reads its configuration files from /etc/pigeon/conf on this machine.' },
  { sessionId: 'pigeon-h2', entryId: 'stage-cluster', role: 'user',
    text: 'FYI the staging cluster fronts at https://pigeon-stage.invalid:8043/metrics; that is the remote stage box, not local connector runs.' },
];
const pigeonNotes = [
  { title: 'Local pigeon values', kind: 'observation',
    text: 'Local pigeon: metrics endpoint http://127.0.0.1:9177/metrics and build cache /var/cache/pigeon/build, per the latest envstat snapshot.',
    derivedFrom: ['envstat-aug'] },
  { title: 'Staging cluster', kind: 'observation',
    text: 'pigeon staging fronts at https://pigeon-stage.invalid:8043/metrics (remote box, not local).',
    derivedFrom: ['stage-cluster'] },
];

export const FIXTURES = [
  {
    id: 'release-note',
    scaffold: birdfeedScaffold,
    taskPrompt: `This is the birdfeed package workspace. We are preparing release 1.2. Included changes for this release: the new --json output flag, and the fix so "feed build" accepts empty argument lists. Config merging remains outstanding for a later release. Produce the release materials the way past birdfeed releases established them, putting this outstanding work under the section where the current ritual keeps it.`,
    dreamTopic: 'birdfeed project habits review',
    history: birdfeedHistory,
    forwardNotes: birdfeedNotes,
    verifier: 'release-note',
  },
  {
    id: 'impact-table',
    scaffold: irisbotScaffold,
    taskPrompt: `This is the irisbot package workspace. The region test batch wrapped. Write the batch summary the way irisbot summaries are kept. Save it as a file in this workspace, not just as a chat response. Batch items: the sample cache fix (biggest impact this batch; follow-up is a full rerun) landed Tuesday; the stats alert threshold change (medium impact; follow-up is pager tuning) landed Wednesday; the docs tweak (low impact; nothing pending) landed Monday.`,
    dreamTopic: 'irisbot project habits review',
    history: irisbotHistory,
    forwardNotes: irisbotNotes,
    verifier: 'impact-table',
  },
  {
    id: 'local-endpoints',
    scaffold: pigeonScaffold,
    taskPrompt: `This is the pigeon package workspace. connector/env.toml holds this workspace's port_offset. Write connector/run/local.json with exactly the keys metricsEndpoint, buildCache, and configDir: the metrics endpoint (apply the established local rule to the authoritative base port), the build cache directory, and the telemetry configuration directory. Use established values; do not invent paths or ports.`,
    dreamTopic: 'pigeon environment conventions review',
    history: pigeonHistory,
    forwardNotes: pigeonNotes,
    verifier: 'local-endpoints',
  },
];

export function fixturesFor(taskSubset) {
  const wanted = taskSubset.includes('all') ? TASKS : taskSubset;
  return FIXTURES.filter(f => wanted.includes(f.id));
}

// Stable identity: canonical content hash covering scaffold, prompts, history, notes, and topic.
export function fixtureHash(fixture) {
  return createHash('sha256').update(JSON.stringify({
    id: fixture.id, scaffold: fixture.scaffold, prompt: fixture.taskPrompt,
    dreamTopic: fixture.dreamTopic, history: fixture.history, notes: fixture.forwardNotes,
  })).digest('hex').slice(0, 32);
}

export function entryIdMap(fixture) {
  return new Map(fixture.history.map(entry => [entry.entryId, entry]));
}
