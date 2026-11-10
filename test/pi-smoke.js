// Actual Pi extension loading + agent tool loop, with a scripted model and denied network.
// This verifies integration, NOT autonomous model reasoning quality.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { MemoryStore } from '../src/store.js';

process.env.PI_OFFLINE = '1';
let networkAttempts = 0;
globalThis.fetch = async () => { networkAttempts++; throw new Error('Network forbidden in Pi smoke test'); };
const sdkUrl = process.env.PI_SDK_ROOT
  ? pathToFileURL(join(resolve(process.env.PI_SDK_ROOT), 'dist/index.js')).href
  : import.meta.resolve('@earendil-works/pi-coding-agent');
const { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } = await import(sdkUrl);
const root = mkdtempSync(join(tmpdir(), 'dreamer-pi-smoke-'));
const cwd = join(root, 'project');
const agentDir = join(root, 'agent');
mkdirSync(cwd); mkdirSync(agentDir);
const extension = fileURLToPath(new URL('../src/index.ts', import.meta.url));
const model = {
  id: 'dreamer-scripted', name: 'Dreamer scripted fixture', provider: 'openai', api: 'openai-completions',
  baseUrl: 'https://invalid.invalid', reasoning: false, input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 32000, maxTokens: 4096,
};
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const assistant = content => ({ role: 'assistant', content, api: model.api, provider: model.provider,
  model: model.id, usage, stopReason: content.some(c => c.type === 'toolCall') ? 'toolUse' : 'stop', timestamp: Date.now() });
let callSequence = 0;
const call = (name, args) => assistant([{ type: 'toolCall', id: `call-${++callSequence}`, name, arguments: args }]);
const done = () => assistant([{ type: 'text', text: 'Fixture stage complete.' }]);
const lastResult = context => {
  const result = context.messages.filter(m => m.role === 'toolResult').at(-1);
  assert.ok(result, 'model sees a real tool result');
  assert.ok(!result.isError, JSON.stringify(result.content));
  return JSON.parse(result.content.filter(c => c.type === 'text').map(c => c.text).join('\n'));
};
const sessions = [];
const errors = [];
async function makeSession(manager) {
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
  const resourceLoader = new DefaultResourceLoader({ cwd, agentDir, settingsManager,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    additionalExtensionPaths: [extension], systemPrompt: 'Scripted extension integration test.' });
  await resourceLoader.reload();
  assert.deepEqual(resourceLoader.getExtensions().errors, []);
  const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'),
    modelsPath: null, modelsStorePath: join(agentDir, 'models-cache'), refreshOnCreate: false, allowModelNetwork: false });
  await modelRuntime.setRuntimeApiKey('openai', 'fixture-not-a-real-key');
  const { session } = await createAgentSession({ cwd, agentDir, model, modelRuntime, settingsManager,
    resourceLoader, sessionManager: manager, thinkingLevel: 'off', tools: ['dreamer_source', 'dreamer_note'] });
  sessions.push(session);
  await session.bindExtensions({ onError: event => errors.push(event) });
  assert.deepEqual(session.getActiveToolNames().sort(), ['dreamer_note', 'dreamer_source']);
  return session;
}
function script(session, steps) {
  let index = 0;
  session.agent.streamFunction = (_model, context) => {
    assert.ok(index < steps.length, 'no unexpected model requests');
    const message = steps[index++](context);
    return {
      async *[Symbol.asyncIterator]() { yield { type: 'done', reason: message.stopReason, message }; },
      async result() { return message; },
    };
  };
  return () => assert.equal(index, steps.length, 'all scripted model steps executed');
}

