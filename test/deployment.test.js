import test from 'node:test';
import assert from 'node:assert/strict';
import { DEPLOYMENT_HISTORY, DEPLOYMENT_TASKS } from '../benchmark/deployment-fixture.js';
import { gradeDeployment } from '../benchmark/deployment-verifier.js';

// Explicit expected artifacts, independent of the evaluator's private oracle.
const correct = () => ({
  'deploy/api-blue.json': JSON.stringify({ service: 'api-blue', replicas: 2, metricsEndpoint: 'http://127.0.0.1:9467/metrics', imagePolicy: 'digest' }),
  'deploy/worker-queue.json': JSON.stringify({ service: 'worker-queue', replicas: 1, metricsEndpoint: 'http://127.0.0.1:9473/metrics', imagePolicy: 'digest' }),
  'deploy/evidence.json': JSON.stringify({
    'api-blue': { replicas: ['R2'], metricsEndpoint: ['R6'], imagePolicy: ['R5'] },
    'worker-queue': { replicas: ['R7'], metricsEndpoint: ['R6'], imagePolicy: ['R5'] },
  }),
});
const change = (files, path, edit) => { const value = JSON.parse(files[path]); edit(value); files[path] = JSON.stringify(value); return files; };

test('historical packet is chronological, attributed and separate from future inputs', () => {
  const packet = DEPLOYMENT_HISTORY;
  assert.equal(packet.history.length, 8);
  assert.equal(packet.forwardNotes.length, 4);
  const ids = packet.history.map(source => source.entryId);
  assert.deepEqual(ids, ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8']);
  const times = packet.history.map(source => source.timestamp);
  assert.deepEqual(times, [...times].sort());
  for (const source of packet.history) {
    assert.ok(source.text.startsWith(`[${source.entryId}]`));
    assert.ok(source.sessionId.startsWith('rook-'));
    if (source.role === 'toolResult') { assert.equal(source.isError, false); assert.equal(source.toolName, 'bash'); }
  }
  for (const note of packet.forwardNotes) for (const id of note.derivedFrom) assert.ok(ids.includes(id));
  assert.equal(packet.forwardNotes.some(note => note.derivedFrom.includes('R7')), false);
  assert.match(packet.history.find(source => source.entryId === 'R6').text, /http:\/\/127\.0\.0\.1:<base\+offset>\/metrics/);
  for (const future of ['api-blue', 'worker-queue', '9467', '9473', 'artifactFailures', 'sufficient']) {
    assert.equal(JSON.stringify(packet).includes(future), false, future);
  }
  assert.match(DEPLOYMENT_TASKS.main.taskPrompt, /nonempty arrays of unique/);
  assert.match(DEPLOYMENT_TASKS.main.taskPrompt, /exactly replicas, metricsEndpoint and imagePolicy/);
  assert.match(DEPLOYMENT_TASKS.diagnostic.taskPrompt, /exactly registry \(string\) and sourceIds \(array\)/);
});

test('main positives accept sufficient citation alternatives and serialization variants', () => {
  for (const labels of [['R2'], ['R5'], ['R7'], ['R2', 'R5'], ['R5', 'R7'], ['R2', 'R5', 'R7']]) {
    const files = change(correct(), 'deploy/evidence.json', evidence => {
      evidence['api-blue'].replicas = labels;
      evidence['api-blue'].metricsEndpoint = ['R3', 'R6'];
      evidence['worker-queue'].replicas = ['R2', 'R5', 'R7'];
      evidence['worker-queue'].imagePolicy = ['R2', 'R5'];
    });
    for (const path of Object.keys(files)) files[path] = JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(files[path])).reverse()), null, 2);
    assert.equal(gradeDeployment('main', files).joint, true);
  }
});

