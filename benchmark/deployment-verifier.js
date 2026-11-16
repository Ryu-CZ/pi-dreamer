// Evaluator-only oracle. Never include this module in model inputs.
const EXPECTED = {
  'api-blue': { service: 'api-blue', replicas: 2, metricsEndpoint: 'http://127.0.0.1:9467/metrics', imagePolicy: 'digest' },
  'worker-queue': { service: 'worker-queue', replicas: 1, metricsEndpoint: 'http://127.0.0.1:9473/metrics', imagePolicy: 'digest' },
};
const SUPPORT = {
  'api-blue': {
    replicas: { allowed: ['R2', 'R5', 'R7'], sufficient: [['R2'], ['R5'], ['R7']] },
    metricsEndpoint: { allowed: ['R3', 'R6'], sufficient: [['R6']] },
    imagePolicy: { allowed: ['R2', 'R5'], sufficient: [['R5']] },
  },
  'worker-queue': {
    replicas: { allowed: ['R2', 'R5', 'R7'], sufficient: [['R7']] },
    metricsEndpoint: { allowed: ['R3', 'R6'], sufficient: [['R6']] },
    imagePolicy: { allowed: ['R2', 'R5'], sufficient: [['R5']] },
  },
};
const REGISTRY_SUPPORT = { allowed: ['R3', 'R6'], sufficient: [['R3'], ['R6']] };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keysEqual = (value, keys) => object(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const parse = text => { try { return JSON.parse(text); } catch { return null; } };

function supports(labels, rule) {
  return Array.isArray(labels) && labels.length > 0 && new Set(labels).size === labels.length
    && labels.every(label => rule.allowed.includes(label))
    && rule.sufficient.some(subset => subset.every(label => labels.includes(label)));
}

// files is a complete relative-path -> UTF-8 text map supplied by the evaluator.
// This pure function never reads solver-modifiable inputs to construct expected values.
export function gradeDeployment(task, files) {
  const artifactFailures = [];
  const evidenceFailures = [];
  if (!object(files) || !['main', 'diagnostic'].includes(task)) {
    return { artifact: false, evidence: false, joint: false,
      artifactFailures: ['invalid task or file map'], evidenceFailures: ['invalid task or file map'] };
  }
  if (task === 'main') {
    const paths = Object.keys(files).filter(path => path.startsWith('deploy/') && path !== 'deploy/evidence.json');
    const expectedPaths = Object.keys(EXPECTED).map(service => `deploy/${service}.json`);
    if (paths.sort().join('|') !== expectedPaths.sort().join('|')) artifactFailures.push('expected exactly the two service artifacts');
    for (const [service, expected] of Object.entries(EXPECTED)) {
      const actual = parse(files[`deploy/${service}.json`]);
      if (!keysEqual(actual, Object.keys(expected)) || Object.entries(expected).some(([key, value]) => actual?.[key] !== value)) {
        artifactFailures.push(`${service}: wrong fields, types or values`);
      }
    }
    const evidence = parse(files['deploy/evidence.json']);
    if (!keysEqual(evidence, Object.keys(SUPPORT))) evidenceFailures.push('expected exactly the two evidence service keys');
    for (const [service, fields] of Object.entries(SUPPORT)) {
      const citations = evidence?.[service];
      if (!keysEqual(citations, Object.keys(fields))) evidenceFailures.push(`${service}: wrong evidence field keys`);
      for (const [field, rule] of Object.entries(fields)) {
        if (!supports(citations?.[field], rule)) evidenceFailures.push(`${service}.${field}: insufficient or unrelated sources`);
      }
    }
  } else {
    const actual = parse(files['deploy/registry.json']);
    if (!keysEqual(actual, ['registry', 'sourceIds']) || actual?.registry !== 'registry.rook.invalid') {
      artifactFailures.push('registry: wrong fields, types or value');
    }
    if (!supports(actual?.sourceIds, REGISTRY_SUPPORT)) evidenceFailures.push('registry: insufficient or unrelated sources');
  }
  const artifact = artifactFailures.length === 0;
  const evidence = evidenceFailures.length === 0;
  return { artifact, evidence, joint: artifact && evidence, artifactFailures, evidenceFailures };
}
