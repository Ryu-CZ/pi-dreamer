import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MemoryStore } from '../src/store.js';
import { runDeploymentSweep, PHASE_SETTINGS } from '../benchmark/deployment-sweep.js';

const scratch = t => { const path = mkdtempSync(join(tmpdir(), 'dreamer-deployment-sweep-')); t.after(() => rmSync(path, { recursive: true, force: true })); return join(path, 'run'); };
const config = outDir => ({ outDir, provider: 'offline-fixture', model: 'scripted', repeats: 1 });
const database = context => join(context.workspace, '.pi/dreamer/memory.sqlite');
const sql = (context, statement) => { const db = new DatabaseSync(database(context)); try { db.exec(statement); } finally { db.close(); } };
const writeArtifacts = context => {
  mkdirSync(join(context.workspace, 'deploy'));
  const files = context.task === 'main' ? {
    'api-blue.json': { service: 'api-blue', replicas: 2, metricsEndpoint: 'http://127.0.0.1:9467/metrics', imagePolicy: 'digest' },
    'worker-queue.json': { service: 'worker-queue', replicas: 1, metricsEndpoint: 'http://127.0.0.1:9473/metrics', imagePolicy: 'digest' },
    'evidence.json': {
      'api-blue': { replicas: ['R7'], metricsEndpoint: ['R6'], imagePolicy: ['R5'] },
      'worker-queue': { replicas: ['R7'], metricsEndpoint: ['R6'], imagePolicy: ['R5'] },
    },
  } : { 'registry.json': { registry: 'registry.rook.invalid', sourceIds: ['R6'] } };
  for (const [name, value] of Object.entries(files)) writeFileSync(join(context.workspace, 'deploy', name), JSON.stringify(value));
};
const executor = hook => ({ run: async context => {
  if (context.kind === 'solve') writeArtifacts(context);
  const override = await hook?.(context);
  return override ?? { exitCode: 0, timedOut: false, error: null, durationMs: 1, cost: { total: context.kind === 'dream' ? 6 : 1 }, usage: null };
} });

test('shared-dream sweep bounds calls, rotates order, isolates copies and accounts dream once', async t => {
  const observed = [];
  const report = await runDeploymentSweep({ ...config(scratch(t)), repeats: 3, executor: executor(context => {
    observed.push([context.repeat, context.arm, context.kind, context.task]);
    assert.equal(readFileSync(join(context.workspace, '.pi/settings.json'), 'utf8'), PHASE_SETTINGS);
    assert.ok(context.argv.includes('--approve')); assert.ok(context.argv.includes('--offline'));
    assert.ok(context.argv.includes('--no-mcp')); assert.ok(context.argv.includes('--no-context-files'));
    const tools = context.argv[context.argv.indexOf('--tools') + 1];
    assert.equal(tools, context.kind === 'dream' ? 'dreamer_source,dreamer_note' : 'read,bash,edit,write,dreamer_source,dreamer_note');
    if (context.kind === 'dream') {
      assert.deepEqual(readdirSync(context.workspace), ['.pi']);
      for (const future of ['api-blue', 'worker-queue', 'offset 7', 'evidence sidecar']) assert.equal(context.argv.join(' ').includes(future), false);
      const store = new MemoryStore(database(context));
      try {
        const note = store.searchNotes('policy')[0];
        store.reviseNote({ id: note.id, expectedVersion: 1, text: 'Synthetic history-only revision.', reason: 'Offline lifecycle check.', sourceIds: note.sourceIds });
      } finally { store.close(); }
    }
  }) });
  assert.equal(report.fatal, null);
  assert.equal(observed.length, 21);
  assert.equal(report.phases.filter(phase => phase.kind === 'dream').length, 3);
  assert.deepEqual(report.blocks.map(block => block.order.join('')), ['SND', 'NDS', 'DSN']);
  assert.deepEqual(report.blocks.map(block => block.taskOrder[0]), ['main', 'diagnostic', 'main']);
  assert.ok(report.summary.every(group => group.trials === 3 && group.joint === 3));
  for (const block of report.blocks) {
    assert.equal(block.mapping.length, 8);
    const sources = block.dream.before.sources;
    assert.equal(sources[0].timestamp, '2026-06-01T09:01:00.000Z');
    for (const exposure of report.exposures.filter(item => item.repeat === block.repeat)) assert.deepEqual(exposure.clone.sources, sources);
    const copies = report.exposures.filter(item => item.repeat === block.repeat && item.arm === 'D');
    assert.equal(copies[0].clone.hash, block.dream.after.hash);
    assert.equal(copies[1].clone.hash, block.dream.after.hash);
    assert.equal(copies[0].clone.revisions.length, 5);
  }
  assert.ok(report.costs.filter(row => row.arm === 'D').every(row => row.dream === 6 && row.solves === 2 && row.cumulative === 8 && row.dreamPerTask === 3));
  assert.ok(report.costs.filter(row => row.arm !== 'D').every(row => row.cumulative === 2));
});

