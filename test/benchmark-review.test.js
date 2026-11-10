import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parsePiEvents, runPiPhase } from '../benchmark/executor.js';
import { runSweep, fakeExecutor } from '../benchmark/sweep.js';
import { FIXTURES } from '../benchmark/fixtures.js';
import { verifyFixture } from '../benchmark/verifiers.js';

const scratch = t => {
  const dir = mkdtempSync(join(tmpdir(), 'dreamer-review-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const event = usage => JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [], usage } });

test('partial assistant usage makes affected sums unknown, not deceptively partial', () => {
  const result = parsePiEvents([event({ input: 10, output: 2, cost: { total: 0.5 } }), event({ output: 3 })].join('\n'), '');
  assert.equal(result.usage.input, null);
  assert.equal(result.usage.output, 5);
  assert.equal(result.cost, null);
  const missing = parsePiEvents([event({ input: 10, cost: { total: 0.5 } }), event(undefined)].join('\n'), '');
  assert.equal(missing.usage.input, null);
  assert.equal(missing.cost, null);
});

test('successful process exit without assistant output is an execution failure', t => {
  const dir = scratch(t);
  const result = runPiPhase({ piBin: process.execPath, argv: ['-e', ''], cwd: dir, phaseTimeoutMs: 1000, transcriptDir: dir, label: 'empty' });
  assert.equal(result.exitCode, 0);
  assert.match(result.error, /no assistant messages/);
});

test('relative report path resolves absolutely and dream sessions stay outside solve workspace', async t => {
  const dir = scratch(t);
  const observed = [];
  const executor = { run: async context => {
    observed.push(context);
    return { ...await fakeExecutor().run(context), argv: context.argv };
  } };
  await runSweep({ outDir: relative(process.cwd(), join(dir, 'run')), executor, repeats: 1,
    tasks: ['release-note'], modes: ['none', 'dreamed-index'], live: false });
  for (const phase of observed) {
    assert.ok(isAbsolute(phase.workspace));
    const sessionDir = phase.argv[phase.argv.indexOf('--session-dir') + 1];
    assert.ok(isAbsolute(sessionDir));
    assert.ok(relative(phase.workspace, sessionDir).startsWith('..'), 'session transcript is not solver input');
    if (phase.appendSystemPrompt) assert.ok(isAbsolute(phase.appendSystemPrompt));
  }
  const record = JSON.parse(readFileSync(join(dir, 'run/trials/release-note-dreamed-index-r1/result.json')));
  assert.ok(record.implementationHash);
  assert.equal(record.runtime.node, process.version);
  assert.ok(record.solve.argv.includes('--mode'));
});

test('CLI rejects empty and duplicate trial selections', () => {
  for (const args of [['--modes', ''], ['--tasks', 'release-note,release-note'], ['--phase-timeout-ms', '1000.5']]) {
    const result = spawnSync(process.execPath, ['benchmark/run.js', ...args], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
  }
});

test('release input names outstanding work without disclosing the historical section convention', () => {
  const prompt = FIXTURES.find(f => f.id === 'release-note').taskPrompt;
  assert.match(prompt, /Config merging remains outstanding/);
  assert.ok(!prompt.includes('Planned'));
});

test('summary task explicitly requires a file without disclosing historical conventions', () => {
  const prompt = FIXTURES.find(f => f.id === 'impact-table').taskPrompt;
  assert.ok(prompt.includes('Save it as a file in this workspace, not just as a chat response.'));
  for (const convention of ['docs/', '.md', 'Impact summary', 'Change|Impact|Next', 'oldest first', 'sorted by landing']) {
    assert.ok(!prompt.includes(convention), `prompt leaks ${convention}`);
  }
});

test('environment grader permits a newly computed value equal to an old snapshot', t => {
  const workspace = scratch(t);
  const original = FIXTURES.find(f => f.id === 'local-endpoints');
  const fixture = { ...original, scaffold: { ...original.scaffold, 'connector/env.toml': 'port_offset = 9' } };
  mkdirSync(join(workspace, 'connector/run'), { recursive: true });
  writeFileSync(join(workspace, 'connector/run/local.json'), JSON.stringify({ metricsEndpoint: 'http://127.0.0.1:9159/metrics', buildCache: '/var/cache/pigeon/build', configDir: '/etc/pigeon/conf' }));
  assert.equal(verifyFixture(fixture, workspace).pass, true);
});
