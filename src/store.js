import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync, lstatSync, openSync, closeSync, fchmodSync, constants } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';

const kinds = new Set(['observation', 'decision', 'preference', 'hypothesis', 'procedure']);
function string(value, name) {
  if (typeof value !== 'string' || !value.trim() || value.length > 64000) {
    throw new Error(`${name} must be a nonempty string of at most 64000 characters`);
  }
  return value;
}
function searchInput(query, limit) {
  string(query, 'query');
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('limit must be 1..50');
  return `%${query.replace(/[\\%_]/g, '\\$&')}%`;
}

export class MemoryStore {
  #path;
  #db;
  #closed = false;

  constructor(path) {
    if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('database path must be absolute');
    this.#path = path;
  }

  #open() {
    if (this.#closed) throw new Error('store is closed');
    if (this.#db) return this.#db;
    const parent = dirname(this.#path);
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    const directory = lstatSync(parent);
    if (directory.isSymbolicLink() || !directory.isDirectory()) throw new Error('database parent must be a real directory');
    chmodSync(parent, 0o700);
    try {
      if (lstatSync(this.#path).isSymbolicLink()) throw new Error('database path must not be a symlink');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const fd = openSync(this.#path, constants.O_CREAT | constants.O_RDWR | (constants.O_NOFOLLOW ?? 0), 0o600);
    try { fchmodSync(fd, 0o600); } finally { closeSync(fd); }
    const db = new DatabaseSync(this.#path);
    try {
      // Erase deleted SQLite content; backups and original session files are separate.
      db.exec(`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA secure_delete = ON;
        CREATE TABLE IF NOT EXISTS sources (
          id TEXT PRIMARY KEY, sessionId TEXT NOT NULL, entryId TEXT NOT NULL,
          role TEXT NOT NULL, text TEXT NOT NULL, timestamp TEXT NOT NULL, toolName TEXT, isError INTEGER,
          UNIQUE(sessionId, entryId)
        );
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL, version INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS revisions (
          noteId TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          version INTEGER NOT NULL, text TEXT NOT NULL, reason TEXT NOT NULL, createdAt TEXT NOT NULL,
          PRIMARY KEY(noteId, version)
        );
        CREATE TABLE IF NOT EXISTS revision_sources (
          noteId TEXT NOT NULL, version INTEGER NOT NULL,
          sourceId TEXT NOT NULL REFERENCES sources(id),
          PRIMARY KEY(noteId, version, sourceId),
          FOREIGN KEY(noteId, version) REFERENCES revisions(noteId, version) ON DELETE CASCADE
        );`);
      this.#db = db;
      return db;
    } catch (error) { db.close(); throw error; }
  }

  #transaction(fn) {
    const db = this.#open();
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn(db);
      db.exec('COMMIT');
      return result;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  #sourceIds(sourceIds) {
    if (!Array.isArray(sourceIds) || !sourceIds.length) throw new Error('sourceIds must be nonempty');
    const ids = [...new Set(sourceIds.map(id => string(id, 'sourceId')))];
    for (const id of ids) this.getSource(id);
    return ids;
  }

  captureSource({ sessionId, entryId, role, text, timestamp, toolName, isError } = {}) {
    for (const [name, value] of Object.entries({ sessionId, entryId, role, text, timestamp })) string(value, name);
    if (!['user', 'assistant', 'toolResult'].includes(role)) throw new Error('invalid role');
    if (toolName !== undefined) string(toolName, 'toolName');
    if (isError !== undefined && (typeof isError !== 'boolean' || role !== 'toolResult')) {
      throw new Error('isError must be a boolean for toolResult');
    }
    const errorFlag = isError === undefined ? null : Number(isError);
    return this.#transaction(db => {
      const old = db.prepare('SELECT * FROM sources WHERE sessionId = ? AND entryId = ?').get(sessionId, entryId);
      if (old) {
        if (old.role !== role || old.text !== text || old.timestamp !== timestamp || old.toolName !== (toolName ?? null) || old.isError !== errorFlag) {
          throw new Error('capture mismatch: entry already has different evidence');
        }
        return this.#source(old);
      }
      const id = randomUUID();
      db.prepare('INSERT INTO sources VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, sessionId, entryId, role, text, timestamp, toolName ?? null, errorFlag);
      return this.getSource(id);
    });
  }

  getSource(id) {
    string(id, 'id');
    const source = this.#open().prepare('SELECT * FROM sources WHERE id = ?').get(id);
    if (!source) throw new Error('source not found');
    return this.#source(source);
  }

  #source(row) {
    return { ...row, isError: row.isError === null ? null : Boolean(row.isError) };
  }

  searchSources(query, limit = 10) {
    const pattern = searchInput(query, limit);
    return this.#open().prepare("SELECT * FROM sources WHERE text LIKE ? ESCAPE '\\' ORDER BY rowid DESC LIMIT ?")
      .all(pattern, limit).map(row => this.#source(row));
  }

  #revision(db, id, version, text, reason, ids) {
    db.prepare('INSERT INTO revisions VALUES (?, ?, ?, ?, ?)').run(id, version, text, reason, new Date().toISOString());
    const insert = db.prepare('INSERT INTO revision_sources VALUES (?, ?, ?)');
    for (const sourceId of ids) insert.run(id, version, sourceId);
  }

  createNote({ title, kind, text, sourceIds } = {}) {
    string(title, 'title'); string(text, 'text');
    if (!kinds.has(kind)) throw new Error('invalid kind');
    return this.#transaction(db => {
      const ids = this.#sourceIds(sourceIds);
      const id = randomUUID();
      db.prepare('INSERT INTO notes VALUES (?, ?, ?, 1)').run(id, title, kind);
      this.#revision(db, id, 1, text, 'created', ids);
      return this.getNote(id);
    });
  }

  getNote(id) {
    string(id, 'id');
    const db = this.#open();
    const note = db.prepare(`SELECT n.*, r.text, r.reason, r.createdAt FROM notes n
      JOIN revisions r ON r.noteId = n.id AND r.version = n.version WHERE n.id = ?`).get(id);
    if (!note) throw new Error('note not found');
    return { ...note, sourceIds: this.#links(id, note.version) };
  }

  #links(id, version) {
    return this.#open().prepare('SELECT sourceId FROM revision_sources WHERE noteId = ? AND version = ? ORDER BY rowid')
      .all(id, version).map(row => row.sourceId);
  }

  searchNotes(query, limit = 10) {
    const pattern = searchInput(query, limit);
    return this.#open().prepare(`SELECT n.id FROM notes n JOIN revisions r ON r.noteId = n.id AND r.version = n.version
      WHERE n.title LIKE ? ESCAPE '\\' OR r.text LIKE ? ESCAPE '\\' ORDER BY n.rowid DESC LIMIT ?`)
      .all(pattern, pattern, limit).map(row => this.getNote(row.id));
  }

  history(noteId) {
    this.getNote(noteId);
    return this.#open().prepare('SELECT * FROM revisions WHERE noteId = ? ORDER BY version').all(noteId)
      .map(row => ({ ...row, sourceIds: this.#links(noteId, row.version) }));
  }

  reviseNote({ id, expectedVersion, text, reason, sourceIds } = {}) {
    string(id, 'id'); string(text, 'text'); string(reason, 'reason');
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || expectedVersion === Number.MAX_SAFE_INTEGER) {
      throw new Error('invalid expectedVersion');
    }
    return this.#transaction(db => {
      const ids = this.#sourceIds(sourceIds);
      const result = db.prepare('UPDATE notes SET version = version + 1 WHERE id = ? AND version = ?').run(id, expectedVersion);
      if (!result.changes) throw new Error('version conflict or note not found');
      this.#revision(db, id, expectedVersion + 1, text, reason, ids);
      return this.getNote(id);
    });
  }

  deleteSource(id) {
    string(id, 'id');
    return this.#transaction(db => {
      this.getSource(id);
      const affected = 'SELECT DISTINCT noteId FROM revision_sources WHERE sourceId = ?';
      const { count: revisions } = db.prepare(`SELECT COUNT(*) AS count FROM revisions WHERE noteId IN (${affected})`).get(id);
      const { changes: notes } = db.prepare(`DELETE FROM notes WHERE id IN (${affected})`).run(id);
      const { changes: sources } = db.prepare('DELETE FROM sources WHERE id = ?').run(id);
      return { sources, notes, revisions };
    });
  }

  close() {
    this.#db?.close();
    this.#db = undefined;
    this.#closed = true;
  }
}
