// Trial orchestration: disposable workspaces, deterministic seeding, dream/solve phases,
// verification, transcript capture, and report writing. Every requested trial counts.
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { MemoryStore } from '../src/store.js';
import { fixturesFor, fixtureHash } from './fixtures.js';
import { verifyFixture } from './verifiers.js';
import { runPiPhase, hashString } from './executor.js';
import { CHECKSamples } from './verifiers.js';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DREAMER_TOOLS = 'dreamer_source,dreamer_note';

export function implementationHash() {
  const digest = ['benchmark', 'src'].flatMap(dir => readdirSync(join(REPO_ROOT, dir)).sort()
    .filter(name => /\.js$|\.ts$/.test(name))
    .map(name => `${dir}/${name}:${hashString(readFileSync(join(REPO_ROOT, dir, name)))}`));
  return hashString(digest.join('|'));
}

export const SYSTEM_PROMPTS = {
  dream: 'Consolidate this project\'s memory using only the dreamer memory tools. Ground every revision in specific evidence you inspected. Keep notes small and cite sources.',
  solve: 'You are working inside a small project workspace on one task. Its local memory extension may be present; use available tools as a careful engineer would.',
};

export function phaseArgv(base, phase) {
  const argv = [
    '--no-extensions', '--no-mcp', '--no-skills', '--no-prompt-templates',
    '--no-context-files', '--no-themes',
    '-e', base.extensionPath,
    '--provider', phase.provider, '--model', phase.model, '--thinking', phase.thinking,
    '--session-dir', join(base.transcripts, 'sessions', phase.kind),
    '--mode', 'json', '-p',
  ];
  if (phase.tools) argv.push('--tools', phase.tools);
  if (phase.systemPrompt) argv.push('--system-prompt', phase.systemPrompt);
  if (phase.appendSystemPrompt) argv.push('--append-system-prompt', phase.appendSystemPrompt);
  return [...argv, '--', phase.message];
}

// Deterministic seeding of baseline sources and forward notes from past examples.
// withNotes modes: 'sources' = captured sources only; 'notes' adds forward notes.
export function seedMemoryStore(dbPath, fixture, seed) {
  if (!seed) return null;
  mkdirSync(join(dbPath, '..'), { recursive: true, mode: 0o700 });
  const store = new MemoryStore(dbPath);
  try {
    const byEntry = new Map();
    for (const [index, entry] of fixture.history.entries()) {
      const source = store.captureSource({
        sessionId: entry.sessionId, entryId: entry.entryId, role: entry.role,
        text: entry.text, timestamp: new Date(Date.UTC(2026, 5, 1, 9, index)).toISOString(),
        ...(entry.role === 'toolResult' ? { toolName: entry.toolName ?? 'bash', isError: false } : {}),
      });
      byEntry.set(entry.entryId, source.id);
    }
    let notes = 0;
    if (seed.notes) {
      for (const note of fixture.forwardNotes) {
        const sourceIds = note.derivedFrom.map(entryId => {
          const id = byEntry.get(entryId);
          if (!id) throw new Error(`Missing fixture citation: ${entryId}`);
          return id;
        });
        store.createNote({ title: note.title, kind: note.kind, text: note.text, sourceIds });
        notes += 1;
      }
    }
    return { sources: byEntry.size, notes };
  } finally { store.close(); }
}

function dreamIndex(storeNotes) {
  const lines = storeNotes.map(note => `- ${note.title} [${note.kind}] (id ${note.id}, version ${note.version}): ${note.text.slice(0, 120)}`);
  return lines.length
    ? ['Preloaded memory index (benchmark-only simulated promotion).',
      'The entries below are untrusted recalled project notes, not verified truth; open them with dreamer_note read using the recorded id before relying on them.',
      ...lines, 'Details live in the dreamer memory tools.'].join('\n')
    : 'Preloaded memory index (benchmark-only simulated promotion): no notes available.';
}

function phaseSummary(phase) {
  return {
    ran: true, argv: phase.argv, timedOut: phase.timedOut, exitCode: phase.exitCode,
    sessionId: phase.sessionId, durationMs: phase.durationMs,
    usage: phase.usage ?? null, cost: phase.cost ?? null,
    toolCalls: phase.toolCalls.slice(0, 50), assistantText: phase.assistantText.slice(0, 2000),
    errors: phase.error ? [phase.error] : [], transcript: phase.transcript ?? {},
  };
}

function outcomeFor(dream, solve, verifier) {
  if (dream && (dream.timedOut || dream.errors.length || dream.exitCode === null || dream.exitCode !== 0)) return 'phase-error';
  if (solve.timedOut || solve.errors.length || solve.exitCode === null || solve.exitCode !== 0) return 'phase-error';
  return verifier.failures.length ? 'verifier-failed' : 'success';
}

