// Offline tests for the benchmark harness: graders, seeding/mode exposure, aggregation, and CLI
// validation. They make no network calls and never invoke the model.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { MemoryStore } from '../src/store.js';
import { FIXTURES, MODES, TASKS, fixtureHash } from '../benchmark/fixtures.js';
import { verifyFixture, CHECKSamples, pigeonExpectation } from '../benchmark/verifiers.js';
import { parsePiEvents } from '../benchmark/executor.js';
import { runTrial, runSweep, aggregate, fakeExecutor, seedMemoryStore, implementationHash } from '../benchmark/sweep.js';

// Shared temp root, cleaned when the test process finishes.
let ROOT = null;
const rootDir = () => (ROOT ??= mkdtempSync(join(tmpdir(), 'dreamer-bench-test-')));
after(() => { if (ROOT) rmSync(ROOT, { recursive: true, force: true }); });
const scratch = (name) => {
  const dir = join(rootDir(), name ?? `s${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

test('fixtures are deterministic and held-out', () => {
  for (const fixture of FIXTURES) {
    const hash = fixtureHash(fixture);
    assert.equal(fixtureHash(fixture), hash);
    for (const other of FIXTURES) if (other !== fixture) assert.notEqual(fixtureHash(other), hash);
    // grading answers must not appear in the task prompt
    const prompt = fixture.taskPrompt;
    assert.ok(prompt.length < 800);
    for (const forbidden of ['docs/releases/1.2.md', '9156', 'docs/summary-', '## Planned', '## Deferred']) {
      assert.equal(prompt.includes(forbidden), false, `${fixture.id} prompt leaks ${forbidden}`);
    }
    assert.ok(fixture.scaffold['README.md'].includes(fixture.id ?? 'benchmark scaffold') || fixture.scaffold['README.md'].length > 0);
    assert.ok(fixture.dreamTopic.length > 5);
  }
  assert.deepEqual(TASKS, ['release-note', 'impact-table', 'local-endpoints']);
  assert.deepEqual(MODES, ['none', 'sources', 'forward-notes', 'dreamed-notes', 'dreamed-index']);
});

test('fixture hash covers scaffold and dreamTopic', () => {
  const fixture = FIXTURES[2];
  const mutated = { ...fixture, scaffold: { ...fixture.scaffold, 'connector/env.toml': '[ports]\nport_offset = 9\n' } };
  assert.notEqual(fixtureHash(mutated), fixtureHash(fixture));
  const retopiced = { ...fixture, dreamTopic: 'other' };
  assert.notEqual(fixtureHash(retopiced), fixtureHash(fixture));
});

test('graders accept variant-correct outputs and reject wrong or missing ones', () => {
  for (const fixture of FIXTURES) {
    const samples = CHECKSamples[fixture.verifier];
    assert.ok(samples.correct.length >= 1, `${fixture.id} has correct samples`);
    assert.ok(samples.wrong.length >= 1, `${fixture.id} has wrong samples`);
    const root = scratch();
    for (const text of samples.correct) {
      const workspace = join(scratch(), 'correct');
      writeArtifacts(workspace, text);
      const verdict = verifyFixture(fixture, workspace);
      assert.deepEqual(verdict, { pass: true, failures: [] }, `${fixture.id} correct sample rejected: ${verdict.failures}`);
    }
    for (const text of samples.wrong) {
      const workspace = join(scratch(), 'wrong');
      writeArtifacts(workspace, text);
      const verdict = verifyFixture(fixture, workspace);
      assert.equal(verdict.pass, false, `${fixture.id} wrong sample accepted`);
      assert.ok(verdict.failures.length > 0);
    }
    // missing-artifact rejection: empty workspace, and deletion after a correct write.
    const workspace = join(scratch(), 'missing');
    mkdirSync(workspace, { recursive: true });
    assert.equal(verifyFixture(fixture, workspace).pass, false);
  }
});

function writeArtifacts(workspace, blockText) {
  if (!existsSync(workspace)) mkdirSync(workspace, { recursive: true });
  for (const block of blockText.split(/\n(?=[\w./-]+\.\w+:)/)) {
    const match = block.match(/^([\w./-]+\.\w+):\s*\n/);
    if (match) {
      const path = join(workspace, match[1]);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, block.replace(/^[\w./-]+\.\w+:\s*\n/, ''));
    }
  }
}

test('computed grading derives expected values from the immutable fixture scaffold (task 3)', () => {
  const fixture = FIXTURES.find(item => item.id === 'local-endpoints');
  // offset lives in the fixture scaffold (env.toml there sets port_offset = 6 -> 9156)
  assert.equal(pigeonExpectation(fixture).endpoint, 'http://127.0.0.1:9156/metrics');
  const variants = [['6', 9156], ['40', 9190], ['0', 9150]];
  for (const [offset, expectedPort] of variants) {
    const mutated = { ...fixture, scaffold: { ...fixture.scaffold, 'connector/env.toml': `[ports]\nport_offset = ${offset}\n` } };
    assert.equal(pigeonExpectation(mutated).endpoint, `http://127.0.0.1:${expectedPort}/metrics`);
    const root = scratch();
    const workspace = join(root, 'ws');
    writeArtifacts(workspace, `connector/run/local.json:\n{\n  "metricsEndpoint": "http://127.0.0.1:${expectedPort}/metrics",\n  "buildCache": "/var/cache/pigeon/build",\n  "configDir": "/etc/pigeon/conf"\n}\n`);
    assert.deepEqual(verifyFixture(mutated, workspace), { pass: true, failures: [] }, `offset ${offset}`);
  }
  // applying the offset wrongly, or the unoffset base, must grade false under the real fixture
  const workspace = scratch();
  writeArtifacts(workspace, 'connector/run/local.json:\n{"metricsEndpoint": "http://127.0.0.1:9150/metrics", "buildCache": "/var/cache/pigeon/build", "configDir": "/etc/pigeon/conf"}\n');
  assert.equal(verifyFixture(fixture, workspace).pass, false, 'unoffset base rejected');
});

