import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkFinalEvidenceV2, publishFinalEvidenceV2 } from '../core/evidence/final-v2.ts';
import { checkTerminalCompletion } from '../core/completion/preflight.ts';
import { captureSlopCheckpoint, publishSlopReview } from '../core/slop/review.ts';
import { canonicalFinalEvidenceV2Graph, validateFinalEvidenceV2GraphFiles } from '../core/evidence/final-v2-graph.ts';
import { servedProjectTreeSha256 } from '../core/render/serve.ts';
import { createAdaptiveSourceSealRoute } from '../core/source-seal/adaptive-inputs.ts';
import { writeSourceSeal } from '../core/source-seal/index.ts';
import { observationV2Sha256, writeObservationV2 } from '../core/runtime/observation.ts';
import { RenderedRefinementError } from '../core/runtime/rendered-refinement.ts';
import {
  FINAL_RENDER_REVIEWER_PACKET_INPUT_SCHEMA,
  FINAL_RENDER_REVIEWER_TRANSPORT_SCHEMA,
  finalRenderReviewerPacket,
  publishFinalRenderReviewerPacket,
} from '../core/runtime/final-render-review.ts';
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
import {
  authorizeTestProjectRunPayloads,
  createTestProjectRunInvocation,
  createTestProjectWriteAdapter,
  publishTestAdaptiveRoute,
} from './helpers/project-write.ts';
import { browserFixturePng, writeBrowserDecisionFixture } from './helpers/browser-observation-decision-links.ts';
import {
  publishCompletenessRun,
  publishTypographyApplicability,
  renderedIrEvidenceBytes,
  WORKFLOW_COMPLETENESS_RUN_INPUT_SCHEMA,
} from '../core/completion/evidence.ts';
import { FUNCTIONAL_REQUIREMENTS_V2_SCHEMA } from '../core/completeness/index.ts';
import { DESIGN_QUALITY_AXES } from '../core/evidence/final-v2-design-quality.ts';

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

function omissions(
  route: ReturnType<typeof createAdaptiveSourceSealRoute>,
  routeInput: unknown,
): readonly object[] {
  const mapping = [
    ['board', 'reference-board'], ['selection', 'reference-selection'], ['artDirection', 'art-direction'],
    ['handoff', 'art-direction'], ['usage', 'reference-selection'], ['renderedBeats', 'frame'],
    ['staticEvidence', 'art-direction'], ['motionEvidence', 'motion-one'],
    ['typeProof', 'type-proof'], ['composition', 'composition'],
  ] as const;
  const routeSha256 = route.record.sha256;
  const authoritySha256 = route.authority.sha256;
  const skips = list(field(routeInput, 'strategyDecision'), 'skips');
  return mapping.flatMap(([id, routeSkipId]) => {
    const skip = skips.find((entry) => text(entry, 'id') === routeSkipId);
    return skip === undefined ? [] : [{
      id, status: 'skipped', routeSkipId, reason: text(skip, 'reason'),
      routeSha256, authoritySha256,
    }];
  });
}

