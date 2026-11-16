// Shared historical-only dream, then isolated main/diagnostic solves.
// No default executor or live entry point: callers must explicitly inject execution.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, lstatSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MemoryStore } from '../src/store.js';
import { DEPLOYMENT_HISTORY, DEPLOYMENT_TASKS } from './deployment-fixture.js';
import { gradeDeployment } from './deployment-verifier.js';
import { hashString } from './executor.js';
import { phaseArgv, SYSTEM_PROMPTS, REPO_ROOT, implementationHash } from './sweep.js';

export const PHASE_SETTINGS = JSON.stringify({ compaction: { enabled: false }, retry: { enabled: false, provider: { maxRetries: 0 } } });
const settingsHash = hashString(PHASE_SETTINGS);
const arms = ['S', 'N', 'D'];
const tasks = ['main', 'diagnostic'];
const dbPath = workspace => join(workspace, '.pi/dreamer/memory.sqlite');
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2), { mode: 0o600 });

function regular(path, directory = false) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) throw new Error(`not a regular ${directory ? 'directory' : 'file'}: ${path}`);
}

function databaseSnapshot(workspace) {
  regular(join(workspace, '.pi'), true);
  regular(join(workspace, '.pi/dreamer'), true);
  const path = dbPath(workspace);
  regular(path);
  for (const suffix of ['-wal', '-shm', '-journal']) if (existsSync(path + suffix)) throw new Error(`unresolved SQLite sidecar: ${suffix}`);
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return {
      sources: db.prepare('SELECT * FROM sources ORDER BY sessionId, entryId, id').all(),
      notes: db.prepare('SELECT * FROM notes ORDER BY id').all(),
      revisions: db.prepare('SELECT * FROM revisions ORDER BY noteId, version').all(),
      links: db.prepare('SELECT * FROM revision_sources ORDER BY noteId, version, sourceId').all(),
      hash: hashString(readFileSync(path)),
    };
  } finally { db.close(); }
}

function configuration(workspace) {
  regular(workspace, true);
  regular(join(workspace, '.pi'), true);
  regular(join(workspace, '.pi/settings.json'));
  if (readFileSync(join(workspace, '.pi/settings.json'), 'utf8') !== PHASE_SETTINGS) throw new Error('phase settings changed');
  const entries = readdirSync(join(workspace, '.pi')).sort();
  if (entries.join('|') !== 'dreamer|settings.json') throw new Error('unexpected project runtime resources');
}

function clone(from, to) {
  configuration(from);
  const original = databaseSnapshot(from);
  mkdirSync(join(to, '.pi/dreamer'), { recursive: true, mode: 0o700 });
  copyFileSync(dbPath(from), dbPath(to));
  writeFileSync(join(to, '.pi/settings.json'), PHASE_SETTINGS, { mode: 0o600 });
  const copied = databaseSnapshot(to);
  if (copied.hash !== original.hash) throw new Error('clone hash mismatch');
  return copied;
}

function seed(workspace) {
  mkdirSync(join(workspace, '.pi'), { recursive: true, mode: 0o700 });
  writeFileSync(join(workspace, '.pi/settings.json'), PHASE_SETTINGS, { mode: 0o600 });
  const store = new MemoryStore(dbPath(workspace));
  try { for (const source of DEPLOYMENT_HISTORY.history) store.captureSource(source); }
  finally { store.close(); }
  return databaseSnapshot(workspace);
}

function addNotes(workspace, sources) {
  const store = new MemoryStore(dbPath(workspace));
  try {
    for (const { derivedFrom, ...note } of DEPLOYMENT_HISTORY.forwardNotes) {
      store.createNote({ ...note, sourceIds: derivedFrom.map(id => sources.find(source => source.entryId === id).id) });
    }
  } finally { store.close(); }
}

function collectArtifacts(workspace) {
  regular(workspace, true);
  const files = {};
  const visit = (path, relative) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`artifact symlink: ${relative}`);
    if (stat.isDirectory()) for (const name of readdirSync(path)) visit(join(path, name), `${relative}/${name}`);
    else { regular(path); files[relative] = readFileSync(path, 'utf8'); }
  };
  try { visit(join(workspace, 'deploy'), 'deploy'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return files;
}

const sum = values => values.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)
  ? values.reduce((total, value) => total + value, 0) : null;
const phaseCost = phase => phase?.ran === false ? 0 : phase?.result?.cost?.total ?? null;

