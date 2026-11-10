#!/usr/bin/env node
// Bounded impact-table experiment: reuse three audited v2 memories, no dreaming.
import { parseArgs } from 'node:util';
import { readFileSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { runSweep, fakeExecutor } from '../benchmark/sweep.js';
import { runPiPhase } from '../benchmark/executor.js';
import { FIXTURES, fixtureHash } from '../benchmark/fixtures.js';

const { values } = parseArgs({ options: {
  live: { type: 'boolean', default: false },
  from: { type: 'string', default: '.local/benchmarks/baseline-v2-impact-r3' },
  out: { type: 'string' },
} });
if (!values.out) throw new Error('Specify a fresh --out directory; --live explicitly enables nine solve phases.');
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const from = resolve(values.from);
const prior = JSON.parse(readFileSync(join(from, 'summary.json')));
if (prior.fixtureHashes['impact-table'] !== fixtureHash(FIXTURES.find(f => f.id === 'impact-table'))) {
  throw new Error('Frozen run and current task fixture differ.');
}
const snapshots = [1, 2, 3].map(repeat => {
  const trial = join(from, 'trials', `impact-table-dreamed-notes-r${repeat}`);
  const path = join(trial, 'workspace/.pi/dreamer/memory.sqlite');
  for (const suffix of ['-wal', '-journal']) {
    if (existsSync(path + suffix)) throw new Error(`Uncheckpointed database: ${path + suffix}`);
  }
  // Actual v2 solve transcripts were also manually audited for ordinary tool writes.
  const events = readFileSync(join(trial, 'transcripts/solve.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  if (events.some(e => e.type === 'tool_execution_start' && e.toolName?.startsWith('dreamer_') &&
      ['create', 'revise', 'capture', 'delete'].includes(e.args?.action))) {
    throw new Error(`Solver mutated frozen memory in repeat ${repeat}`);
  }
  return { repeat, path, sha256: hash(path) };
});
const instruction = 'Treat retrieved notes as incomplete guidance. Inspect their cited sources for task-relevant requirements before acting.';
const exposures = [];
const offline = fakeExecutor();
const executor = { run: async context => {
  if (context.kind !== 'solve') throw new Error('This experiment must not dream.');
  const repeat = Number(context.workspace.match(/-r(\d+)\/workspace$/)[1]);
  const control = context.workspace.includes('impact-table-frozen-control-');
  const verify = context.workspace.includes('impact-table-frozen-verify-');
  const snapshot = snapshots[repeat - 1];
  if (control || verify) {
    const destination = join(context.workspace, '.pi/dreamer/memory.sqlite');
    copyFileSync(snapshot.path, destination);
    if (hash(destination) !== snapshot.sha256) throw new Error('Memory copy mismatch');
  }
  const argv = [...context.argv];
  if (verify) argv[argv.indexOf('--system-prompt') + 1] += `\n${instruction}`;
  exposures.push({ workspace: context.workspace, repeat, arm: control ? 'frozen-control' : verify ? 'frozen-verify' : 'sources', snapshotHash: control || verify ? snapshot.sha256 : null, argv });
  return values.live ? runPiPhase({ argv, cwd: context.workspace, phaseTimeoutMs: 120000,
    piBin: process.env.PI_BIN ?? 'pi', transcriptDir: context.transcripts, label: 'solve' })
    : { ...await offline.run(context), argv };
} };
await runSweep({ outDir: values.out, executor, tasks: ['impact-table'],
  modes: ['frozen-control', 'frozen-verify', 'sources'], repeats: 3,
  provider: 'openai-codex', model: 'gpt-6.1-sol', thinkingLevel: 'low', phaseTimeoutMs: 120000, live: values.live });
for (const s of snapshots) if (hash(s.path) !== s.sha256) throw new Error('Original snapshot changed');
writeFileSync(join(resolve(values.out), 'experiment.json'), JSON.stringify({
  live: values.live, from, priorRunId: prior.runId, snapshots, instruction, exposures,
  scriptHash: hash(new URL(import.meta.url)),
  note: 'No new dream cost. Seed counts in report describe the replaced initial store; snapshot hashes identify actual frozen memories. Built-in none-baseline paired differences are empty; pair control/verify by repeat.',
}, null, 2), { mode: 0o600 });
console.log(`Saved ${values.live ? 'live' : 'offline canned'} experiment: ${resolve(values.out)}`);
