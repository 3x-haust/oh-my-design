import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkFinalEvidenceV2, publishFinalEvidenceV2 } from '../core/evidence/final-v2.ts';
import { canonicalFinalEvidenceV2Graph, validateFinalEvidenceV2GraphFiles } from '../core/evidence/final-v2-graph.ts';
import { servedProjectTreeSha256 } from '../core/render/serve.ts';
import { createAdaptiveSourceSealRoute } from '../core/source-seal/adaptive-inputs.ts';
import { writeSourceSeal } from '../core/source-seal/index.ts';
import { observationV2Sha256, writeObservationV2 } from '../core/runtime/observation.ts';
import {
  TRUSTED_BROWSER_RECEIPT_SCHEMA,
  trustedBrowserReceiptSha256,
  type TrustedBrowserReceipt,
} from '../core/runtime/trusted-browser-receipt.ts';
import { readPersistedRoute } from '../core/route/adaptive-route-persistence.ts';
import { validateDecisionGraph } from '../core/deliberation/contracts.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import {
  deriveTrustedDecisionRefs,
  deriveTrustedEvaluationIdentity,
} from '../core/runtime/trusted-evaluation-contract.ts';
import { checkAdaptiveWorkflow, publishAdaptiveWorkflowPlan } from '../core/design-development/workflow-persistence.ts';
import { authorizeTestProjectRunPayloads, createTestProjectWriteAdapter, publishTestAdaptiveRoute } from './helpers/project-write.ts';
import { browserFixturePng, writeBrowserDecisionFixture } from './helpers/browser-observation-decision-links.ts';
import {
  publishCompletenessRun,
  publishTypographyApplicability,
  renderedIrEvidenceBytes,
  WORKFLOW_COMPLETENESS_RUN_INPUT_SCHEMA,
} from '../core/completion/evidence.ts';
import { FUNCTIONAL_REQUIREMENTS_V2_SCHEMA } from '../core/completeness/index.ts';

const fs = { readFile: readFileSync, lstat: lstatSync, open: openSync, fstat: fstatSync, close: closeSync };
const sha = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const fixture = (): unknown => JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/copy-only.json', import.meta.url), 'utf8'));
const canonical = canonicalFinalEvidenceV2Graph;
const receipt = (root: string, path: string, schema: string): Readonly<{ path: string; schema: string; sha256: string }> => ({ path, schema, sha256: sha(readFileSync(join(root, path))) });
const field = (value: unknown, key: string): unknown => typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
const list = (value: unknown, key: string): readonly unknown[] => {
  const result = field(value, key);
  if (!Array.isArray(result)) throw new Error(`${key} must be an array`);
  return result;
};
const text = (value: unknown, key: string): string => {
  const result = field(value, key);
  if (typeof result !== 'string') throw new Error(`${key} must be text`);
  return result;
};
const mutable = (value: unknown): object => {
  if (typeof value !== 'object' || value === null) throw new Error('expected mutable object');
  return value;
};

function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'omd-adaptive-final-v2-'));
  mkdirSync(join(root, '.omd', 'receipts'), { recursive: true });
  mkdirSync(join(root, 'src', 'copy'), { recursive: true });
  writeFileSync(join(root, 'src', 'copy', 'index.html'), '<main>Approved confirmation sentence.</main>\n');
  writeFileSync(join(root, '.omd', 'copy-deck.md'), '# Approved copy\n\nApproved confirmation sentence.\n');
  return root;
}

function writeJson(root: string, path: string, value: unknown): void {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), canonicalJson(value));
}