try {
  const manager = SessionManager.inMemory(cwd);
  const first = manager.appendMessage({ role: 'user', content: 'Synthetic service investigation.', timestamp: Date.now() });
  const sibling = manager.appendMessage({ role: 'user', content: 'SIBLING_PRIVATE_TEXT', timestamp: Date.now() });
  manager.branch(first);
  const evidenceEntry = manager.appendMessage({ role: 'toolResult', toolCallId: 'fixture-command', toolName: 'bash',
    content: [{ type: 'text', text: 'Service listens on port 4317.' }], isError: false, timestamp: Date.now() });
  const assistantEntry = manager.appendMessage(assistant([
    { type: 'thinking', thinking: 'HIDDEN_THINKING_DO_NOT_CAPTURE', thinkingSignature: 'PRIVATE_SIGNATURE' },
    { type: 'text', text: 'An initial hypothesis: service port is 4318.', textSignature: 'PRIVATE_TEXT_SIGNATURE' },
  ]));
  const session = await makeSession(manager);
  const dbPath = join(cwd, '.pi/dreamer/memory.sqlite');
  assert.equal(existsSync(dbPath), false, 'loading extension does not capture or create a database');
  let sourceId, hypothesisId, noteId, discoveredSourceId;
  let check = script(session, [
    () => call('dreamer_source', { action: 'branch' }),
    ctx => { assert.ok(!lastResult(ctx).some(s => s.entryId === sibling)); return call('dreamer_source', { action: 'capture', entryId: evidenceEntry }); },
    ctx => { const s = lastResult(ctx); sourceId = s.id; assert.equal(s.entryId, evidenceEntry); assert.equal(s.role, 'toolResult'); return call('dreamer_source', { action: 'capture', entryId: assistantEntry }); },
    ctx => { const s = lastResult(ctx); hypothesisId = s.id; assert.equal(s.text, 'An initial hypothesis: service port is 4318.'); assert.ok(!JSON.stringify(s).includes('PRIVATE')); return call('dreamer_note', { action: 'create', title: 'Service port', kind: 'hypothesis', text: 'Service port is 4318.', sourceIds: [s.id] }); },
    ctx => { noteId = lastResult(ctx).id; return done(); },
  ]);
  await session.prompt('Explicitly capture synthetic evidence and record the initial hypothesis.'); check();
  check = script(session, [
    () => call('dreamer_note', { action: 'search', query: 'Service port' }),
    ctx => { assert.equal(lastResult(ctx)[0].version, 1); return call('dreamer_source', { action: 'search', query: 'Service' }); },
    ctx => { const evidence = lastResult(ctx).find(s => s.role === 'toolResult'); assert.ok(evidence); discoveredSourceId = evidence.id; return call('dreamer_source', { action: 'read', id: discoveredSourceId }); },
    ctx => { assert.equal(lastResult(ctx).text, 'Service listens on port 4317.'); return call('dreamer_note', {
      action: 'revise', id: noteId, expectedVersion: 1, text: 'Service port is 4317.',
      reason: 'Original command output contradicts the earlier hypothesis.', sourceIds: [discoveredSourceId] }); },
    ctx => { assert.equal(lastResult(ctx).version, 2); return done(); },
  ]);
  await session.prompt('/dream Service port');
  await session.waitForIdle(); check();
  assert.ok(manager.getBranch().some(e => e.type === 'custom_message' && String(e.message?.content ?? e.content).includes('Service port')), 'dream command dispatches a custom message');
  const later = await makeSession(SessionManager.inMemory(cwd));
  check = script(later, [
    () => call('dreamer_note', { action: 'search', query: 'Service port' }),
    ctx => { const result = lastResult(ctx); assert.equal(result[0].text, 'Service port is 4317.'); assert.equal(result[0].version, 2); return done(); },
  ]);
  await later.prompt('Recall the service port in a new session.'); check();
  const store = new MemoryStore(dbPath);
  try {
    assert.equal(store.history(noteId).length, 2);
    assert.equal(store.searchNotes('4318').length, 0);
    assert.equal(store.getSource(sourceId).sessionId, manager.getSessionId());
  } finally { store.close(); }
  const expectToolError = context => {
    const result = context.messages.filter(m => m.role === 'toolResult').at(-1);
    assert.equal(result?.isError, true, 'rejected call propagates through actual Pi tool result');
  };
  check = script(session, [
    () => call('dreamer_source', { action: 'capture', entryId: sibling }),
    ctx => { expectToolError(ctx); return call('dreamer_note', { action: 'revise', id: noteId, expectedVersion: 1,
      text: 'Stale overwrite', reason: 'Stale writer', sourceIds: [sourceId] }); },
    ctx => { expectToolError(ctx); return call('dreamer_note', { action: 'create', title: 'Missing evidence',
      kind: 'observation', text: 'Should not exist', sourceIds: ['missing-source'] }); },
    ctx => { expectToolError(ctx); return call('dreamer_source', { action: 'delete', id: hypothesisId }); },
    ctx => { expectToolError(ctx); return call('dreamer_note', { action: 'read', id: noteId }); },
    ctx => { assert.equal(lastResult(ctx).version, 2); return call('dreamer_source', { action: 'delete', id: hypothesisId, confirm: true }); },
    ctx => { assert.deepEqual(lastResult(ctx), { sources: 1, notes: 1, revisions: 2 }); return call('dreamer_note', { action: 'read', id: noteId }); },
    ctx => { expectToolError(ctx); return done(); },
  ]);
  await session.prompt('Exercise rejection paths and explicitly delete synthetic evidence.'); check();
  const afterDeletion = new MemoryStore(dbPath);
  try {
    assert.throws(() => afterDeletion.history(noteId));
    assert.equal(afterDeletion.searchNotes('Missing evidence').length, 0);
    assert.equal(afterDeletion.getSource(sourceId).id, sourceId);
  } finally { afterDeletion.close(); }
  assert.deepEqual(errors, []);
  assert.equal(networkAttempts, 0);
  console.log('PASS: actual Pi extension load, branch selection/rejection, text-only capture, forward note, /dream evidence discovery+revision, new-session recall, history, stale/missing-source rejection, confirmed cascading deletion; zero fetch attempts.');
} finally {
  for (const session of sessions) session.dispose();
  rmSync(root, { recursive: true, force: true });
}