test('mode seeding exposes different memory scopes', () => {
  const fixture = FIXTURES[0];
  const root = scratch();
  const shapes = { none: null, sources: { sources: true }, 'forward-notes': { sources: true, notes: true }, 'dreamed-notes': { sources: true, notes: true }, 'dreamed-index': { sources: true, notes: true } };
  for (const mode of MODES) {
    const workspace = join(root, mode);
    mkdirSync(workspace, { recursive: true });
    const dbPath = join(workspace, '.pi', 'dreamer', 'memory.sqlite');
    const seeded = seedMemoryStore(dbPath, fixture, shapes[mode]);
    if (mode === 'none') {
      assert.equal(existsSync(dbPath), false, `${mode} must not create the store`);
      assert.equal(seeded, null);
      continue;
    }
    assert.ok(seeded.sources > 0);
    const store = new MemoryStore(dbPath);
    try {
      const notes = store.searchNotes('release ritual');
      if (shape(mode) === 'sources') {
        assert.deepEqual(notes, [], `${mode} must not expose forward notes`);
      } else {
        assert.ok(store.searchNotes('Release ritual').length >= 1, `${mode} seeds notes`);
        const note = notes[0];
        // stale note citations only include historical evidence that existed when it was written.
        for (const sourceId of note.sourceIds) {
          const source = store.getSource(sourceId);
          assert.ok(fixture.history.some(entry => entry.entryId === source.entryId));
        }
      }
    } finally { store.close(); }
    rmSync(workspace, { recursive: true, force: true });
  }
});

const shape = mode => (mode === 'sources' ? 'sources' : 'notes');