// Three repeats are the maximum frozen exploratory workload; offline tests may use fewer.
export async function runDeploymentSweep({ outDir, executor, repeats = 3, provider, model, thinkingLevel = 'low', phaseTimeoutMs = 120000 }) {
  if (!executor || typeof executor.run !== 'function') throw new Error('explicit executor required; no live default');
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 3) throw new Error('repeats must be 1..3');
  if (!provider || !model || !Number.isSafeInteger(phaseTimeoutMs) || phaseTimeoutMs < 1000 || phaseTimeoutMs > 120000) throw new Error('explicit provider/model and timeout 1000..120000 required');
  const root = resolve(outDir);
  try { regular(root, true); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  mkdirSync(root, { recursive: true, mode: 0o700 });
  regular(root, true);
  if (readdirSync(root).length) throw new Error('output directory must be empty');
  const report = {
    execution: 'injected-executor; no default or live CLI', runtime: { node: process.version },
    metrics: 'artifact/evidence counts include inspectable partial outputs from failed phases; joint is admissible success',
    fixtureHash: hashString(JSON.stringify({ history: DEPLOYMENT_HISTORY, tasks: DEPLOYMENT_TASKS })),
    implementationHash: implementationHash(), settingsHash, phaseSettings: JSON.parse(PHASE_SETTINGS),
    config: { provider, model, thinkingLevel, phaseTimeoutMs, repeats },
    blocks: [], exposures: [], phases: [], fatal: null,
  };
  for (let repeat = 1; repeat <= repeats; repeat++) for (const arm of arms) for (const task of tasks) {
    report.exposures.push({ repeat, arm, task, outcome: 'not-run', artifact: null, evidence: null, joint: false });
  }
  const persist = () => writeJson(join(root, 'report.json'), report);
  persist();

  async function phase(kind, workspace, transcripts, message, expectedSources, metadata) {
    const record = { ...metadata, kind, workspace, ran: false, argv: null, before: null, after: null, result: null, failure: null, error: null, settingsHash };
    report.phases.push(record);
    try {
      configuration(workspace);
      record.before = databaseSnapshot(workspace);
      if (JSON.stringify(record.before.sources) !== JSON.stringify(expectedSources)) throw new Error('source manifest changed before phase');
    } catch (error) { record.failure = 'integrity-error'; record.error = error.message; persist(); return record; }
    const base = { transcripts, extensionPath: join(REPO_ROOT, 'src/index.ts') };
    const tools = kind === 'dream' ? 'dreamer_source,dreamer_note' : 'read,bash,edit,write,dreamer_source,dreamer_note';
    record.argv = ['--approve', '--offline', ...phaseArgv(base, {
      kind, provider, model, thinking: thinkingLevel, tools, systemPrompt: SYSTEM_PROMPTS[kind], message,
    })];
    record.ran = true;
    mkdirSync(transcripts, { recursive: true, mode: 0o700 });
    persist();
    try {
      record.result = await executor.run({ kind, workspace, transcripts, message, argv: record.argv, phaseTimeoutMs, ...metadata });
      if (!record.result || record.result.exitCode !== 0 || record.result.timedOut || record.result.error) record.failure = 'phase-error';
    } catch (error) { record.failure = 'phase-error'; record.error = error.message; }
    try {
      configuration(workspace);
      record.after = databaseSnapshot(workspace);
      if (JSON.stringify(record.after.sources) !== JSON.stringify(expectedSources)) throw new Error('source manifest changed after phase');
    } catch (error) { record.failure = 'integrity-error'; record.error = error.message; }
    persist();
    return record;
  }

  try {
    for (let repeat = 1; repeat <= repeats; repeat++) {
      const blockDir = join(root, `repeat-${repeat}`);
      const sourceDir = join(blockDir, 'seeds/S');
      const original = seed(sourceDir);
      const noteDir = join(blockDir, 'seeds/N');
      clone(sourceDir, noteDir); addNotes(noteDir, original.sources);
      const dreamDir = join(blockDir, 'seeds/D');
      clone(noteDir, dreamDir);
      const order = [...arms.slice(repeat - 1), ...arms.slice(0, repeat - 1)];
      const taskOrder = repeat % 2 ? tasks : [...tasks].reverse();
      const block = { repeat, order, taskOrder, mapping: original.sources.map(({ id, sessionId, entryId }) => ({ id, sessionId, entryId })), dream: null };
      report.blocks.push(block); persist();
      for (const arm of order) {
        if (arm === 'D') block.dream = await phase('dream', dreamDir, join(blockDir, 'transcripts/dream'), `/dream ${DEPLOYMENT_HISTORY.topic}`, original.sources, { repeat, arm });
        for (const task of taskOrder) {
          const exposure = report.exposures.find(item => item.repeat === repeat && item.arm === arm && item.task === task);
          if (arm === 'D' && block.dream.failure) {
            Object.assign(exposure, { outcome: 'dream-failed', reason: block.dream.failure, solve: { ran: false }, solveCost: 0 });
            persist(); continue;
          }
          const workspace = join(blockDir, `solves/${arm}-${task}/workspace`);
          exposure.clone = clone({ S: sourceDir, N: noteDir, D: dreamDir }[arm], workspace);
          for (const [path, text] of Object.entries(DEPLOYMENT_TASKS[task].scaffold)) writeFileSync(join(workspace, path), text, { mode: 0o600 });
          const solve = await phase('solve', workspace, join(blockDir, `transcripts/${arm}-${task}`), DEPLOYMENT_TASKS[task].taskPrompt, original.sources, { repeat, arm, task });
          exposure.solve = solve; exposure.solveCost = phaseCost(solve);
          exposure.outcome = solve.failure ?? 'graded';
          try {
            Object.assign(exposure, gradeDeployment(task, collectArtifacts(workspace)));
            if (!solve.failure) exposure.outcome = exposure.joint ? 'success' : 'verifier-failed';
            else exposure.joint = false;
          } catch (error) { exposure.outcome = 'artifact-error'; exposure.error = error.message; exposure.joint = false; }
          persist();
        }
      }
    }
  } catch (error) {
    report.fatal = error.message;
    for (const exposure of report.exposures) if (exposure.outcome === 'not-run') exposure.outcome = 'infrastructure-error';
  }
  report.costs = report.blocks.flatMap(block => arms.map(arm => {
    const exposures = report.exposures.filter(item => item.repeat === block.repeat && item.arm === arm);
    const dream = arm === 'D' ? phaseCost(block.dream) : 0;
    const solves = sum(exposures.map(item => item.solveCost));
    return { repeat: block.repeat, arm, dream, solves, cumulative: sum([dream, solves]), dreamPerTask: dream === null ? null : dream / 2 };
  }));
  report.summary = arms.flatMap(arm => tasks.map(task => {
    const exposures = report.exposures.filter(item => item.arm === arm && item.task === task);
    return { arm, task, trials: exposures.length, artifact: exposures.filter(item => item.artifact === true).length,
      evidence: exposures.filter(item => item.evidence === true).length, joint: exposures.filter(item => item.joint).length };
  }));
  persist();
  return report;
}
