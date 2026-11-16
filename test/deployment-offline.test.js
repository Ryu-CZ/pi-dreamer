import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = t => { const path = mkdtempSync(join(tmpdir(), 'dreamer-deployment-cli-')); t.after(() => rmSync(path, { recursive: true, force: true })); return path; };
const guard = `import child from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module';
const deny=()=>{throw new Error('backend call forbidden in offline check')};
for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])child[key]=deny;
syncBuiltinESMExports(); globalThis.fetch=deny;`;
const run = args => spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(guard)}`, 'benchmark/deployment-offline.js', ...args], { encoding: 'utf8', timeout: 10000 });

test('offline command retains a labelled report without backend subprocesses or fetch', t => {
  const out = join(root(t), 'run');
  const result = run(['--out', out]);
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.realModelCalls, 0); assert.equal(summary.scriptedInvocations, 21);
  assert.equal(summary.successful, 18); assert.equal(summary.planned, 18);
  assert.match(summary.label, /not memory-quality evidence/);
  const reportPath = join(out, 'report.json');
  const saved = readFileSync(reportPath, 'utf8');
  const report = JSON.parse(saved);
  assert.equal(report.check.realModelCalls, 0);
  assert.equal(report.phases.length, 21);
  assert.ok(report.phases.every(phase => phase.result.usage === null && phase.result.cost === null && phase.result.durationMs === null));
  assert.ok(report.costs.every(cost => cost.cumulative === null));
  assert.equal(report.exposures.filter(exposure => exposure.joint).length, 18);
  assert.notEqual(run(['--out', out]).status, 0);
  assert.equal(readFileSync(reportPath, 'utf8'), saved);
});

test('offline command rejects missing output and all unapproved switches', t => {
  const path = root(t);
  for (const args of [[], ['--out', ''], ['--out', join(path, 'live'), '--live'], ['--provider', 'x'], ['--model', 'x'], ['--repeats', '1'], ['positional']]) {
    assert.notEqual(run(args).status, 0, JSON.stringify(args));
  }
  assert.deepEqual(readdirSync(path), []);
  assert.equal(run(['--help']).status, 0);
});