test('phase events parsing exposes session, error and usage fields without prose parsing', () => {
  const stdout = [
    JSON.stringify({ type: 'session', id: 'sess-1', cwd: '/' }),
    JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'working' }], usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { total: 0.02 } }, stopReason: 'toolUse' } }),
    JSON.stringify({ type: 'tool_execution_start', toolName: 'dreamer_note', args: { action: 'search' } }),
    JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'done' }], usage: { input: 8, output: 4, cacheRead: 1, cacheWrite: 2, totalTokens: 15, cost: { total: 0.01 } }, stopReason: 'stop' } }),
  ].join('\n');
  const events = parsePiEvents(stdout, '');
  assert.equal(events.sessionId, 'sess-1');
  assert.deepEqual(events.usage, { input: 18, output: 9, cacheRead: 1, cacheWrite: 2, totalTokens: 30 });
  assert.deepEqual(events.cost, { total: 0.03 });
  assert.deepEqual(events.errors, []);
  assert.equal(events.assistantText, 'done');
  assert.ok(events.toolCalls.some(call => call.toolName === 'dreamer_note'));

  const failing = parsePiEvents([
    JSON.stringify({ type: 'session', id: 'sess-2' }),
    JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [], stopReason: 'error', errorMessage: 'boom' } }),
  ].join('\n'), '');
  assert.deepEqual(failing.errors, ['boom']);
  const empty = parsePiEvents('not json at all\n{"type":"unknown"}\n', '');
  assert.equal(empty.usage, null);
  assert.equal(empty.cost, null);
  assert.equal(empty.sessionId, null);

  // usage without reportable cost: cost stays unknown, never zero
  const noCost = parsePiEvents([JSON.stringify({ type: 'session', id: 's3' }),
    JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [], stopReason: 'stop',
      usage: { input: 4, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 6 } } })].join('\n'), '');
  assert.deepEqual(noCost.usage, { input: 4, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 6 });
  assert.equal(noCost.cost, null);

  // partial usage fields are never zero-filled
  const partial = parsePiEvents([JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [], stopReason: 'stop',
    usage: { input: 5 } } })].join('\n'), '');
  assert.deepEqual(partial.usage, { input: 5, output: null, cacheRead: null, cacheWrite: null, totalTokens: null });
  assert.equal(partial.cost, null);

  // one call without a billed cost makes the whole phase cost unknown
  const mixed = parsePiEvents([
    JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [], stopReason: 'stop',
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { total: 0.5 } } } }),
    JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [], stopReason: 'stop',
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 } } }),
  ].join('\n'), '');
  assert.deepEqual(mixed.usage, { input: 2, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 4 });
  assert.equal(mixed.cost, null);
});

test('trial runs complete each mode workflow and persist reports (fake executor)', async () => {
  const root = scratch();
  const outDir = join(root, 'run');
  const summary = await runSweep({ outDir, executor: fakeExecutor(), repeats: 2, modes: [...MODES], provider: null, model: null, phaseTimeoutMs: 5000, live: false });
  assert.equal(summary.selfCheck, true);
  const expectedTrials = FIXTURES.length * MODES.length * 2;
  const report = JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8'));
  assert.equal(report.trials.length, expectedTrials);
  for (const trial of report.trials) {
    assert.ok(['success', 'verifier-failed', 'phase-error', 'timeout', 'error'].includes(trial.outcome));
    // usage must be unknown (null) when the harness's phase executor cannot supply it.
    if (trial.dream) assert.equal(trial.dream.usage, null);
    if (trial.dream) assert.equal(trial.dream.errors.length, 0, 'default fake executor succeeds');
  }
  // paired samples exist for every non-none mode when matching repeats exist.
  const paired = summary.aggregate.pairedDifferences;
  assert.equal(paired.length, FIXTURES.length * (MODES.length - 1) * 2);
  assert.ok(paired.every(entry => typeof entry.delta === 'number'));
  assert.ok(existsSync(join(outDir, 'summary.json')));
});

