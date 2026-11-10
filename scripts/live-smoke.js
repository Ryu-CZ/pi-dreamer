// Opt-in real-model check. Sends ONLY synthetic fixture data to the selected Pi provider.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { MemoryStore } from '../src/store.js';

if (!process.argv.includes('--run')) {
  console.error('Opt-in required: node scripts/live-smoke.js --run\nUses your configured Pi credentials; sends synthetic data to openai-codex/gpt-6.1-sol by default.');
  process.exit(2);
}
const root = mkdtempSync(join(tmpdir(), 'dreamer-live-'));
const cwd = join(root, 'project');
mkdirSync(cwd, { mode: 0o700 });
const dbPath = join(cwd, '.pi/dreamer/memory.sqlite');
const extension = fileURLToPath(new URL('../src/index.ts', import.meta.url));
const provider = process.env.DREAMER_TEST_PROVIDER || 'openai-codex';
const model = process.env.DREAMER_TEST_MODEL || 'gpt-6.1-sol';
let store = new MemoryStore(dbPath);
let success = false;
try {
  const hypothesis = store.captureSource({ sessionId: 'synthetic', entryId: 'hypothesis', role: 'assistant',
    text: 'Synthetic service port hypothesis: I guess the service uses 4318, but I have not checked.', timestamp: '2026-01-01T10:00:00Z' });
  const evidence = store.captureSource({ sessionId: 'synthetic', entryId: 'observation', role: 'toolResult', toolName: 'bash', isError: false,
    text: 'Synthetic service port observation: command output reports listening on 127.0.0.1:4317.', timestamp: '2026-01-01T10:01:00Z' });
  const note = store.createNote({ title: 'Service port', kind: 'hypothesis', text: 'The service port is 4318.', sourceIds: [hypothesis.id] });
  store.close();
  const base = ['--no-extensions', '--no-mcp', '--no-skills', '--no-prompt-templates', '--no-context-files',
    '--no-themes', '-e', extension, '--tools', 'dreamer_source,dreamer_note', '--provider', provider,
    '--model', model, '--thinking', 'low', '--session-dir', join(root, 'sessions'), '--mode', 'json',
    '--system-prompt', 'You are testing pi-dreamer on synthetic data. Use only its memory tools. Inspect evidence, not assumptions. Be concise.', '-p'];
  function run(prompt, label) {
    const result = spawnSync('pi', [...base, prompt], { cwd, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
    writeFileSync(join(root, `${label}.jsonl`), result.stdout || '', { mode: 0o600 });
    writeFileSync(join(root, `${label}.stderr`), result.stderr || '', { mode: 0o600 });
    assert.equal(result.status, 0, `${label} failed: ${result.error?.message || result.stderr}`);
    return (result.stdout || '').split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
  }
  const dreamEvents = run('/dream Service port', 'dream');
  store = new MemoryStore(dbPath);
  const corrected = store.getNote(note.id);
  assert.ok(corrected.version > 1, 'real model persisted a revision');
  assert.match(corrected.text, /4317/);
  assert.ok(corrected.sourceIds.includes(evidence.id), 'revision cites the original observation');
  assert.ok(corrected.reason.trim());
  assert.equal(store.history(note.id)[0].text, note.text);
  const calls = dreamEvents.filter(e => e.type === 'tool_execution_start');
  assert.ok(calls.some(e => e.toolName === 'dreamer_source' && e.args?.action === 'search'), 'model searched captured sources');
  assert.ok(calls.some(e => e.toolName === 'dreamer_source' && e.args?.action === 'read' && e.args?.id === evidence.id), 'model opened original observation');
  const recallEvents = run('Search project memory for Service port. What port was observed? Answer from the stored note, not from assumptions. Do not modify memory.', 'recall');
  const messages = recallEvents.filter(e => e.type === 'message_end').map(e => e.message);
  const answer = messages.filter(m => m?.role === 'assistant').at(-1)?.content?.filter(c => c.type === 'text').map(c => c.text).join('\n');
  assert.match(answer || '', /4317/);
  assert.ok(recallEvents.some(e => e.type === 'tool_execution_start' && e.toolName === 'dreamer_note' && e.args?.action === 'search'));
  success = true;
  console.log(JSON.stringify({ result: 'PASS', provider, model, revision: corrected.version,
    sourceOpened: true, newSessionAnswer: answer, note: 'One synthetic real-model trial, not a general quality benchmark.' }, null, 2));
} finally {
  store.close();
  if (success && !process.env.DREAMER_KEEP_LIVE_ARTIFACTS) rmSync(root, { recursive: true, force: true });
  else console.error(`Synthetic live-test artifacts retained at ${root}`);
}
