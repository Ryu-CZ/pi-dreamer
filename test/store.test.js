import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, statSync, mkdirSync, chmodSync, symlinkSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore } from '../src/store.js';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'dreamer-store-'));
  const path = join(root, 'project', 'memory.sqlite');
  const stores = [];
  const open = (file = path) => {
    const store = new MemoryStore(file);
    stores.push(store);
    return store;
  };
  t.after(() => { for (const store of stores) store.close(); rmSync(root, { recursive: true, force: true }); });
  return { root, path, open, store: open() };
}
const evidence = (overrides = {}) => ({ sessionId: 'session', entryId: 'entry', role: 'toolResult', text: 'raw evidence', timestamp: '2026-01-01T00:00:00Z', toolName: 'read', ...overrides });
const noteInput = (source, overrides = {}) => ({ title: 'A claim', kind: 'hypothesis', text: 'original claim', sourceIds: [source.id], ...overrides });

test('lazy private storage, attributed roundtrip, deduplication and reopen', t => {
  const { store, path, open } = fixture(t);
  assert.equal(existsSync(path), false);
  const source = store.captureSource(evidence());
  assert.match(source.id, /^[\da-f-]{36}$/);
  assert.deepEqual(source, { id: source.id, ...evidence(), isError: null });
  assert.deepEqual(store.captureSource(evidence()), source);
  const note = store.createNote(noteInput(source, { sourceIds: [source.id, source.id] }));
  assert.equal(note.version, 1);
  assert.deepEqual(note.sourceIds, [source.id]);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(statSync(join(path, '..')).mode & 0o777, 0o700);
  store.close();
  const reopened = open();
  assert.deepEqual(reopened.getSource(source.id), source);
  assert.deepEqual(reopened.getNote(note.id), note);
  assert.equal(reopened.history(note.id)[0].text, note.text);
});

test('kinds and validation reject malformed inputs without changing a note', t => {
  const { store } = fixture(t);
  assert.throws(() => new MemoryStore('relative.sqlite'));
  const source = store.captureSource(evidence());
  for (const kind of ['observation', 'decision', 'preference', 'hypothesis', 'procedure']) {
    assert.equal(store.createNote(noteInput(source, { kind })).kind, kind);
  }
  const note = store.createNote(noteInput(source));
  const history = store.history(note.id);
  for (const patch of [
    { text: '' }, { text: ' ' }, { text: 7 }, { text: 'x'.repeat(64001) },
    { reason: '' }, { reason: null }, { reason: 'x'.repeat(64001) },
    { expectedVersion: 0 }, { expectedVersion: 1.5 }, { expectedVersion: '1' },
    { sourceIds: [] }, { sourceIds: null }, { sourceIds: ['missing'] }, { sourceIds: [source.id, ''] },
    { id: '' },
  ]) {
    assert.throws(() => store.reviseNote({ id: note.id, expectedVersion: 1, text: 'new', reason: 'correction', sourceIds: [source.id], ...patch }));
    assert.deepEqual(store.getNote(note.id), note);
    assert.deepEqual(store.history(note.id), history);
  }
  for (const patch of [{ title: '' }, { title: 1 }, { kind: 'verified' }, { text: '' }, { sourceIds: [] }, { sourceIds: ['missing'] }]) {
    assert.throws(() => store.createNote(noteInput(source, patch)));
  }
  for (const field of ['sessionId', 'entryId', 'role', 'text', 'timestamp', 'toolName']) {
    assert.throws(() => store.captureSource(evidence({ [field]: '' })));
  }
  assert.throws(() => store.captureSource(evidence({ text: 'x'.repeat(64001) })));
  assert.equal(store.captureSource(evidence({ entryId: 'max', text: 'x'.repeat(64000) })).text.length, 64000);
  for (const method of ['getSource', 'getNote', 'history', 'deleteSource']) assert.throws(() => store[method]('missing'));
  for (const method of ['searchSources', 'searchNotes']) {
    for (const query of ['', ' ', null, 3]) assert.throws(() => store[method](query));
    for (const limit of [0, 51, 1.5, '2', null]) assert.throws(() => store[method]('claim', limit));
  }
});