test('dream source mutations and malformed stores invalidate both exposures without solve calls', async t => {
  const mutations = [
    context => sql(context, "UPDATE sources SET text='changed' WHERE entryId='R1'"),
    context => sql(context, "UPDATE sources SET timestamp='changed' WHERE entryId='R1'"),
    context => sql(context, "DELETE FROM sources WHERE entryId='R8'"),
    context => sql(context, "INSERT INTO sources SELECT 'extra','new-session','extra','user','extra','2026',NULL,NULL"),
    context => writeFileSync(database(context), 'corrupt SQLite'),
    context => rmSync(database(context)),
    context => writeFileSync(database(context) + '-wal', 'unresolved'),
  ];
  for (const mutate of mutations) {
    const report = await runDeploymentSweep({ ...config(scratch(t)), executor: executor(context => { if (context.kind === 'dream') mutate(context); }) });
    const dreamed = report.exposures.filter(item => item.arm === 'D');
    assert.ok(dreamed.every(item => item.outcome === 'dream-failed' && item.reason === 'integrity-error' && !item.solve.ran && !item.joint));
    assert.equal(report.phases.length, 5);
    assert.equal(report.summary.find(row => row.arm === 'D' && row.task === 'main').trials, 1);
  }
});

test('phase exceptions/timeouts/config mutation retain failures and unknown cost', async t => {
  const faults = [
    () => { throw new Error('injected throw'); },
    () => ({ exitCode: null, timedOut: true, cost: null }),
    context => { writeFileSync(join(context.workspace, '.pi/settings.json'), '{}'); },
    context => { writeFileSync(join(context.workspace, '.pi/APPEND_SYSTEM.md'), 'unexpected'); },
  ];
  for (const fault of faults) {
    const report = await runDeploymentSweep({ ...config(scratch(t)), executor: executor(context => { if (context.kind === 'dream') return fault(context); }) });
    assert.ok(report.exposures.filter(item => item.arm === 'D').every(item => item.outcome === 'dream-failed'));
    assert.equal(report.phases.length, 5);
  }
  const unknown = await runDeploymentSweep({ ...config(scratch(t)), executor: executor(() => ({ exitCode: 0, timedOut: false, cost: null })) });
  assert.ok(unknown.costs.every(row => row.cumulative === null));
});

test('solve mutation affects only isolated exposure and symlinks are not read', async t => {
  for (const fault of [
    context => sql(context, "UPDATE sources SET role='assistant' WHERE entryId='R1'"),
    context => { rmSync(join(context.workspace, 'deploy'), { recursive: true }); symlinkSync(tmpdir(), join(context.workspace, 'deploy')); },
    () => { throw new Error('solve error'); },
  ]) {
    const report = await runDeploymentSweep({ ...config(scratch(t)), executor: executor(context => {
      if (context.kind === 'solve' && context.arm === 'N' && context.task === 'main') return fault(context);
    }) });
    assert.equal(report.exposures.filter(item => item.joint).length, 5);
    assert.notEqual(report.exposures.find(item => item.arm === 'N' && item.task === 'main').outcome, 'success');
    assert.equal(report.fatal, null);
  }
});

test('output and phase workspace symlinks are rejected without traversing targets', async t => {
  const outDir = scratch(t);
  const target = scratch(t);
  mkdirSync(target, { recursive: true });
  symlinkSync(target, outDir);
  let calls = 0;
  await assert.rejects(() => runDeploymentSweep({ ...config(outDir), executor: executor(() => { calls++; }) }), /not a regular directory/);
  assert.equal(calls, 0);
  assert.deepEqual(readdirSync(target), []);
  const report = await runDeploymentSweep({ ...config(scratch(t)), executor: executor(context => {
    if (context.kind === 'solve' && context.arm === 'S' && context.task === 'main') {
      rmSync(context.workspace, { recursive: true });
      symlinkSync(target, context.workspace);
    }
  }) });
  const exposure = report.exposures.find(item => item.arm === 'S' && item.task === 'main');
  assert.equal(exposure.solve.failure, 'integrity-error');
  assert.match(exposure.solve.error, /not a regular directory/);
  assert.equal(exposure.joint, false);
  assert.deepEqual(readdirSync(target), []);
  assert.equal(report.exposures.filter(item => item.joint).length, 5);
});

test('argument/output guards and infrastructure failures preserve planned denominators', async t => {
  const outDir = scratch(t);
  await assert.rejects(() => runDeploymentSweep(config(outDir)), /executor/);
  await assert.rejects(() => runDeploymentSweep({ ...config(outDir), repeats: 4, executor: executor() }), /repeats/);
  await runDeploymentSweep({ ...config(outDir), executor: executor() });
  await assert.rejects(() => runDeploymentSweep({ ...config(outDir), executor: executor() }), /empty/);
  const fatal = await runDeploymentSweep({ ...config(scratch(t)), repeats: 2, executor: executor(context => {
    if (context.arm === 'S' && context.task === 'main') {
      // Destroy a future baseline outside the phase; continuation cannot be trusted.
      const seedPath = join(context.workspace, '../../../seeds/N/.pi/dreamer/memory.sqlite');
      rmSync(seedPath);
    }
  }) });
  assert.ok(fatal.fatal);
  assert.equal(fatal.exposures.length, 12);
  assert.ok(fatal.exposures.some(item => item.outcome === 'infrastructure-error'));
  assert.equal(fatal.summary.reduce((count, group) => count + group.trials, 0), 12);
});