test('bad main artifacts cannot be rescued by valid evidence', () => {
  const mutations = [
    value => { value.metricsEndpoint = 'http://127.0.0.1:9407/metrics'; },
    value => { value.metricsEndpoint = 'http://127.0.0.1:9460/metrics'; },
    value => { value.imagePolicy = 'tag'; },
    value => { value.replicas = 5; },
    value => { value.replicas = '2'; },
    value => { value.extra = true; },
    value => { delete value.service; },
  ];
  const cases = mutations.map(edit => change(correct(), 'deploy/api-blue.json', edit));
  cases.push(change(correct(), 'deploy/worker-queue.json', value => { value.replicas = 2; }));
  const missing = correct(); delete missing['deploy/api-blue.json']; cases.push(missing);
  cases.push({ ...correct(), 'deploy/extra.json': '{}' });
  for (const raw of ['not json', 'null', '[]', '2']) cases.push({ ...correct(), 'deploy/api-blue.json': raw });
  for (const files of cases) {
    const result = gradeDeployment('main', files);
    assert.equal(result.artifact, false);
    assert.equal(result.evidence, true);
    assert.equal(result.joint, false);
  }
});

test('valid main artifacts cannot be rescued from bad attribution', () => {
  for (const labels of [[], ['R3'], ['R4'], ['R8'], ['unknown'], ['note-uuid'], ['R6', 'R6'], ['R6', 'R8'], 'R6', null, [6]]) {
    const result = gradeDeployment('main', change(correct(), 'deploy/evidence.json', evidence => { evidence['api-blue'].metricsEndpoint = labels; }));
    assert.equal(result.artifact, true);
    assert.equal(result.evidence, false, JSON.stringify(labels));
    assert.equal(result.joint, false);
  }
  for (const edit of [
    evidence => { evidence['worker-queue'].replicas = ['R2', 'R5']; },
    evidence => { evidence['api-blue'].imagePolicy = ['R2']; },
    evidence => { evidence['api-blue'].replicas = ['R6']; },
    evidence => { delete evidence['api-blue'].imagePolicy; },
    evidence => { evidence['api-blue'].extra = ['R5']; },
    evidence => { evidence.extra = {}; },
    evidence => { delete evidence['worker-queue']; },
  ]) assert.equal(gradeDeployment('main', change(correct(), 'deploy/evidence.json', edit)).evidence, false);
  for (const raw of [undefined, 'not json', 'null', '[]', '{}']) {
    const result = gradeDeployment('main', { ...correct(), 'deploy/evidence.json': raw });
    assert.equal(result.artifact, true);
    assert.equal(result.joint, false);
  }
});

test('diagnostic correctness and evidence remain separate from each other and main', () => {
  const grade = value => gradeDeployment('diagnostic', { 'deploy/registry.json': JSON.stringify(value) });
  for (const sourceIds of [['R3'], ['R6'], ['R3', 'R6']]) assert.equal(grade({ registry: 'registry.rook.invalid', sourceIds }).joint, true);
  const badValue = grade({ registry: 'wrong.invalid', sourceIds: ['R6'] });
  assert.equal(badValue.artifact, false); assert.equal(badValue.evidence, true); assert.equal(badValue.joint, false);
  for (const sourceIds of [[], ['R4'], ['R8'], ['R3', 'R3'], ['R3', 'unknown'], 'R3', null]) {
    const result = grade({ registry: 'registry.rook.invalid', sourceIds });
    assert.equal(result.artifact, true); assert.equal(result.evidence, false); assert.equal(result.joint, false);
  }
  assert.equal(grade({ registry: 'registry.rook.invalid', sourceIds: ['R3'], extra: 1 }).joint, false);
  for (const raw of [undefined, 'invalid', 'null', '[]']) assert.equal(gradeDeployment('diagnostic', { 'deploy/registry.json': raw }).joint, false);
  assert.equal(gradeDeployment('diagnostic', correct()).joint, false);
  for (const files of [null, [], undefined, 1]) assert.equal(gradeDeployment('main', files).joint, false);
  assert.equal(gradeDeployment('unknown', correct()).joint, false);
});