function omissions(route: ReturnType<typeof createAdaptiveSourceSealRoute>): readonly object[] {
  const mapping = [
    ['board', 'reference-board'], ['selection', 'reference-selection'], ['artDirection', 'art-direction'],
    ['handoff', 'art-direction'], ['usage', 'reference-selection'], ['renderedBeats', 'frame'],
    ['staticEvidence', 'art-direction'], ['motionEvidence', 'motion-one'],
    ['typeProof', 'type-proof'], ['composition', 'composition'],
  ] as const;
  const routeSha256 = route.record.sha256;
  const authoritySha256 = route.authority.sha256;
  const skips = list(field(fixture(), 'strategyDecision'), 'skips');
  return mapping.map(([id, routeSkipId]) => {
    const skip = skips.find((entry) => text(entry, 'id') === routeSkipId);
    if (skip === undefined) throw new Error(`missing ${routeSkipId} skip`);
    return { id, status: 'skipped', routeSkipId, reason: text(skip, 'reason'), routeSha256, authoritySha256 };
  });
}

function lane(
  root: string,
  name: 'blindLane' | 'fidelityLane' | 'protocolLane',
  routeSha256: string,
  buildSha256: string,
  briefSha256: string,
  browserSha256: string,
  observationSha256: string,
): Readonly<{ path: string; schema: string; sha256: string }> {
  const configuration = name === 'blindLane'
    ? { schema: 'adaptive-blind-review-v1', verdicts: { blindVisual: 'GREEN', blindNarrative: 'GREEN' }, criticalFloors: { composition: 3, copy: 3 } }
    : name === 'fidelityLane'
      ? { schema: 'adaptive-fidelity-review-v1', verdicts: { referenceFidelity: 'GREEN', renderFidelity: 'GREEN' }, criticalFloors: { desktop: 3, mobile: 3 } }
      : { schema: 'adaptive-protocol-review-v1', verdicts: { evidenceIntegrity: 'GREEN', publicationProtocol: 'GREEN' }, criticalFloors: { authority: 3, currentness: 3 } };
  const isolationReceiptSha256 = sha(`${name}:isolation`);
  const reviewerIds = [`${name}-reviewer-1`, `${name}-reviewer-2`];
  const executionReceipts = reviewerIds.map((reviewerId, index) => {
    const value = {
      schema: 'adaptive-final-reviewer-execution-v1', lane: name, reviewerId,
      verdicts: configuration.verdicts, criticalFloors: configuration.criticalFloors,
      isolationReceiptSha256, observationSha256s: [observationSha256], routeSha256, buildSha256, briefSha256, browserSha256,
      childPid: ({ blindLane: 100, fidelityLane: 200, protocolLane: 300 })[name] + index, sessionId: `${name}-session-${index}`, nonce: `${name}-nonce-${index}`,
      evidenceSha256: sha(`${name}:evidence:${index}`), configurationSha256: sha(`${name}:configuration:${index}`),
    };
    const path = `.omd/receipts/${name}-execution-${index}.json`;
    writeJson(root, path, value);
    return { path, sha256: sha(readFileSync(join(root, path))) };
  });
  const value = {
    ...configuration, routeSha256, buildSha256,
    isolationReceipt: { schema: 'reviewer-isolation-v1', sha256: isolationReceiptSha256 },
    quorum: { required: 2, passed: 2 },
    provenance: { observationSha256s: [observationSha256], reviewerIds, reviewerSessionSha256: isolationReceiptSha256 },
    executionReceipts,
  };
  const path = `.omd/receipts/${name}.json`;
  writeJson(root, path, value);
  return receipt(root, path, configuration.schema);
}

