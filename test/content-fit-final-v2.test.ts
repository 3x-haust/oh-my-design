import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { contentGrainDecisionToken, contentGrainSha256, parseContentGrain } from '../core/content-grain/contract.ts';
import { browserObservationSha256, designDecisionSha256, type BrowserObservationCore } from '../core/runtime/browser-observation.ts';
import type { DesignDecision } from '../core/deliberation/contracts.ts';
import { validateAdaptiveFinalEvidenceV2Graph } from '../core/evidence/final-v2-adaptive-contract.ts';
import { adaptiveFinalEvidenceV2RootHash } from '../core/evidence/final-v2-adaptive-files.ts';
import { FinalV2ContentFitError, validateFinalV2ContentFitCurrentness } from '../core/evidence/final-v2-content-fit.ts';

const sha = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const receipt = (path: string, schema: string, digest = sha(path)) => ({ path, schema, sha256: digest });
const selectedRoute = (selected: boolean) => ({ strategy: { stages: selected ? ['content-grain'] : [] } });
const code = (expected: FinalV2ContentFitError['code']) => (error: unknown): boolean =>
  error instanceof FinalV2ContentFitError && error.code === expected;

function fitProject(): Readonly<{
  root: string;
  descriptor: Readonly<{ path: string; schema: string; sha256: string }>;
  evidence: readonly unknown[];
}> {
  const root = mkdtempSync(join(tmpdir(), 'omd-content-fit-final-v2-'));
  mkdirSync(join(root, '.omd'), { recursive: true });
  const grain = parseContentGrain({
    schema: 'content-grain-v1', status: 'active',
    sources: [{ id: 'catalog', authority: 'project-first-party', path: 'content/catalog.json', sha256: 'a'.repeat(64) }],
    fixtures: [
      { id: 'typical', sourceId: 'catalog', locator: '$.items[0]', role: 'typical' },
      { id: 'maximum', sourceId: 'catalog', locator: '$.items[1]', role: 'maximum' },
    ],
    traits: [{
      id: 'description-length', sourceIds: ['catalog'], fixtureIds: ['typical', 'maximum'],
      metric: { kind: 'range', unit: 'graphemes', minimum: 10, typical: 40, maximum: 160 },
      semanticRole: 'primary-proof', antiTemplateConsequence: 'Allow unequal proof regions.',
      responsiveConsequence: 'Keep long proof with its action.', falsifier: 'Long proof clips.',
    }],
  });
  writeFileSync(join(root, '.omd', 'content-grain.json'), `${canonicalJson(grain)}\n`);
  const grainSha256 = contentGrainSha256(grain);
  const token = contentGrainDecisionToken(grainSha256, 'description-length');
  const decision: DesignDecision = {
    id: 'description-layout', stage: 'composition', risk: 'medium', owner: 'omd-composer',
    question: 'How should descriptions retain their semantic priority?',
    alternatives: [{ id: 'equal', label: 'Equal cards' }, { id: 'grain', label: 'Grain-led regions' }],
    selected: 'grain', evidence: [token], constraints: ['Long proof remains adjacent to its action'],
    rejected: [{ id: 'equal', reason: 'Equal cards clip the maximum fixture.' }],
    affects: ['zone:services'], dependsOn: [], reversible: true, tradeoffs: [],
  };
  const graphBytes = Buffer.from(`${canonicalJson({ schema: 'decision-graph-v1', decisions: [decision] })}\n`);
  writeFileSync(join(root, '.omd', 'decision-graph.json'), graphBytes);
  const checks = (['typical', 'maximum'] as const).flatMap((fixtureId) =>
    (['desktop', 'mobile'] as const).map((viewport) => {
      const dimensions = viewport === 'desktop' ? { width: 1280, height: 900 } : { width: 390, height: 844 };
      const core: BrowserObservationCore = {
        schema: 'browser-observation-v1', testedUrl: 'file://fixture/',
        testedState: `${fixtureId}-${viewport}`, viewport: dimensions,
        observableResult: { kind: 'screenshot', capture: { path: `.omd/.cache/${fixtureId}-${viewport}.png`, sha256: sha(`${fixtureId}:${viewport}`) }, result: { measurement: 'viewport-pixels', ...dimensions } },
        decisionRefs: [{ decisionId: decision.id, decisionSha256: designDecisionSha256(decision) }],
      };
      return { traitId: 'description-length', fixtureId, viewport, observationSha256: browserObservationSha256(core), core };
    }),
  );
  const fit = {
    schema: 'content-fit-receipt-v1', status: 'fit',
    grain: { path: '.omd/content-grain.json', schema: 'content-grain-v1', sha256: grainSha256 },
    decisionGraphSha256: sha(graphBytes),
    checks: checks.map(({ core: _core, ...check }) => check),
  };
  writeFileSync(join(root, '.omd', 'content-fit.json'), `${canonicalJson(fit)}\n`);
  const descriptor = receipt('.omd/content-fit.json', 'content-fit-receipt-v1', sha(readFileSync(join(root, '.omd', 'content-fit.json'))));
  const evidence = [{ browserObservations: {
    schema: 'browser-observation-set-v1', decisionGraphSha256: sha(graphBytes),
    observations: checks.map(({ core }) => ({ ...core, observationSha256: browserObservationSha256(core) })),
  } }];
  return { root, descriptor, evidence };
}

