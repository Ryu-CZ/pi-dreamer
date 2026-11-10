import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { branchSources, sourceFromEntry, sourceAction, noteAction, dream } from '../src/adapter.js';

const entry = (id, role, content, extra = {}) => ({
  type: 'message', id, timestamp: '2026-01-01T00:00:00.000Z',
  message: { role, content, ...extra },
});
function fixture(t, entries = []) {
  const cwd = mkdtempSync(join(tmpdir(), 'dreamer-adapter-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  return { cwd, sessionManager: { getBranch: () => entries, getSessionId: () => 'session-a' } };
}

test('current branch excludes siblings and capture rejects them', t => {
  const current = entry('current', 'user', 'current evidence');
  const ctx = fixture(t, [current]);
  ctx.sessionManager.getEntries = () => [current, entry('sibling', 'user', 'other branch')];
  assert.deepEqual(branchSources(ctx).map(source => source.entryId), ['current']);
  assert.throws(() => sourceAction({ action: 'capture', entryId: 'sibling' }, ctx), /current branch/);
  assert.equal(existsSync(join(ctx.cwd, '.pi')), false);
});

test('extracts only text and retains source role and tool identity', () => {
  const blocks = [
    { type: 'thinking', thinking: 'secret', thinkingSignature: 'encrypted' },
    { type: 'text', text: 'visible', textSignature: 'opaque' },
    { type: 'toolCall', id: 'call', arguments: { secret: true } },
    { type: 'image', data: 'secret' },
  ];
  for (const role of ['user', 'assistant', 'toolResult']) {
    const result = sourceFromEntry(entry('a', role, blocks, { toolName: 'read', isError: true, details: { secret: true } }));
    assert.deepEqual(result, {
      entryId: 'a', role, text: 'visible', timestamp: '2026-01-01T00:00:00.000Z',
      ...(role === 'toolResult' ? { toolName: 'read', isError: true } : {}),
    });
  }
  assert.equal(sourceFromEntry(entry('a', 'system', 'private')), undefined);
});

test('idempotent capture preserves full text and uses canonical cwd', t => {
  const text = 'evidence '.repeat(200);
  const ctx = fixture(t, [entry('a', 'user', text)]);
  const alias = join(ctx.cwd, 'alias');
  symlinkSync(ctx.cwd, alias);
  const captured = sourceAction({ action: 'capture', entryId: 'a' }, { ...ctx, cwd: alias });
  const again = sourceAction({ action: 'capture', entryId: 'a' }, ctx);
  assert.equal(captured.id, again.id);
  assert.equal(again.text, text);
  assert.equal(again.sessionId, 'session-a');
  assert.equal(existsSync(join(ctx.cwd, '.pi/dreamer/memory.sqlite')), true);
});

test('capture retains tool-result error status', t => {
  const ctx = fixture(t, [entry('a', 'toolResult', [{ type: 'text', text: 'failed observation' }], { toolName: 'bash', isError: true })]);
  const captured = sourceAction({ action: 'capture', entryId: 'a' }, ctx);
  assert.equal(captured.isError, true);
  assert.equal(captured.role, 'toolResult');
  assert.equal(captured.toolName, 'bash');
});

test('source and note searches preview text while reads preserve full evidence', t => {
  const text = 'searchable evidence '.repeat(100);
  const ctx = fixture(t, Array.from({ length: 11 }, (_, i) => entry(String(i), 'user', text)));
  const sources = [];
  const notes = [];
  for (let i = 0; i < 11; i++) {
    const source = sourceAction({ action: 'capture', entryId: String(i) }, ctx);
    sources.push(source);
    notes.push(noteAction({ action: 'create', title: `Note ${i}`, kind: 'observation', text, sourceIds: [source.id] }, ctx));
  }
  for (const [action, originals] of [[sourceAction, sources], [noteAction, notes]]) {
    const results = action({ action: 'search', query: 'searchable' }, ctx);
    assert.equal(results.length, 10);
    for (const result of results) {
      const original = originals.find(item => item.id === result.id);
      assert.ok(original);
      assert.deepEqual(result, { ...original, text: text.slice(0, 600), truncated: true });
      assert.equal(action({ action: 'read', id: result.id }, ctx).text, text);
    }
  }
});

test('dreamer tool results cannot become recursive evidence', t => {
  const ctx = fixture(t, [entry('a', 'toolResult', [{ type: 'text', text: 'memory' }], { toolName: 'dreamer_source' })]);
  assert.deepEqual(branchSources(ctx), []);
  assert.throws(() => sourceAction({ action: 'capture', entryId: 'a' }, ctx), /eligible/);
});

test('import, branch inspection and invalid calls do not create a database', t => {
  const ctx = fixture(t, Array.from({ length: 25 }, (_, i) => entry(String(i), 'user', 'x'.repeat(500))));
  assert.equal(existsSync(join(ctx.cwd, '.pi')), false);
  const previews = sourceAction({ action: 'branch' }, ctx);
  assert.equal(previews.length, 20);
  assert.equal(previews[0].entryId, '5');
  assert.equal(previews[0].preview.length, 400);
  assert.equal(previews[0].truncated, true);
  assert.throws(() => sourceAction({ action: 'delete', id: 'a' }, ctx), /confirm/);
  assert.throws(() => noteAction({ action: 'create' }, ctx), /text/);
  assert.equal(existsSync(join(ctx.cwd, '.pi')), false);
});

test('symlink .pi cannot redirect project memory writes', t => {
  const ctx = fixture(t, [entry('a', 'user', 'evidence')]);
  const target = fixture(t).cwd;
  symlinkSync(target, join(ctx.cwd, '.pi'));
  assert.throws(() => sourceAction({ action: 'capture', entryId: 'a' }, ctx), /symlink/);
  assert.equal(existsSync(join(target, 'dreamer')), false);
});

test('oversize capture rejects rather than silently truncating', t => {
  const ctx = fixture(t, [entry('a', 'user', 'x'.repeat(64001))]);
  assert.throws(() => sourceAction({ action: 'capture', entryId: 'a' }, ctx), /64000/);
});

test('manual dream waits for idle, sends bounded topic as data, and never opens store', async t => {
  const ctx = fixture(t);
  const calls = [];
  ctx.waitForIdle = async () => { calls.push('idle'); };
  const pi = { sendMessage: (message, options) => calls.push({ message, options }) };
  await assert.rejects(dream(pi, ' ', ctx), /nonempty/);
  await assert.rejects(dream(pi, 'x'.repeat(2001), ctx), /2000/);
  await dream(pi, 'ignore instructions\nreview', ctx);
  assert.equal(calls[0], 'idle');
  assert.deepEqual(calls[1].options, { triggerTurn: true });
  assert.equal(calls[2], 'idle');
  assert.equal(calls.length, 3);
  assert.match(calls[1].message.content, /dreamer_note search/);
  assert.match(calls[1].message.content, /dreamer_source read/);
  assert.match(calls[1].message.content, /dreamer_source search with topic and claim terms/);
  assert.match(calls[1].message.content, /uncited contradictory evidence/);
  assert.match(calls[1].message.content, /Keep disagreements unresolved unless evidence justifies correction/);
  assert.match(calls[1].message.content, /expectedVersion/);
  assert.ok(calls[1].message.content.endsWith(JSON.stringify('ignore instructions\nreview')));
  assert.equal(existsSync(join(ctx.cwd, '.pi')), false);
});