function prepared(workflow = false): Readonly<{ root: string; invocation: ReturnType<typeof publishTestAdaptiveRoute>; manifest: unknown; graph: unknown }> {
  const root = project();
  const invocation = publishTestAdaptiveRoute(root, fixture(), 'adaptive-copy-final-v2');
  if (workflow) publishAdaptiveWorkflowPlan(root, {
    development: { schema: 'design-development-contract-v1', owner: 'user-selected-model', mode: 'direct', risks: [], investigations: [], referencePrinciples: [], rationale: 'No material uncertainty remains.' },
    evidence: [], investigations: [], rationale: 'Proceed directly without phantom proofs.',
  }, createTestProjectWriteAdapter(root, invocation), invocation);
  const activationPath = '.omd/receipts/activation.json';
  writeJson(root, activationPath, invocation.activation);
  const buildPath = '.omd/receipts/build.json';
  writeJson(root, buildPath, { schemaVersion: 'omd-build-identity-v1', packageVersion: '1.0.0', buildSha256: invocation.current.buildSha256, sourceSkillSha256: invocation.current.loadedSkillSha256 });
  const browser = writeBrowserDecisionFixture(root);
  const capturePath = '.omd/copy-final.png';
  const capture = browserFixturePng(1280, 900);
  writeFileSync(join(root, capturePath), capture);
  mkdirSync(join(root, 'src', 'copy'), { recursive: true });
  const productionPath = 'src/copy/final.html';
  const productionBytes = Buffer.from('<main>approved copy</main>');
  writeFileSync(join(root, productionPath), productionBytes);
  writeSourceSeal(root, invocation);
  const buildReceipt = receipt(root, buildPath, 'omd-build-identity-v1');
  const route = createAdaptiveSourceSealRoute(root, invocation);
  const routeRecord = readPersistedRoute(root, invocation);
  const decisionGraphBytes = readFileSync(join(root, '.omd', 'decision-graph.json'));
  const decisionGraphSha256 = sha(decisionGraphBytes);
  const trustedIdentity = deriveTrustedEvaluationIdentity({
    sourceContractSha256: routeRecord.sourceContractSha256,
    taskOutcome: routeRecord.sourceContract.taskOutcome,
    evidenceClaims: routeRecord.sourceContract.evidenceClaims,
    allowedPaths: routeRecord.allowedPaths,
    entryPath: productionPath,
  });
  const decisionGraph = validateDecisionGraph(JSON.parse(decisionGraphBytes.toString('utf8')) as unknown);
  assert.ok(decisionGraph.value !== undefined);
  const browserReceipt: TrustedBrowserReceipt = {
    schema: TRUSTED_BROWSER_RECEIPT_SCHEMA,
    runId: 'adaptive-final-fixture',
    routeSha256: route.record.sha256,
    sourceContractSha256: routeRecord.sourceContractSha256,
    activationBuildSha256: invocation.current.buildSha256,
    productionRevisionSha256: servedProjectTreeSha256(root, productionPath),
    productionPath,
    testedUrl: 'http://127.0.0.1:1/index.html',
    decisionGraphSha256,
    outcomeResults: trustedIdentity.requiredOutcomeRefs.map((outcomeRef) => ({
      outcomeRef,
      status: 'pass' as const,
      findings: [],
    })),
    confirmedClaimRefs: trustedIdentity.confirmedClaimRefs,
    decisionRefs: deriveTrustedDecisionRefs(
      routeRecord.sourceContractSha256,
      decisionGraph.value.decisions,
    ),
    hardFloors: { behavior: 'pass', access: 'pass', safety: 'pass' },
    captures: [{ path: capturePath, sha256: sha(capture), width: 1280, height: 900 }],
    transcript: [`assertion-pass:${'a'.repeat(64)}`],
  };
  const browserReceiptSha256 = trustedBrowserReceiptSha256(browserReceipt);
  writeJson(
    root,
    `.omd/trusted-browser-receipt-sha256-${browserReceiptSha256}.json`,
    browserReceipt,
  );
  const browserEvidence = browser.evidence([{ path: capturePath, sha256: sha(capture), viewport: { width: 1280, height: 900 }, testedState: 'approved-copy-visible' }]);
  const observation = writeObservationV2(root, {
    currentArtifact: { path: buildReceipt.path, sha256: buildReceipt.sha256 }, buildSha256: invocation.current.buildSha256,
    observedAt: '2026-08-11T21:00:00.000Z', evidence: {
      ...browserEvidence,
      trustedOutcome: {
        schema: 'trusted-outcome-observation-v1',
        receiptSha256: browserReceiptSha256,
        routeSha256: browserReceipt.routeSha256,
        sourceContractSha256: browserReceipt.sourceContractSha256,
        activationBuildSha256: browserReceipt.activationBuildSha256,
        productionRevisionSha256: browserReceipt.productionRevisionSha256,
        outcomeResults: browserReceipt.outcomeResults,
        confirmedClaimRefs: browserReceipt.confirmedClaimRefs,
        decisionRefs: browserReceipt.decisionRefs,
        hardFloors: browserReceipt.hardFloors,
        captureSha256s: browserReceipt.captures.map((item) => item.sha256),
        transcriptSha256: sha(canonicalJson(browserReceipt.transcript)),
      },
    },
  }, createTestProjectWriteAdapter(root, invocation));
  const observationHash = observationV2Sha256(observation);
  const observationReceipt = receipt(root, `.omd/observation-v2/sha256-${observationHash}.json`, 'observation-v2');
  const requirements = {
    schema: FUNCTIONAL_REQUIREMENTS_V2_SCHEMA,
    requirements: [{
      id: 'R-1',
      kind: 'content',
      statement: 'Approved copy is visible.',
      label: 'Approved copy',
    }],
    evidence: {
      states: ['approved-copy-visible'],
      viewports: [{ width: 1280, height: 900 }],
    },
  };
  writeJson(root, '.omd/functional-requirements.json', requirements);
  const renderedIr = {
    meta: { source: 'dom', url: 'file://fixture/', viewportHeight: 900 },
    nodes: [{
      id: 'copy',
      name: 'p',
      type: 'TEXT',
      path: 'body > p',
      parent: null,
      box: { x: 0, y: 0, w: 320, h: 48 },
      children: [],
      text: 'Approved copy',
    }],
  };
  authorizeTestProjectRunPayloads(root, invocation, [{
    purpose: 'product-probe-result',
    payload: renderedIrEvidenceBytes(renderedIr),
  }]);
  const typographyApplicability = publishTypographyApplicability(root, renderedIr, invocation);
  publishCompletenessRun(root, {
    schema: workflow
      ? WORKFLOW_COMPLETENESS_RUN_INPUT_SCHEMA
      : 'functional-completeness-run-input-v2',
    requirements: receipt(
      root,
      '.omd/functional-requirements.json',
      FUNCTIONAL_REQUIREMENTS_V2_SCHEMA,
    ),
    buildIdentity: buildReceipt,
    sourceSeal: receipt(root, '.omd/source-seal.json', workflow ? 'source-seal-v2' : 'source-seal-v1'),
    typographyApplicability,
    testedUrl: 'file://fixture/',
    testedState: 'approved-copy-visible',
    viewports: [{ width: 1280, height: 900 }],
    observations: [observationReceipt],
    findings: [],
  }, invocation);
  const productionGraph = {
    schema: 'final-evidence-v2-adaptive-omission-graph', activation: receipt(root, activationPath, 'activation-context-v2'), route,
    omissions: omissions(route), copy: receipt(root, '.omd/copy-deck.md', 'copy-deck-v2'), sourceSeal: receipt(root, '.omd/source-seal.json', workflow ? 'source-seal-v2' : 'source-seal-v1'),
    buildIdentity: buildReceipt,
    blindLane: lane(root, 'blindLane', route.record.sha256, invocation.current.buildSha256, invocation.current.briefSha256, sha(readFileSync(join(root, '.omd', 'decision-graph.json'))), observationReceipt.sha256),
    fidelityLane: lane(root, 'fidelityLane', route.record.sha256, invocation.current.buildSha256, invocation.current.briefSha256, sha(readFileSync(join(root, '.omd', 'decision-graph.json'))), observationReceipt.sha256),
    protocolLane: lane(root, 'protocolLane', route.record.sha256, invocation.current.buildSha256, invocation.current.briefSha256, sha(readFileSync(join(root, '.omd', 'decision-graph.json'))), observationReceipt.sha256),
    observations: [observationReceipt],
  };
  const graph = workflow ? {
    ...productionGraph,
    schema: 'final-evidence-v2-workflow-graph-v1',
    productionSchema: 'final-evidence-v2-adaptive-omission-graph',
    workflow: checkAdaptiveWorkflow(root, invocation).binding,
  } : productionGraph;
  const persistedRoute = JSON.parse(readFileSync(join(root, route.record.path), 'utf8'));
  const manifest = { schema: 'final-evidence-v2', motionDecision: 'none', claimPublication: field(field(persistedRoute, 'sourceContract'), 'evidenceClaims'), graph };
  return { root, invocation, manifest, graph };
}

