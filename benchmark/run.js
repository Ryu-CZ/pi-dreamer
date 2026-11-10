#!/usr/bin/env node
// benchmark/run.js — repeatable downstream-memory benchmark entry point.
// Default (opt-out by design): offline self-check with the fake executor (no model calls).
// Real model trials require explicit --live plus provider and model selection.
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { TASKS, MODES } from './fixtures.js';
import { runSweep, fakeExecutor, DEFAULT_PHASE_TIMEOUT_MS } from './sweep.js';
import { runPiPhase } from './executor.js';

const { values } = parseArgs({
  allowPositionals: false,
  options: {
    live: { type: 'boolean', default: false },
    provider: { type: 'string' },
    model: { type: 'string' },
    'thinking-level': { type: 'string', default: 'low' },
    repeats: { type: 'string' },
    tasks: { type: 'string', default: 'all' },
    modes: { type: 'string', default: 'all' },
    out: { type: 'string' },
    'phase-timeout-ms': { type: 'string' },
    smoke: { type: 'boolean', default: false },
  },
});

const list = (value, universe) => {
  if (value === 'all') return universe;
  const wanted = value.split(',').filter(Boolean);
  const unknown = wanted.filter(name => !universe.includes(name));
  if (!wanted.length || new Set(wanted).size !== wanted.length || unknown.length) {
    console.error(`entries must be nonempty, unique and known; valid: ${universe.join(', ')}`);
    process.exit(2);
  }
  return wanted;
};

const repeats = values.repeats === undefined ? null : Number(values.repeats);
if (repeats !== null && (!Number.isInteger(repeats) || repeats < 1 || repeats > 20)) {
  console.error('--repeats must be an integer between 1 and 20'); process.exit(2);
}
const phaseTimeoutMs = values['phase-timeout-ms']
  ? Number(values['phase-timeout-ms'])
  : DEFAULT_PHASE_TIMEOUT_MS;
if (!Number.isSafeInteger(phaseTimeoutMs) || phaseTimeoutMs < 1000) {
  console.error('--phase-timeout-ms must be an integer >= 1000'); process.exit(2);
}

// Smoke subset: one fast task/one repeated mode set on the cheapest full pipeline.
const smokePresets = { tasks: ['release-note'], modes: ['none', 'dreamed-notes'] };
const tasks = values.smoke ? smokePresets.tasks : list(values.tasks, TASKS);
const modes = values.smoke ? smokePresets.modes : list(values.modes, MODES);

if (values.live) {
  if (!values.provider || !values.model) {
    console.error('live runs require --provider and --model (e.g. opencode/glm-5.3-flash-free or opencode-zen-free/glm-5.3-flash-free)');
    process.exit(2);
  }
  console.error('LIVE MODE: each trial makes real model calls via the installed pi CLI. Expect cost.');
}
const outDir = values.out ?? join(mkdtempSync(join(tmpdir(), 'dreamer-bench-')), 'bench');
console.error(`output directory: ${outDir}`);

let summary;
try {
  summary = await runSweep({
    outDir,
    executor: values.live
      ? { run: context => runPiPhase({ argv: context.argv, cwd: context.workspace, phaseTimeoutMs, piBin: process.env.PI_BIN ?? 'pi', transcriptDir: context.transcripts, label: context.kind }) }
      : fakeExecutor(),
    repeats: repeats ?? (values.live && !values.smoke ? 3 : 1),
    tasks, modes, provider: values.provider ?? null, model: values.model ?? null,
    thinkingLevel: values['thinking-level'], phaseTimeoutMs, live: values.live,
  });
} catch (error) {
  console.error(`benchmark aborted: ${error.message}`);
  process.exit(2);
}
if (!values.live) {
  console.log(JSON.stringify({ ...summary, note: 'OFFLINE SELF-CHECK: harness and graders only; no model calls; not model quality evidence.' }, null, 2));
  if (Object.values(summary.aggregate.byMode).some(group => group.success !== group.trials)) process.exitCode = 1;
} else {
  console.log(JSON.stringify(summary, null, 2));
}
