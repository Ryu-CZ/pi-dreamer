// Benchmark executors. The real executor spawns the installed `pi` CLI with --mode json -p and
// parses stdout NDJSON events only (session header, message_end usage/cost/errors, tool calls);
// no prose parsing, no retries. The fake executor serves offline self-checks and tests only.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const NUM = value => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);

// Parse pi --mode json stdout. Returns { sessionId, usage, cost, errors, toolCalls, assistantText }.
// Usage fields that the stream did not report stay null (never guessed, never zero-filled).
// Cost becomes null when any assistant usage event lacks a numeric cost.total.
export function parsePiEvents(stdout, stderr) {
  const collected = { sessionId: null, usage: null, cost: null, errors: [], toolCalls: [], assistantText: '', assistantMessages: 0 };
  const elapsed = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };
  const seen = {};
  const missing = {};
  let costTotal = 0;
  let sawUsage = false;
  let costKnown = true;
  for (const line of String(stdout).split('\n')) {
    if (!line.startsWith('{')) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type === 'session' && event.id) collected.sessionId = collected.sessionId ?? event.id;
    if (event.type === 'tool_execution_start') {
      collected.toolCalls.push({ toolName: event.toolName, action: event.args?.action ?? null });
    }
    const message = event.type === 'message_end' ? event.message : null;
    if (message?.role !== 'assistant') continue;
    collected.assistantMessages++;
    if (message.stopReason === 'error' || message.stopReason === 'aborted') {
      collected.errors.push(message.errorMessage ?? `stopReason ${message.stopReason}`);
    }
    const text = Array.isArray(message.content)
      ? message.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
      : '';
    if (text) collected.assistantText = text;
    const usage = message.usage;
    if (usage) sawUsage = true;
    for (const field of ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens']) {
      const value = NUM(usage?.[field]);
      if (value !== null) { elapsed[field] += value; seen[field] = true; }
      else missing[field] = true;
    }
    const total = NUM(usage?.cost?.total);
    if (total !== null) costTotal += total;
    else costKnown = false; // any unknown per-call cost makes the phase cost unknown
  }
  const fields = ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens'];
  if (sawUsage && fields.some(field => seen[field])) {
    collected.usage = Object.fromEntries(fields.map(field => [field, seen[field] && !missing[field] ? elapsed[field] : null]));
  }
  if (sawUsage && costKnown) collected.cost = { total: Number(costTotal.toFixed(8)) };
  void stderr;
  return collected;
}

export function recordedUsage(events) {
  return { usage: events.usage, cost: events.cost };
}

// One pi invocation with a fixed timeout. Never retried. Captures transcripts for inspection.
export function runPiPhase({ argv, cwd, phaseTimeoutMs, piBin = 'pi', transcriptDir, label }) {
  const started = Date.now();
  const result = spawnSync(piBin, argv, { cwd, encoding: 'utf8', timeout: phaseTimeoutMs, maxBuffer: 8 * 1024 * 1024 });
  const durationMs = Date.now() - started;
  const timedOut = result.error?.code === 'ETIMEDOUT';
  const exitCode = result.status ?? null;
  const events = parsePiEvents(result.stdout ?? '', result.stderr ?? '');
  const transcript = {};
  if (transcriptDir) {
    mkdirSync(transcriptDir, { recursive: true, mode: 0o700 });
    for (const [name, content] of [[`${label}.jsonl`, result.stdout ?? ''], [`${label}.stderr`, result.stderr ?? '']]) {
      const path = join(transcriptDir, name);
      writeFileSync(path, content, { mode: 0o600 });
      transcript[name.replace('.', '_')] = path;
    }
  }
  return {
    argv, sessionId: events.sessionId, exitCode, timedOut,
    error: result.error?.message ?? (events.errors.length ? events.errors.join('; ') : events.assistantMessages ? null : 'Pi returned no assistant messages'),
    durationMs, usage: events.usage, cost: events.cost,
    toolCalls: events.toolCalls, assistantText: events.assistantText, transcript,
  };
}

export function hashString(text) {
  return createHash('sha256').update(text).digest('hex');
}