function graph(contentFit?: Readonly<{ path: string; schema: string; sha256: string }>): unknown {
  const routeHash = sha('route'); const authorityHash = sha('authority');
  const stages = ['art-direction', 'copy', 'type-proof', 'composition'].map((id) => ({
    id, status: 'skipped', reason: `${id} skipped`, routeSha256: routeHash, authoritySha256: authorityHash,
  }));
  const routeReceipt = (path: string, digest = sha(path)) => ({ path, sha256: digest });
  const route = {
    schema: 'adaptive-source-seal-route-v1', pointer: routeReceipt('.omd/route.json'),
    record: routeReceipt('.omd/route-record.json', routeHash), sourcePointer: routeReceipt('.omd/route-source.json'),
    sourceContract: routeReceipt('.omd/route-source-record.json'), authority: routeReceipt('.omd/route-authority.json', authorityHash),
    selectedModel: {}, stages,
  };
  const omissions = [
    ['board', 'reference-board'], ['selection', 'reference-selection'], ['artDirection', 'art-direction'],
    ['handoff', 'art-direction'], ['usage', 'reference-selection'], ['renderedBeats', 'frame'],
    ['staticEvidence', 'art-direction'], ['motionEvidence', 'motion-one'], ['typeProof', 'type-proof'], ['composition', 'composition'],
  ].map(([id, routeSkipId]) => ({ id, status: 'skipped', routeSkipId, reason: `${routeSkipId} skipped`, routeSha256: routeHash, authoritySha256: authorityHash }));
  return {
    schema: 'final-evidence-v2-adaptive-omission-graph', activation: receipt('.omd/activation.json', 'activation-context-v2'), route, omissions,
    copy: receipt('.omd/copy.md', 'copy-deck-v2'), sourceSeal: receipt('.omd/source-seal.json', 'source-seal-v1'),
    buildIdentity: receipt('.omd/build.json', 'omd-build-identity-v1'), blindLane: receipt('.omd/blind.json', 'adaptive-blind-review-v1'),
    fidelityLane: receipt('.omd/fidelity.json', 'adaptive-fidelity-review-v1'), protocolLane: receipt('.omd/protocol.json', 'adaptive-protocol-review-v1'),
    ...(contentFit === undefined ? {} : { contentFit }), observations: [receipt('.omd/observation.json', 'observation-v2')],
  };
}

test('selected content grain requires a current fit receipt', () => {
  const value = fitProject();
  try {
    assert.throws(() => validateFinalV2ContentFitCurrentness({ root: value.root, route: selectedRoute(true), observations: value.evidence }), code('CONTENT_FIT_REQUIRED'));
    assert.doesNotThrow(() => validateFinalV2ContentFitCurrentness({ root: value.root, route: selectedRoute(true), contentFit: value.descriptor, observations: value.evidence }));
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('skipped content grain rejects an invented fit receipt', () => {
  const value = fitProject();
  try {
    assert.throws(() => validateFinalV2ContentFitCurrentness({ root: value.root, route: selectedRoute(false), contentFit: value.descriptor, observations: value.evidence }), code('CONTENT_FIT_FORBIDDEN'));
    assert.doesNotThrow(() => validateFinalV2ContentFitCurrentness({ root: value.root, route: selectedRoute(false), observations: value.evidence }));
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('content fit changes the final graph root', () => {
  const withoutFit = validateAdaptiveFinalEvidenceV2Graph(graph());
  const withFit = validateAdaptiveFinalEvidenceV2Graph(graph(receipt('.omd/content-fit.json', 'content-fit-receipt-v1')));
  assert.notEqual(adaptiveFinalEvidenceV2RootHash(withoutFit), adaptiveFinalEvidenceV2RootHash(withFit));
});
