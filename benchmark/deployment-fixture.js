// Historical inputs are separate from future tasks and evaluator expectations.
const entry = (id, session, role, text) => ({
  sessionId: `rook-${session}`, entryId: id, role,
  timestamp: `2026-06-0${session}T09:${String(Number(id.slice(1))).padStart(2, '0')}:00.000Z`,
  text: `[${id}] ${text}`,
  ...(role === 'toolResult' ? { toolName: 'bash', isError: false } : {}),
});

export const DEPLOYMENT_HISTORY = {
  topic: 'rook deployment',
  history: [
    entry('R1', 1, 'user', 'Rook deployment artifacts are deploy/<service>.json, containing exactly service, replicas, metricsEndpoint, imagePolicy. A separate deploy/evidence.json maps each service and historical field to supporting logical source IDs.'),
    entry('R2', 1, 'user', 'For rook deployments use replicas=2 and imagePolicy=tag. This is the current decision.'),
    entry('R3', 1, 'toolResult', 'Environment inspection: metrics base port=9400; metrics endpoints use http://127.0.0.1:<base+offset>/metrics; registry=registry.rook.invalid. This is an observation of this environment, not a universal service rule.'),
    entry('R4', 2, 'assistant', 'Suggestion only: perhaps change replicas to 5 for all services; not approved or tested.'),
    entry('R5', 2, 'user', 'Supersedes only R2\'s imagePolicy decision: use imagePolicy=digest for future rook deployments; replicas remains 2.'),
    entry('R6', 2, 'toolResult', 'After the environment upgrade: metrics base port=9460; metrics endpoints use http://127.0.0.1:<base+offset>/metrics; registry=registry.rook.invalid. R3 records the earlier environment, not the current base.'),
    entry('R7', 3, 'user', 'For every rook service whose name starts worker-, replicas=1 overrides the default 2. Other services keep 2.'),
    entry('R8', 3, 'user', 'Docs preview uses port 3000. This is unrelated to rook deployment metrics.'),
  ],
  forwardNotes: [
    { title: 'Rook deployment files', kind: 'procedure', text: 'Deployment files are deploy/<service>.json with exactly service, replicas, metricsEndpoint, imagePolicy. deploy/evidence.json maps services and historical fields to supporting logical source IDs.', derivedFrom: ['R1'] },
    { title: 'Rook deployment policy', kind: 'decision', text: 'As of session 1, rook deployments use replicas=2 and imagePolicy=tag.', derivedFrom: ['R2'] },
    { title: 'Rook metrics environment', kind: 'observation', text: 'Session 1 observation: metrics base port=9400; endpoint is http://127.0.0.1:<base+offset>/metrics.', derivedFrom: ['R3'] },
    { title: 'Rook registry', kind: 'observation', text: 'Rook registry is registry.rook.invalid.', derivedFrom: ['R3'] },
  ],
};

const evidenceInstructions = 'Evidence must use nonempty arrays of unique supporting logical historical source labels. Include sufficient current support; relevant superseded context may accompany it, but unrelated references are forbidden.';

export const DEPLOYMENT_TASKS = {
  main: {
    scaffold: { 'README.md': 'Rook deployment workspace.\n' },
    taskPrompt: `Create deployment artifacts for api-blue with offset 7 and worker-queue with offset 13, following rook's current conventions. Save files, not just chat. Each service JSON object must contain exactly service (string), replicas (integer), metricsEndpoint (string), imagePolicy (string). Do not create extra service artifacts. Also create the project's evidence sidecar: exactly the two requested service keys, each mapping exactly replicas, metricsEndpoint and imagePolicy to source-label arrays. ${evidenceInstructions}`,
  },
  diagnostic: {
    scaffold: { 'README.md': 'Rook registry workspace.\n' },
    taskPrompt: `Write deploy/registry.json with exactly registry (string) and sourceIds (array), using rook's registry. Save the file, not just chat. ${evidenceInstructions}`,
  },
};
