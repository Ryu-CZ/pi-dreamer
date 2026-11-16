#!/usr/bin/env node
// Canned harness reproduction only. No model backend is invoked; execution uses only the canned executor.
import { parseArgs } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runDeploymentSweep } from './deployment-sweep.js';

try {
  const { values } = parseArgs({ allowPositionals: false, options: { out: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) {
    console.log('Usage: node benchmark/deployment-offline.js --out FRESH_DIRECTORY\nScripted harness checks only: no-op dreams, known-answer artifacts, zero model calls.');
  } else {
    if (!values.out?.trim()) throw new Error('--out FRESH_DIRECTORY is required');
    let scriptedInvocations = 0;
    const report = await runDeploymentSweep({
      outDir: values.out, provider: 'offline-scripted', model: 'known-answer-fixture', repeats: 3,
      executor: { run: async context => {
        scriptedInvocations++;
        // Dream is deliberately a no-op. No tool activity or learning is simulated.
        if (context.kind === 'solve') {
          const artifacts = context.task === 'main' ? {
            'api-blue.json': { service: 'api-blue', replicas: 2, metricsEndpoint: 'http://127.0.0.1:9467/metrics', imagePolicy: 'digest' },
            'worker-queue.json': { service: 'worker-queue', replicas: 1, metricsEndpoint: 'http://127.0.0.1:9473/metrics', imagePolicy: 'digest' },
            'evidence.json': {
              'api-blue': { replicas: ['R7'], metricsEndpoint: ['R6'], imagePolicy: ['R5'] },
              'worker-queue': { replicas: ['R7'], metricsEndpoint: ['R6'], imagePolicy: ['R5'] },
            },
          } : { 'registry.json': { registry: 'registry.rook.invalid', sourceIds: ['R6'] } };
          mkdirSync(join(context.workspace, 'deploy'));
          for (const [name, artifact] of Object.entries(artifacts)) writeFileSync(join(context.workspace, 'deploy', name), JSON.stringify(artifact), { mode: 0o600 });
        }
        return { exitCode: 0, timedOut: false, error: null, durationMs: null, usage: null, cost: null };
      } },
    });
    report.check = {
      label: 'OFFLINE SCRIPTED HARNESS CHECK: no-op dreams and known-answer artifacts; not memory-quality evidence',
      realModelCalls: 0, scriptedInvocations,
    };
    const reportPath = join(resolve(values.out), 'report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
    const successful = report.exposures.filter(exposure => exposure.joint).length;
    console.log(JSON.stringify({ ...report.check, successful, planned: report.exposures.length, reportPath, fatal: report.fatal }, null, 2));
    if (report.fatal || successful !== 18 || scriptedInvocations !== 21) process.exitCode = 1;
  }
} catch (error) {
  console.error(`offline deployment check failed: ${error.message}`);
  process.exitCode = 2;
}