function fixtureWithSelectedUpstreamStages(): unknown {
  const value = structuredClone(fixture());
  const strategy = mutable(field(value, 'strategyDecision'));
  Reflect.set(strategy, 'roles', [
    ...list(strategy, 'roles'),
    'omd-framer', 'omd-scout',
  ]);
  Reflect.set(strategy, 'stages', [
    'domain', 'frame', 'scout', 'reference-board', 'copy', 'production',
    'browser-evidence', 'independent-review',
  ]);
  Reflect.set(strategy, 'executionWaves', [
    { id: 'frame', mode: 'concurrent', roles: ['omd-framer'] },
    { id: 'reference', mode: 'concurrent', roles: ['omd-scout'] },
    { id: 'copy', mode: 'concurrent', roles: ['omd-writer'] },
    { id: 'production', mode: 'concurrent', roles: ['omd-hand'] },
    { id: 'review', mode: 'concurrent', roles: ['omd-eye'] },
  ]);
  const selected = new Set(['frame', 'scout', 'reference-board']);
  Reflect.set(
    strategy,
    'skips',
    list(strategy, 'skips').filter((entry) => !selected.has(text(entry, 'id'))),
  );
  return value;
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
  const designQuality = {
    schema: 'design-quality-contract-v1',
    axes: DESIGN_QUALITY_AXES.map((axis) => ({
      axis,
      verdict: 'GREEN',
      score:
        axis === 'beautyDesirability' || axis === 'hierarchyComposition'
          ? 4
          : 3,
      crossViewport: 'preserved',
      criticalFailure: null,
      evidence: [
        {
          observationSha256,
          viewport: 'desktop',
          state: 'approved-copy-visible',
          region: 'primary work surface',
          visibleCondition: 'The intended priority is visible.',
          userConsequence: 'The next decision is legible.',
        },
        {
          observationSha256,
          viewport: 'mobile',
          state: 'approved-copy-visible',
          region: 'primary work surface',
          visibleCondition: 'The priority is recomposed.',
          userConsequence: 'Decision context remains available.',
        },
      ],
    })),
  };
  const configuration = name === 'blindLane'
    ? { schema: 'adaptive-blind-review-v3', verdicts: { blindVisual: 'GREEN', blindNarrative: 'GREEN' }, criticalFloors: { composition: 3, copy: 3 }, designQuality }
    : name === 'fidelityLane'
      ? { schema: 'adaptive-fidelity-review-v1', verdicts: { referenceFidelity: 'GREEN', renderFidelity: 'GREEN' }, criticalFloors: { desktop: 3, mobile: 3 } }
      : { schema: 'adaptive-protocol-review-v1', verdicts: { evidenceIntegrity: 'GREEN', publicationProtocol: 'GREEN' }, criticalFloors: { authority: 3, currentness: 3 } };
  const isolationReceiptSha256 = sha(`${name}:isolation`);
  const reviewerIds = [`${name}-reviewer-1`, `${name}-reviewer-2`];
  const executionReceipts = reviewerIds.map((reviewerId, index) => {
    const value = {
      schema: name === 'blindLane'
        ? 'adaptive-final-reviewer-execution-v2'
        : 'adaptive-final-reviewer-execution-v1',
      lane: name, reviewerId,
      verdicts: configuration.verdicts, criticalFloors: configuration.criticalFloors,
      ...('designQuality' in configuration
        ? { designQuality: configuration.designQuality }
        : {}),
      isolationReceiptSha256, observationSha256s: [observationSha256], routeSha256, buildSha256, briefSha256, browserSha256,
      childPid: ({ blindLane: 100, fidelityLane: 200, protocolLane: 300 })[name] + index, sessionId: `${name}-session-${index}`, nonce: `${name}-nonce-${index}`,
      evidenceSha256: sha(name === 'blindLane' ? `${name}:evidence` : `${name}:evidence:${index}`),
      configurationSha256: sha(name === 'blindLane' ? `${name}:configuration` : `${name}:configuration:${index}`),
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

function prepared(
  workflow = false,
  routeInput: unknown = fixture(),
): Readonly<{ root: string; invocation: ReturnType<typeof publishTestAdaptiveRoute>; manifest: unknown; graph: unknown }> {
  const root = project();
  const selectedStages = list(field(routeInput, 'strategyDecision'), 'stages');
  if (selectedStages.includes('type-proof')) {
    writeFileSync(join(root, '.omd', 'type-proof.md'), '# Approved type proof\n');
  }
  if (selectedStages.includes('composition')) {
    writeFileSync(join(root, '.omd', 'composition.md'), '# Approved composition\n');
  }
  const invocation = publishTestAdaptiveRoute(root, routeInput, 'adaptive-copy-final-v2');
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
  const mobileCapturePath = '.omd/copy-final-mobile.png';
  const mobileCapture = browserFixturePng(390, 844);
  writeFileSync(join(root, mobileCapturePath), mobileCapture);
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
    captures: [
      { path: capturePath, sha256: sha(capture), width: 1280, height: 900 },
      { path: mobileCapturePath, sha256: sha(mobileCapture), width: 390, height: 844 },
    ],
    transcript: [`assertion-pass:${'a'.repeat(64)}`],
  };
  const browserReceiptSha256 = trustedBrowserReceiptSha256(browserReceipt);
  writeJson(
    root,
    `.omd/trusted-browser-receipt-sha256-${browserReceiptSha256}.json`,
    browserReceipt,
  );
  const browserEvidence = browser.evidence([
    { path: capturePath, sha256: sha(capture), viewport: { width: 1280, height: 900 }, testedState: 'approved-copy-visible' },
    { path: mobileCapturePath, sha256: sha(mobileCapture), viewport: { width: 390, height: 844 }, testedState: 'approved-copy-visible' },
  ]);
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
      viewports: [{ width: 1280, height: 900 }, { width: 390, height: 844 }],
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
    viewports: [{ width: 1280, height: 900 }, { width: 390, height: 844 }],
    observations: [observationReceipt],
    findings: [],
  }, invocation);
  const productionGraph = {
    schema: 'final-evidence-v2-adaptive-omission-graph', activation: receipt(root, activationPath, 'activation-context-v2'), route,
    omissions: omissions(route, routeInput), copy: receipt(root, '.omd/copy-deck.md', 'copy-deck-v2'), sourceSeal: receipt(root, '.omd/source-seal.json', workflow ? 'source-seal-v2' : 'source-seal-v1'),
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

function publishPrepared(
  value: ReturnType<typeof prepared>,
  invocation = value.invocation,
): void {
  authorizeGraph(value.root, invocation, value.graph);
  const validated = validateFinalEvidenceV2GraphFiles(value.root, value.graph, fs, invocation);
  const submitted = {
    schema: field(value.manifest, 'schema'), motionDecision: field(value.manifest, 'motionDecision'),
    claimPublication: field(value.manifest, 'claimPublication'), graph: field(value.manifest, 'graph'), graphRootHash: validated.rootHash,
  };
  authorizeTestProjectRunPayloads(value.root, invocation, [{ purpose: 'final-evidence-manifest', payload: Buffer.from(`${canonical(submitted)}\n`) }]);
  publishFinalEvidenceV2(value.root, value.manifest, invocation);
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

test('execution requirements are reported only after real final publication and terminal checks', async () => {
  const routeInput = structuredClone(fixture());
  const requirements = [
    { requirement: 'Use the authorized production writer.', enforcedBy: ['project-write-boundary'] },
    { requirement: 'Pass independent review and final preflight.', enforcedBy: ['independent-review', 'completion-preflight'] },
  ];
  Reflect.set(mutable(field(routeInput, 'taskOutcome')), 'executionRequirements', requirements);
  const value = prepared(false, routeInput);
  try {
    assert.throws(() => checkTerminalCompletion(value.root, value.invocation));
    authorizeGraph(value.root, value.invocation, value.graph);
    const packet = JSON.parse(finalRenderReviewerPacket({
      root: value.root,
      invocation: value.invocation,
      packetInput: {
        schema: FINAL_RENDER_REVIEWER_PACKET_INPUT_SCHEMA,
        observationSha256s: list(value.graph, 'observations').map((entry) => text(entry, 'sha256')),
      },
    }).toString('utf8'));
    assert.equal(Object.hasOwn(packet.evidence.context.taskOutcome, 'executionRequirements'), false);
    assert.deepEqual(packet.evidence.context.taskOutcome.mustHave, field(field(routeInput, 'taskOutcome'), 'mustHave'));
    assert.deepEqual(readPersistedRoute(value.root, value.invocation).sourceContract.taskOutcome.executionRequirements, requirements);
    publishPrepared(value);
    const pointer = readFileSync(join(value.root, '.omd/final-evidence-v2.json'));
    const record = text(JSON.parse(pointer.toString('utf8')), 'record');
    authorizeTestProjectRunPayloads(value.root, value.invocation, [
      { purpose: 'final-reviewer-lane', payload: pointer },
      { purpose: 'final-evidence-manifest', payload: readFileSync(join(value.root, '.omd/final-evidence-v2-runs', record)) },
    ]);
    assert.throws(() => checkTerminalCompletion(value.root, value.invocation), /SLOP_REVIEW_REQUIRED/);
    const slop = await captureSlopCheckpoint(value.root, { schema: 'slop-scope-v1', views: [
      { id: 'desktop', page: 'src/copy/final.html', viewport: { width: 1280, height: 900 } },
      { id: 'mobile', page: 'src/copy/final.html', viewport: { width: 390, height: 844 } },
    ] }, createTestProjectWriteAdapter(value.root, value.invocation));
    publishSlopReview(value.root, { ...slop.reviewInput, summary: 'Synthetic final copy fixture: the approved sentence is visible in both native viewport captures.',
      decisions: slop.reviewInput.decisions.map(d => ({ ...d, status: 'dismissed', reason: 'The synthetic text-only fixture deliberately has no additional visual treatment.', viewIds: ['desktop', 'mobile'] })),
    }, createTestProjectWriteAdapter(value.root, value.invocation));
    const result = checkTerminalCompletion(value.root, value.invocation);
    assert.deepEqual(result.executionRequirements, {
      schema: 'execution-requirement-check-v1',
      sourceContractSha256: readPersistedRoute(value.root, value.invocation).sourceContractSha256,
      checkedAt: 'terminal-preflight',
      requirements,
    });
    const lanePath = text(field(value.graph, 'blindLane'), 'path');
    writeFileSync(join(value.root, lanePath), '{"schema":"caller-claims-review-passed"}\n');
    assert.throws(() => checkTerminalCompletion(value.root, value.invocation));
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('initial final-review packet carries only current anonymous production images and fixed bindings', () => {
  const value = prepared();
  try {
    authorizeGraph(value.root, value.invocation, value.graph);
    const observationSha256s = list(value.graph, 'observations').map((entry) => text(entry, 'sha256'));
    const packetInput = {
      schema: FINAL_RENDER_REVIEWER_PACKET_INPUT_SCHEMA,
      observationSha256s,
    };
    const bytes = finalRenderReviewerPacket({
      root: value.root,
      invocation: value.invocation,
      packetInput,
    });
    const packet = JSON.parse(bytes.toString('utf8')) as {
      schema: string;
      evidenceSha256: string;
      evidence: { renders: Array<{ captureSha256: string; viewport: string; pngBase64: string }> };
      outputContract: { fixedBindings: { evidenceSha256: string; observationSha256s: string[] } };
    };
    assert.equal(packet.schema, FINAL_RENDER_REVIEWER_TRANSPORT_SCHEMA);
    assert.deepEqual(packet.evidence.renders.map(({ viewport }) => viewport).sort(), ['desktop', 'mobile']);
    for (const render of packet.evidence.renders) {
      assert.equal(sha(Buffer.from(render.pngBase64, 'base64')), render.captureSha256);
    }
    assert.equal(packet.outputContract.fixedBindings.evidenceSha256, packet.evidenceSha256);
    assert.deepEqual(packet.outputContract.fixedBindings.observationSha256s, observationSha256s);
    assert.doesNotMatch(bytes.toString('utf8'), /testedUrl|\.omd\/refs|capturePath|"path"/);
    const receipt = publishFinalRenderReviewerPacket({
      root: value.root,
      invocation: value.invocation,
      writer: createTestProjectWriteAdapter(value.root, value.invocation),
      packetInput,
    });
    assert.equal(receipt.sha256, sha(readFileSync(join(value.root, receipt.path))));
    writeFileSync(join(value.root, '.omd', 'copy-final.png'), Buffer.from('stale'));
    assert.throws(() => finalRenderReviewerPacket({
      root: value.root,
      invocation: value.invocation,
      packetInput,
    }));
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('final-v2 publication and currentness fail closed on a dangling refinement checkpoint', () => {
  const beforePublication = prepared();
  try {
    writeFileSync(join(beforePublication.root, '.omd', 'refinement-checkpoint.json'), '{}\n');
    assert.throws(
      () => publishPrepared(beforePublication),
      (error: unknown) => error instanceof RenderedRefinementError,
    );
  } finally { rmSync(beforePublication.root, { recursive: true, force: true }); }

  const afterPublication = prepared();
  try {
    publishPrepared(afterPublication);
    const pointer = readFileSync(join(afterPublication.root, '.omd', 'final-evidence-v2.json'));
    const record = text(JSON.parse(pointer.toString('utf8')), 'record');
    authorizeGraph(afterPublication.root, afterPublication.invocation, afterPublication.graph);
    authorizeTestProjectRunPayloads(afterPublication.root, afterPublication.invocation, [
      { purpose: 'final-reviewer-lane', payload: pointer },
      {
        purpose: 'final-evidence-manifest',
        payload: readFileSync(join(afterPublication.root, '.omd', 'final-evidence-v2-runs', record)),
      },
    ]);
    writeFileSync(join(afterPublication.root, '.omd', 'refinement-checkpoint.json'), '{}\n');
    assert.throws(
      () => checkFinalEvidenceV2(afterPublication.root, afterPublication.invocation),
      (error: unknown) => error instanceof RenderedRefinementError,
    );
    assert.throws(
      () => checkTerminalCompletion(afterPublication.root, afterPublication.invocation),
      (error: unknown) => error instanceof RenderedRefinementError,
    );
  } finally { rmSync(afterPublication.root, { recursive: true, force: true }); }
});

test('selected adaptive stages require no contradictory skip receipts', () => {
  const value = prepared(false, fixtureWithSelectedUpstreamStages());
  try {
    assert.deepEqual(
      list(value.graph, 'omissions').map((entry) => text(entry, 'routeSkipId')),
      [
        'reference-selection', 'art-direction', 'art-direction', 'reference-selection',
        'art-direction', 'motion-one', 'type-proof', 'composition',
      ],
    );
    publishPrepared(value);
    authorizeGraph(value.root, value.invocation, value.graph);
    assert.equal(
      field(checkFinalEvidenceV2(value.root, value.invocation).graph, 'schema'),
      'final-evidence-v2-adaptive-omission-graph',
    );
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('sealed adaptive evidence finalizes under a continuation activation', () => {
  const value = prepared();
  try {
    const continuation = createTestProjectRunInvocation(value.root, 'finalize existing sealed evidence');
    assert.notEqual(continuation.current.briefSha256, value.invocation.current.briefSha256);
    publishPrepared(value, continuation);
    const pointer = readFileSync(join(value.root, '.omd', 'final-evidence-v2.json'));
    const record = text(JSON.parse(pointer.toString('utf8')), 'record');
    authorizeTestProjectRunPayloads(value.root, continuation, [
      { purpose: 'final-reviewer-lane', payload: pointer },
      {
        purpose: 'final-evidence-manifest',
        payload: readFileSync(join(value.root, '.omd', 'final-evidence-v2-runs', record)),
      },
    ]);
    assert.equal(
      field(checkFinalEvidenceV2(value.root, continuation).graph, 'schema'),
      'final-evidence-v2-adaptive-omission-graph',
    );
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