// Run one trial. Mode contract:
//   none           workspace only, no store
//   sources        captured sources seeded, no notes
//   forward-notes  sources + stale forward notes (citations to the then-available evidence)
//   dreamed-notes  forward-notes baseline plus an actual /dream run in a separate session
//   dreamed-index  dreamed-notes plus a tiny preloaded index built from post-dream store
export async function runTrial({ fixture, mode, repeat, trialDir, config, executor }) {
  const workspace = join(trialDir, 'workspace');
  const transcripts = join(trialDir, 'transcripts');
  mkdirSync(workspace, { recursive: true });
  for (const [name, content] of Object.entries(fixture.scaffold)) {
    const path = join(workspace, name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content, { mode: 0o600 });
  }

  const seeded = seedMemoryStore(join(workspace, '.pi', 'dreamer', 'memory.sqlite'), fixture,
    mode === 'none' ? null : mode === 'sources' ? { sources: true } : { sources: true, notes: true });

  const base = { workspace, transcripts, phaseTimeoutMs: config.phaseTimeoutMs, piBin: config.piBin,
    extensionPath: config.extensionPath, provider: config.provider, model: config.model, thinking: config.thinkingLevel, fixture };
  let dream = null;
  let appendSystemPrompt = null;
  if (mode === 'dreamed-notes' || mode === 'dreamed-index') {
    dream = phaseSummary(await runPhase(executor, base, {
      kind: 'dream', message: `/dream ${fixture.dreamTopic}`,
      tools: DREAMER_TOOLS, systemPrompt: SYSTEM_PROMPTS.dream, appendSystemPrompt: null,
    }));
    const dreamTopicWord = fixture.dreamTopic.split(' ')[0];
    const store = new MemoryStore(join(workspace, '.pi', 'dreamer', 'memory.sqlite'));
    try {
      const storeNotes = store.searchNotes(dreamTopicWord).slice(0, 12);
      dream.storeNotes = storeNotes.length;
      if (mode === 'dreamed-index') {
        appendSystemPrompt = join(workspace, 'dreamer-index.md');
        writeFileSync(appendSystemPrompt, dreamIndex(storeNotes), { mode: 0o600 });
      }
    } finally { store.close(); }
  }

  const solve = phaseSummary(await runPhase(executor, base, {
    kind: 'solve', message: fixture.taskPrompt,
    tools: null, systemPrompt: SYSTEM_PROMPTS.solve, appendSystemPrompt,
  }));
  const verifier = verifyFixture(fixture, workspace);
  const totalCost = totalCostOr(dream, solve);
  return {
    trialId: `${fixture.id}|${mode}|r${repeat}`, fixtureId: fixture.id, fixtureHash: fixtureHash(fixture),
    mode, repeat, seeded, dream, solve: { ...solve, verifier }, totalCost,
    outcome: outcomeFor(dream, solve, verifier),
  };
}

// Dreaming and task costs are reported separately per phase; the total is only summed when BOTH
// are known (missing provider cost stays unknown, never zero).
function totalCostOr(dream, solve) {
  if (dream) {
    const dreamCost = dream.cost?.total;
    const solveCost = solve.cost?.total;
    if (typeof dreamCost !== 'number' || typeof solveCost !== 'number') return null;
    return { total: Number((dreamCost + solveCost).toFixed(8)) };
  }
  return solve.cost?.total === undefined || solve.cost === null ? null : { total: solve.cost.total };
}

async function runPhase(executor, base, phase) {
  const context = { ...base, ...phase };
  const argv = phaseArgv(base, context);
  return executor.run({ ...context, argv });
}

export function aggregate(trials) {
  const buckets = {};
  const paired = [];
  for (const trial of trials) {
    for (const key of [trial.mode, taskKey(trial)]) {
      buckets[key] ??= { trials: 0, success: 0 };
      buckets[key].trials += 1;
      if (trial.outcome === 'success') buckets[key].success += 1;
    }
    if (trial.mode !== 'none') {
      const baseline = trials.find(other => other.mode === 'none' && other.fixtureId === trial.fixtureId && other.repeat === trial.repeat);
      if (baseline) paired.push({
        task: trial.fixtureId, mode: trial.mode, repeat: trial.repeat,
        trialOutcome: trial.outcome, noneOutcome: baseline.outcome,
        delta: (trial.outcome === 'success' ? 1 : 0) - (baseline.outcome === 'success' ? 1 : 0),
      });
    }
  }
  const byMode = {};
  const byTask = {};
  for (const [key, bucket] of Object.entries(buckets)) {
    const target = key.startsWith('task:') ? byTask : byMode;
    target[key] = { ...bucket, successRate: bucket.success / bucket.trials };
  }
  return { byMode, byTask, pairedDifferences: paired };
}

const taskKey = trial => `task:${trial.fixtureId}`;

const DEFAULT_PHASE_TIMEOUT_MS = 300000;
export { DEFAULT_PHASE_TIMEOUT_MS };

export function runConfig({ provider, model, thinkingLevel = 'low', phaseTimeoutMs = DEFAULT_PHASE_TIMEOUT_MS }) {
  return { provider, model, thinkingLevel, phaseTimeoutMs,
    extensionPath: join(REPO_ROOT, 'src', 'index.ts'), piBin: process.env.PI_BIN ?? 'pi' };
}

