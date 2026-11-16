// Deterministic artifact graders. Every rule follows from the task prompt plus the historical
// conventions, and is justified in docs/benchmark.md (no hidden grader requirements).
// Verifiers run outside the task workspace, after the solver has finished. Expected computed
// values derive from the immutable fixture scaffold, never from solver-mutable workspace files.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const norm = text => String(text).replace(/\s+/g, ' ').trim().toLowerCase();

function readWorkspaceFile(workspace, relativePath) {
  const path = join(workspace, ...relativePath.split('/'));
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, 'utf8');
  } catch { return null; }
}

function sectionBodies(lines, headingRe) {
  const bodies = [];
  lines.forEach((line, index) => {
    if (!headingRe.test(line.trim())) return;
    const rest = lines.slice(index + 1).findIndex(next => /^#{1,6}\s/.test(next.trim()));
    const body = rest === -1 ? lines.slice(index + 1) : lines.slice(index + 1, index + 1 + rest);
    bodies.push({ index, text: norm(body.join('\n')) });
  });
  return bodies;
}

// Task 1 (release-note). Documented grading rules (docs/benchmark.md):
// - docs/releases/1.2.md exists (ritual location, history-established);
// - title line "# Release 1.2";
// - "## Included" states BOTH given changes with their meaning: that --json is a new output flag,
//   and that "feed build" now accepts empty/no arguments (not a bare keyword mention);
// - second section is "## Planned" (renamed mid-history, newest convention) naming "config
//   merging"; the superseded "## Deferred" must be absent.
// - Planned appears after Included.
function verifyReleaseNote(_fixture, workspace) {
  const failures = [];
  const markdown = readWorkspaceFile(workspace, 'docs/releases/1.2.md');
  if (markdown === null) return { pass: false, failures: ['docs/releases/1.2.md was not created'] };
  const lines = markdown.split('\n');
  if (!lines.some(line => /^#\s+Release\s+1\.2$/.test(line.trim()))) failures.push('missing title "# Release 1.2"');
  const included = sectionBodies(lines, /^##\s+Included\s*$/);
  const planned = sectionBodies(lines, /^##\s+Planned\s*$/);
  const deferred = sectionBodies(lines, /^##\s+Deferred\s*$/);
  if (included.length !== 1) failures.push(`expected exactly one "## Included" section, found ${included.length}`);
  if (planned.length !== 1) failures.push(`expected exactly one "## Planned" section (current name), found ${planned.length}`);
  if (deferred.length) failures.push('"## Deferred" (superseded section name) still appears');
  if (included.length === 1) {
    const body = included[0].text;
    if (!body.includes('--json') || !/(output flag|json output)/.test(body)) {
      failures.push('Included does not state the --json output flag change');
    }
    const buildMention = /feed\s+build/.test(body);
    const fixMeaning = /(empty|no|blank|zero)\s+(arg|argument)/.test(body) || /empty\s+arg/.test(body);
    if (!buildMention || !fixMeaning) failures.push('Included does not state that "feed build" accepts empty/no arguments');
  }
  if (planned.length === 1) {
    if (included.length === 1 && planned[0].index < included[0].index) failures.push('"## Planned" appears before "## Included"');
    const body = planned[0].text;
    if (!body.includes('config') || !/merg/.test(body)) failures.push('Planned does not state the outstanding config merging work');
  }
  return { pass: failures.length === 0, failures };
}

// Task 2 (impact-table). Documented grading rules:
// - a file matching docs/summary-*.md whose topic mentions the region batch (filename pattern is
//   history-established; the exact topic word is not);
// - title contains "Impact summary";
// - one table with header cells exactly Change, Impact, Next (column set fixed mid-history);
// - one row per given batch item, each with a correct Impact cell and a meaningful, non-empty
//   Next cell carrying the follow-up stated in the task input;
// - rows ordered by landing date, oldest first (docs -> cache -> threshold; the newest rule);
// - no emoji in the file (standing user rule).
const IMPACT_RULES = [
  { needle: 'cache', impact: /(biggest|high)/, next: /(re-?run|rerun)/ },
  { needle: 'threshold', impact: /medium/, next: /(pager|tuning)/ },
  { needle: 'docs', impact: /low/, next: /(nothing|no pending|none|n\/a|no follow)/ },
];
function verifyImpactTable(_fixture, workspace) {
  const failures = [];
  const docsDir = join(workspace, 'docs');
  let names = [];
  try { names = existsSync(docsDir) ? readdirSync(docsDir) : []; } catch { names = []; }
  const candidates = names.filter(name => /^summary-.+\.md$/i.test(name));
  if (!candidates.length) return { pass: false, failures: ['no docs/summary-*.md file for the region batch'] };
  const markdown = readWorkspaceFile(workspace, `docs/${candidates[0]}`);
  const lines = markdown.split('\n');
  if (!lines.some(line => /^#{1,3}\s.*impact summary/i.test(line))) failures.push('title does not say "Impact summary"');
  const headerIndex = lines.findIndex(line => norm(line).startsWith('| change'));
  if (headerIndex === -1) { failures.push('no table with a Change|Impact|Next header row'); return { pass: false, failures }; }
  const cells = lines[headerIndex].split('|').map(cell => norm(cell)).filter(Boolean);
  if (cells.join('|') !== 'change|impact|next') failures.push(`table header cells are ${cells.join(', ')}, expected Change, Impact, Next`);
  const rows = lines.slice(headerIndex + 1).filter(line => /^\s*\|/.test(line) && !/^\s*\|\s*-{2,}/.test(line));
  if (rows.length !== 3) failures.push(`expected exactly 3 rows, found ${rows.length}`);
  const rowCells = rows.map(row => row.split('|').slice(1, -1).map(cell => norm(cell)));
  rowCells.forEach((cells, index) => {
    if (cells.length !== 3) failures.push(`row ${index + 1} has ${cells.length} cells, expected 3`);
    const matches = IMPACT_RULES.filter(rule => cells[0]?.includes(rule.needle));
    if (matches.length !== 1) failures.push(`row ${index + 1} Change must identify exactly one expected item`);
  });
  const positions = IMPACT_RULES.map(rule => {
    const matches = rowCells.flatMap(([change], index) => change?.includes(rule.needle) ? [index] : []);
    if (matches.length !== 1) {
      failures.push(`expected exactly one Change cell for ${rule.needle}, found ${matches.length}`);
      return -1;
    }
    return matches[0];
  });
  for (const [ruleIndex, rule] of IMPACT_RULES.entries()) {
    const index = positions[ruleIndex];
    if (index === -1) continue;
    const [change, impact, next = ''] = rowCells[index];
    if (!impact || !rule.impact.test(impact)) failures.push(`${rule.needle} row has a missing or wrong Impact cell: ${impact ?? '(empty)'}`);
    if (!next || !rule.next.test(next)) failures.push(`${rule.needle} row has a missing or wrong Next follow-up: ${next ?? '(empty)'}`);
    void change;
  }
  const [cachePos, thresholdPos, docsPos] = positions;
  if (positions.every(index => index !== -1) && !(docsPos < cachePos && cachePos < thresholdPos)) {
    failures.push(`rows are not in landing-date order (docs, cache, threshold); found positions docs=${docsPos}, cache=${cachePos}, threshold=${thresholdPos}`);
  }
  if (/\p{Extended_Pictographic}/u.test(markdown)) failures.push('file contains emoji');
  return { pass: failures.length === 0, failures };
}

// Task 3 (local-endpoints). Artifact is connector/run/local.json with the keys the task prompt
// names explicitly: metricsEndpoint, buildCache, configDir. Expected endpoint derives from the
// authoritative base port (9150, history-established) plus the port_offset defined in the
// immutable fixture scaffold (env.toml, a held-out value): the grader never reads solver-mutable
// workspace files to grade. Exact values required; cached superseded or disproven values fail.
export const BASE_PORT = 9150;

export function pigeonExpectation(fixture) {
  const envText = fixture.scaffold['connector/env.toml'] ?? '';
  const match = envText.match(/port_offset\s*=\s*(\d+)/);
  const offset = match ? Number(match[1]) : 0;
  return {
    endpoint: `http://127.0.0.1:${BASE_PORT + offset}/metrics`,
    cache: '/var/cache/pigeon/build',
    conf: '/etc/pigeon/conf',
  };
}

function verifyLocalEndpoints(fixture, workspace) {
  const failures = [];
  const truth = pigeonExpectation(fixture);
  const raw = readWorkspaceFile(workspace, 'connector/run/local.json');
  if (raw === null) return { pass: false, failures: ['connector/run/local.json was not created'] };
  let artifact;
  try { artifact = JSON.parse(raw); } catch (error) {
    return { pass: false, failures: [`connector/run/local.json is not valid JSON: ${error.message}`] };
  }
  for (const [key, expected] of [['metricsEndpoint', truth.endpoint], ['buildCache', truth.cache], ['configDir', truth.conf]]) {
    if (artifact?.[key] !== expected) failures.push(`${key} is ${JSON.stringify(artifact?.[key]) ?? 'missing'}, expected ${JSON.stringify(expected)}`);
  }
  return { pass: failures.length === 0, failures };
}

const VERIFIERS = {
  'release-note': verifyReleaseNote,
  'impact-table': verifyImpactTable,
  'local-endpoints': verifyLocalEndpoints,
};

export function verifyFixture(fixture, workspace) {
  try {
    const result = VERIFIERS[fixture.verifier](fixture, workspace);
    return { pass: result.failures.length === 0, failures: result.failures };
  } catch (error) {
    return { pass: false, failures: [`verifier crashed: ${error.message}`] };
  }
}

// Self-check corpora: variant-correct outputs (not byte-copies of history artifacts) plus
// wrong/missing cases — including the specific false positives the graders must reject.
// Used only for offline harness validation, never shown to a solver.
export const CHECKSamples = {
  'release-note': {
    correct: [
      'docs/releases/1.2.md:\n# Release 1.2\n\n## Included\n\n- new --json output flag for structured output\n- "feed build" now accepts empty arguments lists\n\n## Planned\n\n- config merging (carried over; outstanding)',
      'docs/releases/1.2.md:\n# Release 1.2\n## Included\n- add --json flag for JSON output\n- fix: feed build with no args works\n## Planned\n- config merging remains outstanding',
    ],
    wrong: [
      'docs/releases/1.2.md:\n# Release 1.2\n## Included\n- --json\n- feed build docs mention\n## Planned\n- config stuff',
      'docs/releases/1.2.md:\n# Release 1.2\n## Included\n- --json flag\n- feed build accepts empty arguments\n## Deferred\n- config merging',
      'docs/releases/1.2.md:\n# Release 1.2\n## Planned\n## Included\n- --json output flag\n- feed build accepts empty args\n- config merging',
    ],
  },
  'impact-table': {
    correct: ['docs/summary-region-tests.md:\n# Impact summary — region tests\n\n| Change | Impact | Next |\n| --- | --- | --- |\n| docs tweak for region CLI | low | nothing pending |\n| sample cache fix | biggest | full rerun |\n| stats alert threshold change | medium | pager tuning |'],
    wrong: [
      'docs/summary-region.md:\n# Impact summary — region\n\n| Change | Impact | Next |\n| --- | --- | --- |\n| sample cache fix | biggest | full rerun |\n| stats alert threshold change | medium | pager tuning |\n| docs tweak for region CLI | low | nothing pending |',
      'docs/summary-region.md:\n# Impact summary 🎉 — region\n\n| Change | Impact | Next |\n| --- | --- | --- |\n| docs tweak | low | none |\n| sample cache fix | biggest | rerun |\n| threshold change | medium | tuning |',
      'docs/summary-region.md:\n# Impact summary — region\n\n| Change | Impact | Next |\n| --- | --- | --- |\n| docs tweak | low |  |\n| sample cache fix | biggest | rerun |\n| threshold change | medium | tuning |',
      'docs/summary-region.md:\n# Impact summary — region\n\n| Change | Impact | Next |\n| --- | --- | --- |\n| docs tweak | low | pager tuning |\n| sample cache fix | biggest | rerun |\n| threshold change | medium | nothing pending |',
    ],
  },
  'local-endpoints': {
    correct: ['connector/run/local.json:\n{\n  "metricsEndpoint": "http://127.0.0.1:9156/metrics",\n  "buildCache": "/var/cache/pigeon/build",\n  "configDir": "/etc/pigeon/conf"\n}\n'],
    wrong: [
      'connector/run/local.json:\n{\n  "metricsEndpoint": "http://127.0.0.1:9150/metrics",\n  "buildCache": "/var/cache/pigeon/build",\n  "configDir": "/etc/pigeon/conf"\n}\n',
      'connector/run/local.json:\n{\n  "metricsEndpoint": "http://127.0.0.1:9177/metrics",\n  "buildCache": "/var/cache/pigeon/build",\n  "configDir": "/etc/pigeon/conf"\n}\n',
      'connector/run/local.json:\nnot valid json at all :::',
      'connector/run/local.json:\n{\n  "metricsEndpoint": "http://127.0.0.1:9156/metrics",\n  "configDir": "/etc/pigeon/conf"\n}\n',
    ],
  },
};