function authorizeGraph(root: string, invocation: ReturnType<typeof publishTestAdaptiveRoute>, graph: unknown): void {
  const observationDescriptor = list(graph, 'observations')[0];
  const observation = JSON.parse(readFileSync(join(root, text(observationDescriptor, 'path')), 'utf8')) as unknown;
  const trustedOutcome = field(field(observation, 'evidence'), 'trustedOutcome');
  const trustedReceiptSha256 = text(trustedOutcome, 'receiptSha256');
  const payloads: Array<
    | { purpose: 'final-reviewer-lane'; payload: Buffer }
    | { purpose: 'product-probe-result'; payload: Buffer }
  > = [{
    purpose: 'product-probe-result',
    payload: readFileSync(join(root, `.omd/trusted-browser-receipt-sha256-${trustedReceiptSha256}.json`)),
  }];
  for (const name of ['blindLane', 'fidelityLane', 'protocolLane']) {
    const descriptor = field(graph, name);
    const path = text(descriptor, 'path');
    const bytes = readFileSync(join(root, path));
    payloads.push({ purpose: 'final-reviewer-lane', payload: bytes });
    for (const execution of list(JSON.parse(bytes.toString('utf8')), 'executionReceipts')) {
      payloads.push({ purpose: 'final-reviewer-lane', payload: readFileSync(join(root, text(execution, 'path'))) });
    }
  }
  authorizeTestProjectRunPayloads(root, invocation, payloads);
}