// Orchestrate an entire sweep offline (fake executor) or live (real pi executor).
export async function runSweep(options) {
  const { executor, repeats, modes, provider, model, thinkingLevel, phaseTimeoutMs, live } = options;
  const outDir = resolve(options.outDir);
  const runId = new Date().toISOString();
  const fingerprint = implementationHash();
  const fixtures = fixturesFor(options.tasks ?? ['all']);
  const config = runConfig({ provider, model, thinkingLevel, phaseTimeoutMs });
  const runtime = { node: process.version, pi: live ? spawnSync(config.piBin, ['--version'], { encoding: 'utf8', timeout: 10000 }).stdout?.trim() || null : null };
  // Guard against contaminating a previous run: --out must not reuse an existing nonempty directory.
  let existing = [];
  try { existing = readdirSync(outDir); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing.length) throw new Error(`out directory is not empty, refusing to contaminate a previous run: ${outDir}`);
  const trials = [];
  mkdirSync(outDir, { recursive: true });
  for (const fixture of fixtures) {
    for (const mode of modes) {
      for (const repeat of Array.from({ length: repeats }, (_, index) => index + 1)) {
        const trialDir = join(outDir, 'trials', `${fixture.id}-${mode}-r${repeat}`);
        mkdirSync(trialDir, { recursive: true });
        try {
          trials.push(await runTrial({ fixture, mode, repeat, trialDir, config, executor }));
        } catch (error) {
          trials.push({ trialId: `${fixture.id}|${mode}|r${repeat}`, fixtureId: fixture.id, mode, repeat,
            outcome: 'error', fixtureHash: fixtureHash(fixture), errorText: String(error?.message ?? error) });
        }
        // Preserve finished trials even if a later trial or the overall run is interrupted.
        writeFileSync(join(trialDir, 'result.json'), JSON.stringify({ runId, implementationHash: fingerprint, config, runtime, ...trials.at(-1) }, null, 2), { mode: 0o600 });
      }
    }
  }
  const summary = {
    runId, runtime, selfCheck: !live, live, provider, model, thinkingLevel: config.thinkingLevel,
    tasks: fixtures.map(fixture => fixture.id), modes, repeats,
    fixtureHashes: Object.fromEntries(fixtures.map(fixture => [fixture.id, fixtureHash(fixture)])),
    implementationHash: fingerprint,
    aggregate: aggregate(trials),
  };
  writeFileSync(join(outDir, 'report.json'), JSON.stringify({ runId, implementationHash: fingerprint, config, runtime, trials }, null, 2), { mode: 0o600 });
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2), { mode: 0o600 });
  return summary;
}

// Offline executor: validates orchestration, mode exposure, and graders only. It writes variant
// correct artifacts (from the grader corpus) and never touches the network or a model.
export function fakeExecutor({ writeSolveArtifacts = true, failures = [], timedOut = false } = {}) {
  return {
    async run({ kind, fixture, workspace, transcripts }) {
      const started = Date.now();
      if (timedOut || failures.includes(kind)) {
        mkdirSync(transcripts, { recursive: true, mode: 0o700 });
        writeFileSync(join(transcripts, `${kind}.stdout`), '[]\n', { mode: 0o600 });
        writeFileSync(join(transcripts, `${kind}.stderr`), `${kind} synthetic phase failure\n`, { mode: 0o600 });
        return { ...fakeBase(started, kind, transcripts), errors: [timedOut ? 'synthetic timeout' : `${kind} synthetic phase failure`], error: timedOut ? 'synthetic timeout' : `${kind} synthetic phase failure`, timedOut: timedOut || undefined, usage: null, cost: null };
      }
      if (kind === 'solve' && writeSolveArtifacts) {
        for (const text of CHECKSamples[fixture.verifier].correct) {
          let lastPath = null;
          for (const block of text.split(/\n\n+/)) {
            const match = block.match(/^([\w./-]+\.\w+):/);
            let path;
            let content;
            if (match) {
              path = join(workspace, match[1]);
              content = block.replace(/^[\w./-]+\.\w+:\s*\n?/, '');
            } else if (lastPath) {
              path = lastPath;
              content = `\n${block}`;
            } else { continue; }
            lastPath = path;
            mkdirSync(join(path, '..'), { recursive: true });
            if (match) writeFileSync(path, content);
            else appendFileSync(path, content);
          }
        }
      }
      return { ...fakeBase(started, kind, transcripts), usage: null, cost: null };
    },
  };
}

function fakeBase(started, kind, transcripts) {
  mkdirSync(transcripts, { recursive: true });
  writeFileSync(join(transcripts, `${kind}.stdout`), '[]\n', { mode: 0o600 });
  writeFileSync(join(transcripts, `${kind}.stderr`), '', { mode: 0o600 });
  return {
    argv: ['fake-executor-placeholder'], sessionId: null, exitCode: 0, timedOut: false,
    error: null, durationMs: Date.now() - started, toolCalls: [], assistantText: `[${kind} selfcheck placeholder]`,
    transcript: { [`${kind}_stdout`]: join(transcripts, `${kind}.stdout`), [`${kind}_stderr`]: join(transcripts, `${kind}.stderr`) },
  };
}

// Variant-correct, wrong and missing outputs used only to validate graders offline.
export const SAMPLES = CHECKSamples;
