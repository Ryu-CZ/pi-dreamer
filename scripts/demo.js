// Deterministic storage demonstration; no LLM or external service.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore } from '../src/store.js';

const root = mkdtempSync(join(tmpdir(), 'pi-dreamer-demo-'));
const path = join(root, 'memory.sqlite');
let store = new MemoryStore(path);
try {
  const hypothesis = store.captureSource({ sessionId: 'synthetic-session', entryId: 'hypothesis',
    role: 'assistant', text: 'I think the service uses port 4318.', timestamp: '2026-01-01T10:00:00Z' });
  const observation = store.captureSource({ sessionId: 'synthetic-session', entryId: 'command-result',
    role: 'toolResult', toolName: 'bash', isError: false,
    text: 'Synthetic command output: service listens on port 4317.', timestamp: '2026-01-01T10:01:00Z' });
  const note = store.createNote({ title: 'Service port', kind: 'hypothesis',
    text: 'Service port is 4318.', sourceIds: [hypothesis.id] });
  console.log('FORWARD: wrote a hypothesis, version 1: port 4318.');
  assert.match(store.searchSources('4317')[0].text, /4317/);
  const original = store.getSource(observation.id);
  console.log(`BACKWARD: reopened original evidence: ${original.text}`);
  store.reviseNote({ id: note.id, expectedVersion: 1, text: 'Observed service port: 4317.',
    reason: 'The command observation contradicts the initial hypothesis.', sourceIds: [original.id] });
  store.close();
  store = new MemoryStore(path);
  assert.equal(store.searchNotes('4318').length, 0);
  assert.equal(store.searchNotes('4317')[0].version, 2);
  assert.equal(store.history(note.id).length, 2);
  console.log('FUTURE: reopened store retrieves corrected version 2; version 1 remains in history.');
  console.log('PASS: deterministic data-flow demonstration; not a model-quality benchmark.');
} finally {
  store.close();
  rmSync(root, { recursive: true, force: true });
}