test('failed phases still count in the denominator and outcome maps to phase-error', async () => {
  const root = scratch();
  const failExec = { run: (context) => fakeExecutor({ failures: ['solve'] }).run(context) };
  const outDir = join(root, 'run');
  const summary = await runSweep({ outDir, executor: failExec, repeats: 1, modes: ['none', 'forward-notes'], tasks: ['release-note'], provider: null, model: null, live: false });
  const report = JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8'));
  assert.equal(report.trials.length, 2, 'all requested trials recorded');
  for (const trial of report.trials) assert.equal(trial.outcome, 'phase-error');
  const expectedRate = summary.aggregate.byMode['none'].successRate;
  assert.equal(expectedRate, 0, 'failed solve never inflates success');
});

test('dream timeout outcome remains recorded and counted', async () => {
  const root = scratch();
  const outDir = join(root, 'ban');
  const timeoutExec = { run: context => context.kind === 'dream' ? { ...fakeExecOk(context), timedOut: true, errors: ['synthetic timeout'] } : fakeExecOk(context) };
  const summary = await runSweep({ outDir, executor: timeoutExec, repeats: 1, modes: ['dreamed-notes', 'sources'], provider: null, model: null, live: false });
  const report = JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8'));
  const timed = report.trials.find(trial => trial.mode === 'dreamed-notes');
  assert.equal(timed.outcome, 'phase-error');
  assert.ok(timed.dream.timedOut);
  assert.equal(summary.aggregate.byMode['dreamed-notes'].success, 0);
});
function fakeExecOk(context) {
  return { argv: [], sessionId: 'fake', exitCode: 0, timedOut: false, error: null, durationMs: 1,
    usage: null, cost: null, toolCalls: [], assistantText: 'ok', transcript: {} };
}

test('runTrial builds mode-specific workspaces deterministically', async () => {
  const root = scratch();
  for (const mode of ['none', 'dreamed-index']) {
    const trialDir = join(root, mode);
    const fixture = FIXTURES[2];
    const config = { provider: 'p', model: 'm', thinkingLevel: 'low', phaseTimeoutMs: 1000, piBin: process.env.PI_BIN ?? 'pi', extensionPath: '/dev/null/index.ts' };
    const trial = await runTrial({ fixture, mode, repeat: 1, trialDir, config, executor: fakeExecutor() });
    assert.equal(trial.seeded === null, mode === 'none');
    const workspace = join(trialDir, 'workspace');
    assert.ok(existsSync(join(workspace, 'README.md')));
    assert.ok(existsSync(join(workspace, 'connector', 'env.toml')));
    if (mode === 'dreamed-index') {
      const indexFile = join(workspace, 'dreamer-index.md');
      assert.ok(existsSync(indexFile), 'dreamed-index writes the preloaded index file');
      assert.ok(readFileSync(indexFile, 'utf8').includes('Preloaded memory index'));
    }
  }
});

test('dream and solve costs are reported separately, and total only when both known', async () => {
  const root = scratch();
  const okExec = { run: async context => {
    const result = await fakeExecutor().run(context); // reuse the real offline solve artifacts
    const cost = { total: context.kind === 'dream' ? 0.5 : 0.25 };
    return { ...result, cost, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 } };
  } };
  const outDir = join(root, 'run');
  const summary = await runSweep({ outDir, executor: okExec, repeats: 1, modes: ['dreamed-notes', 'sources'], tasks: ['release-note'], provider: null, model: null, live: false });
  const report = JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8'));
  const dreamed = report.trials.find(trial => trial.mode === 'dreamed-notes');
  const sources = report.trials.find(trial => trial.mode === 'sources');
  assert.deepEqual(dreamed.dream.cost, { total: 0.5 });
  assert.deepEqual(dreamed.solve.cost, { total: 0.25 });
  assert.deepEqual(dreamed.totalCost, { total: 0.75 });
  assert.deepEqual(sources.totalCost, { total: 0.25 }); // solve-only phase: no dreaming cost involved
  assert.equal(summary.aggregate.byMode['dreamed-notes'].successRate, 1);

  // one phase cost unknown -> total unknown
  const partialExec = { run: async context => {
    const ok = await okExec.run(context);
    return { ...ok, cost: context.kind === 'dream' ? null : ok.cost };
  } };
  const outDir2 = join(root, 'run2');
  await runSweep({ outDir: outDir2, executor: partialExec, repeats: 1, modes: ['dreamed-notes'], tasks: ['release-note'], provider: null, model: null, live: false });
  const dreamed2 = JSON.parse(readFileSync(join(outDir2, 'report.json'), 'utf8')).trials[0];
  assert.deepEqual(dreamed2.dream.cost, null);
  assert.equal(dreamed2.totalCost, null);
});