test('capture identity rejects changed evidence, but is scoped to session and entry', t => {
  const { store } = fixture(t);
  const source = store.captureSource(evidence());
  for (const patch of [{ role: 'assistant' }, { text: 'different' }, { timestamp: 'later' }, { toolName: 'bash' }, { toolName: undefined }]) {
    assert.throws(() => store.captureSource(evidence(patch)), /mismatch/);
    assert.deepEqual(store.getSource(source.id), source);
  }
  assert.notEqual(store.captureSource(evidence({ sessionId: 'other' })).id, source.id);
  assert.notEqual(store.captureSource(evidence({ entryId: 'other' })).id, source.id);
  assert.equal(store.captureSource(evidence({ entryId: 'no-tool', toolName: undefined })).toolName, null);
});

test('revision history retains attribution and rejects stale writes across connections', t => {
  const { store, open } = fixture(t);
  const first = store.captureSource(evidence());
  const second = store.captureSource(evidence({ entryId: 'second', text: 'correction evidence' }));
  const note = store.createNote(noteInput(first));
  const peer = open();
  assert.equal(peer.getNote(note.id).version, 1);
  const updated = store.reviseNote({ id: note.id, expectedVersion: 1, text: 'corrected claim', reason: 'source disproves original', sourceIds: [second.id, second.id] });
  assert.equal(updated.version, 2);
  assert.deepEqual(updated.sourceIds, [second.id]);
  assert.deepEqual(peer.getNote(note.id), updated);
  assert.throws(() => peer.reviseNote({ id: note.id, expectedVersion: 1, text: 'stale', reason: 'old view', sourceIds: [first.id] }), /conflict/);
  const history = peer.history(note.id);
  assert.equal(history.length, 2);
  assert.equal(history[0].text, note.text);
  assert.deepEqual(history[0].sourceIds, [first.id]);
  assert.equal(history[1].reason, 'source disproves original');
  assert.deepEqual(history[1].sourceIds, [second.id]);
});

test('deletion propagates through any historical revision with no resurrection', t => {
  const { store, open } = fixture(t);
  const old = store.captureSource(evidence());
  const fresh = store.captureSource(evidence({ entryId: 'fresh' }));
  const note = store.createNote(noteInput(old));
  store.reviseNote({ id: note.id, expectedVersion: 1, text: 'new version', reason: 'changed evidence', sourceIds: [fresh.id] });
  const linked = store.createNote(noteInput(old));
  const safe = store.createNote(noteInput(fresh));
  assert.deepEqual(store.deleteSource(old.id), { sources: 1, notes: 2, revisions: 3 });
  for (const id of [note.id, linked.id]) {
    assert.throws(() => store.getNote(id));
    assert.throws(() => store.history(id));
    assert.throws(() => store.reviseNote({ id, expectedVersion: 2, text: 'resurrect', reason: 'no', sourceIds: [fresh.id] }));
  }
  assert.deepEqual(store.getNote(safe.id), safe);
  assert.throws(() => store.getSource(old.id));
  const peer = open();
  assert.throws(() => peer.getNote(note.id));
  assert.equal(peer.searchNotes('new version').length, 0);
  assert.deepEqual(store.deleteSource(fresh.id), { sources: 1, notes: 1, revisions: 1 });
});

test('project databases isolate evidence and notes', t => {
  const { store, open, root } = fixture(t);
  const other = open(join(root, 'other', 'memory.sqlite'));
  const source = store.captureSource(evidence());
  const note = store.createNote(noteInput(source));
  assert.throws(() => other.getSource(source.id));
  assert.throws(() => other.getNote(note.id));
  assert.throws(() => other.createNote(noteInput(source)));
  assert.deepEqual(other.searchSources('evidence'), []);
  assert.deepEqual(other.searchNotes('claim'), []);
  assert.notEqual(other.captureSource(evidence()).id, source.id);
});