function publishPrepared(value: ReturnType<typeof prepared>): void {
  authorizeGraph(value.root, value.invocation, value.graph);
  const validated = validateFinalEvidenceV2GraphFiles(value.root, value.graph, fs, value.invocation);
  const submitted = {
    schema: field(value.manifest, 'schema'), motionDecision: field(value.manifest, 'motionDecision'),
    claimPublication: field(value.manifest, 'claimPublication'), graph: field(value.manifest, 'graph'), graphRootHash: validated.rootHash,
  };
  authorizeTestProjectRunPayloads(value.root, value.invocation, [{ purpose: 'final-evidence-manifest', payload: Buffer.from(`${canonical(submitted)}\n`) }]);
  publishFinalEvidenceV2(value.root, value.manifest, value.invocation);
}

test('authorized copy-only adaptive omission publication reaches immutable final-v2 currentness', () => {
  const value = prepared();
  try {
    publishPrepared(value);
    authorizeGraph(value.root, value.invocation, value.graph);
    const pointer = readFileSync(join(value.root, '.omd', 'final-evidence-v2.json'));
    const record = text(JSON.parse(pointer.toString('utf8')), 'record');
    authorizeTestProjectRunPayloads(value.root, value.invocation, [
      { purpose: 'final-reviewer-lane', payload: pointer },
      { purpose: 'final-evidence-manifest', payload: readFileSync(join(value.root, '.omd', 'final-evidence-v2-runs', record)) },
    ]);
    assert.equal(field(checkFinalEvidenceV2(value.root, value.invocation).graph, 'schema'), 'final-evidence-v2-adaptive-omission-graph');
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('new routed final-v2 publication rejects missing requirements and completeness', () => {
  const value = prepared();
  try {
    rmSync(join(value.root, '.omd', 'functional-requirements.json'));
    rmSync(join(value.root, '.omd', 'completeness-current.json'));
    assert.throws(
      () => publishPrepared(value),
      /requires functional requirements and a completeness run/,
    );
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('additive workflow graph publishes direct routes without weakening production reviews or host authority', () => {
  const value = prepared(true);
  try {
    assert.equal(field(value.graph, 'schema'), 'final-evidence-v2-workflow-graph-v1');
    assert.equal(field(field(value.graph, 'workflow'), 'artifacts'), null);
    publishPrepared(value);
    authorizeGraph(value.root, value.invocation, value.graph);
    const pointer = readFileSync(join(value.root, '.omd', 'final-evidence-v2.json'));
    const record = text(JSON.parse(pointer.toString('utf8')), 'record');
    authorizeTestProjectRunPayloads(value.root, value.invocation, [
      { purpose: 'final-reviewer-lane', payload: pointer },
      { purpose: 'final-evidence-manifest', payload: readFileSync(join(value.root, '.omd', 'final-evidence-v2-runs', record)) },
    ]);
    assert.equal(field(checkFinalEvidenceV2(value.root, value.invocation).graph, 'schema'), 'final-evidence-v2-workflow-graph-v1');
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('workflow cannot be finalized through a legacy graph or after its pointer/record becomes stale', () => {
  const legacy = prepared(true);
  try {
    const graph = structuredClone(field(legacy.manifest, 'graph')) as Record<string, unknown>;
    graph.schema = graph.productionSchema; delete graph.productionSchema; delete graph.workflow;
    (graph.sourceSeal as Record<string, unknown>).schema = 'source-seal-v1';
    Reflect.set(mutable(legacy.manifest), 'graph', graph);
    assert.throws(() => publishPrepared(legacy), /workflow|source-seal/i);
  } finally { rmSync(legacy.root, { recursive: true, force: true }); }

  const stale = prepared(true);
  try {
    writeFileSync(join(stale.root, '.omd', 'workflow-plan.json'), '{}\n');
    assert.throws(() => publishPrepared(stale), /workflow|source seal|source-seal/i);
  } finally { rmSync(stale.root, { recursive: true, force: true }); }
});

test('adaptive omission publication rejects missing authority, changed skip, selected-model drift, pointer swap, and record swap', () => {
  for (const mutate of [
    (value: ReturnType<typeof prepared>) => rmSync(join(value.root, '.omd', 'route-authorities'), { recursive: true, force: true }),
    (value: ReturnType<typeof prepared>) => Reflect.set(mutable(list(value.graph, 'omissions')[0]), 'reason', 'changed reason'),
    (value: ReturnType<typeof prepared>) => {
      const route = structuredClone(field(value.graph, 'route'));
      Reflect.set(mutable(field(route, 'selectedModel')), 'revision', 'swapped-revision');
      Reflect.set(mutable(value.graph), 'route', route);
    },
    (value: ReturnType<typeof prepared>) => writeFileSync(join(value.root, '.omd', 'route.json'), readFileSync(join(value.root, '.omd', 'route-source.json'))),
    (value: ReturnType<typeof prepared>) => writeFileSync(join(value.root, text(field(field(value.graph, 'route'), 'record'), 'path')), '{}\n'),
  ]) {
    const value = prepared();
    try { mutate(value); assert.throws(() => publishPrepared(value)); }
    finally { rmSync(value.root, { recursive: true, force: true }); }
  }
});

test('a selected-art route shape cannot use the adaptive omission branch', () => {
  const value = prepared();
  try {
    const route = structuredClone(field(value.graph, 'route'));
    Reflect.set(mutable(value.graph), 'route', route);
    const stages = list(route, 'stages');
    const art = stages.find((stage) => text(stage, 'id') === 'art-direction');
    assert.ok(art !== undefined);
    const selectedArt = mutable(art);
    Reflect.set(selectedArt, 'status', 'selected');
    Reflect.deleteProperty(selectedArt, 'reason'); Reflect.deleteProperty(selectedArt, 'routeSha256'); Reflect.deleteProperty(selectedArt, 'authoritySha256');
    Reflect.set(selectedArt, 'artifacts', [{ path: '.omd/art-direction.json', sha256: sha('selected-art') }]);
    assert.throws(() => publishPrepared(value));
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});