test('null or nonzero phase exit codes count as phase errors', async () => {
  const root = scratch();
  const exitNull = { run: context => context.kind === 'dream' ? { ...fakeExecOk(context), exitCode: null } : fakeExecOk(context) };
  const outDir = join(root, 'run');
  await runSweep({ outDir, executor: exitNull, repeats: 1, modes: ['dreamed-notes'], tasks: ['release-note'], provider: null, model: null, live: false });
  const trial = JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8')).trials[0];
  assert.equal(trial.outcome, 'phase-error');
  assert.equal(trial.dream.exitCode, null);

  const exitFail = { run: context => ({ ...fakeExecOk(context), exitCode: context.kind === 'solve' ? 3 : 0 }) };
  const outDir2 = join(root, 'run2');
  await runSweep({ outDir: outDir2, executor: exitFail, repeats: 1, modes: ['sources'], tasks: ['release-note'], provider: null, model: null, live: false });
  const trial2 = JSON.parse(readFileSync(join(outDir2, 'report.json'), 'utf8')).trials[0];
  assert.equal(trial2.outcome, 'phase-error');
});

test('sweep refuses to reuse a nonempty out directory', async () => {
  const root = scratch();
  const outDir = join(root, 'busy');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'keep-me.txt'), 'from a previous run');
  await assert.rejects(() => runSweep({ outDir, executor: fakeExecutor(), repeats: 1, modes: ['none'], tasks: ['release-note'], provider: null, model: null, live: false }), /not empty/);
  const run = spawnSync(process.execPath, [join(process.cwd(), 'benchmark', 'run.js'), '--out', outDir, '--repeats', '1', '--modes', 'none'], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /not empty/);
  assert.ok(existsSync(join(outDir, 'keep-me.txt')));
});

test('aggregation separates modes and pairs repeats against baseline', () => {
  const trials = [
    { mode: 'none', fixtureId: 'release-note', repeat: 1, outcome: 'verifier-failed' },
    { mode: 'sources', fixtureId: 'release-note', repeat: 1, outcome: 'success' },
    { mode: 'sources', fixtureId: 'release-note', repeat: 2, outcome: 'success' },
    { mode: 'none', fixtureId: 'impact-table', repeat: 1, outcome: 'phase-error' },
    { mode: 'sources', fixtureId: 'impact-table', repeat: 1, outcome: 'phase-error' },
  ];
  const summary = aggregate(trials);
  assert.deepEqual(summary.byMode.sources, { trials: 3, success: 2, successRate: 2 / 3 });
  assert.deepEqual(summary.byMode.none, { trials: 2, success: 0, successRate: 0 });
  assert.equal(summary.byTask['sources'] ?? undefined, undefined);
  assert.equal(summary.byTask['task:release-note'].trials, 3);
  const paired = summary.pairedDifferences.filter(entry => entry.mode === 'sources');
  // repeat 2 has no matching none repeat, so only 2 pairs are compared.
  assert.deepEqual(paired.map(entry => entry.delta), [1, 0]);
});

test('run.js validates arguments and exits 2 on bad input', () => {
  const run = spawnSync(process.execPath, [join(process.cwd(), 'benchmark', 'run.js'), '--repeats', '0'], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  const live = spawnSync(process.execPath, [join(process.cwd(), 'benchmark', 'run.js'), '--live', '--model', 'anything'], { encoding: 'utf8' });
  assert.equal(live.status, 2);
});

test('implementation hash is stable', () => {
  const a = implementationHash();
  const b = implementationHash();
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});