test('literal lexical searches include punctuation and only current note text', t => {
  const { store } = fixture(t);
  const source = store.captureSource(evidence({ text: "literal 100% a_b c\\d ' OR 1=1 --" }));
  store.captureSource(evidence({ entryId: 'decoy', text: '1000 axb cd' }));
  const note = store.createNote(noteInput(source, { title: 'punctuation', text: source.text }));
  for (const query of ['%', '_', '\\', "' OR 1=1 --"]) {
    assert.deepEqual(store.searchSources(query).map(row => row.id), [source.id]);
    assert.deepEqual(store.searchNotes(query).map(row => row.id), [note.id]);
  }
  assert.equal(store.searchSources('100', 1).length, 1);
  assert.equal(store.searchNotes('PUNCTUATION', 50).length, 1);
  store.reviseNote({ id: note.id, expectedVersion: 1, text: 'replacement', reason: 'obsolete', sourceIds: [source.id] });
  assert.deepEqual(store.searchNotes('100%'), []);
  assert.equal(store.searchNotes('replacement').length, 1);
  assert.equal(store.searchSources('100%').length, 1);
  assert.equal(store.history(note.id)[0].text, source.text);
});

test('roles and optional tool error flags are validated and preserved', t => {
  const { store, open } = fixture(t);
  for (const role of ['system', 'tool', '', null]) {
    assert.throws(() => store.captureSource(evidence({ role })), /role/);
  }
  for (const isError of [null, 0, 1, 'true', {}]) {
    assert.throws(() => store.captureSource(evidence({ isError })), /isError/);
  }
  for (const role of ['user', 'assistant']) {
    for (const isError of [true, false]) {
      assert.throws(() => store.captureSource(evidence({ role, isError })), /isError/);
    }
    assert.equal(store.captureSource(evidence({ role, entryId: role })).isError, null);
  }
  const sources = [true, false, undefined].map((isError, index) => {
    const input = evidence({ entryId: `flag-${index}`, isError });
    const source = store.captureSource(input);
    assert.equal(source.isError, isError ?? null);
    assert.deepEqual(store.captureSource(input), source);
    assert.throws(() => store.captureSource({ ...input, isError: isError === true ? false : true }), /mismatch/);
    return source;
  });
  store.close();
  const reopened = open();
  for (const source of sources) {
    assert.deepEqual(reopened.getSource(source.id), source);
    assert.deepEqual(reopened.searchSources('raw evidence').find(row => row.id === source.id), source);
  }
});

test('existing final directory is private without changing ancestor permissions', t => {
  const { store, path, root } = fixture(t);
  mkdirSync(join(root, 'project'), { mode: 0o755 });
  chmodSync(root, 0o755);
  chmodSync(join(root, 'project'), 0o755);
  store.captureSource(evidence());
  assert.equal(statSync(root).mode & 0o777, 0o755);
  assert.equal(statSync(join(root, 'project')).mode & 0o777, 0o700);
  assert.equal(statSync(path).mode & 0o777, 0o600);
});

test('symlink database and final directory are rejected without touching targets', t => {
  const { store, path, root, open } = fixture(t);
  const target = join(root, 'target');
  writeFileSync(target, 'untouched', { mode: 0o644 });
  mkdirSync(join(root, 'project'));
  symlinkSync(target, path);
  assert.throws(() => store.captureSource(evidence()), /symlink/);
  assert.equal(readFileSync(target, 'utf8'), 'untouched');
  assert.equal(statSync(target).mode & 0o777, 0o644);

  const directory = join(root, 'target-directory');
  mkdirSync(directory);
  chmodSync(directory, 0o755);
  const link = join(root, 'linked-directory');
  symlinkSync(directory, link);
  assert.throws(() => open(join(link, 'memory.sqlite')).captureSource(evidence()), /real directory/);
  assert.equal(statSync(directory).mode & 0o777, 0o755);
  assert.equal(existsSync(join(directory, 'memory.sqlite')), false);
});
