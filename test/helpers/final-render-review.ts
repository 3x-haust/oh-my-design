import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { servedProjectTreeSha256 } from '../../core/render/serve.ts';
import {
  ART_DIRECTION_RECORD_SCHEMA_VERSION,
  ART_DIRECTION_SCHEMA_VERSION,
  artDirectionSha256,
} from '../../core/art-direction/schema.ts';
import { canonicalJson } from '../../core/ref/board-artifacts.ts';
import {
  adaptiveRouteRecordSha256,
  readPersistedRoute,
} from '../../core/route/adaptive-route-persistence.ts';
import { observationV2Sha256, writeObservationV2 } from '../../core/runtime/observation.ts';
import {
  TRUSTED_BROWSER_RECEIPT_SCHEMA,
  trustedBrowserReceiptSha256,
  type TrustedBrowserReceipt,
} from '../../core/runtime/trusted-browser-receipt.ts';
import {
  deriveTrustedDecisionRefs,
  deriveTrustedEvaluationIdentity,
} from '../../core/runtime/trusted-evaluation-contract.ts';
import { validateDecisionGraph } from '../../core/deliberation/contracts.ts';
import {
  authorizeTestProjectRunPayloads,
  createTestProjectWriteAdapter,
  publishTestAdaptiveRoute,
} from './project-write.ts';
import { browserFixturePng, writeBrowserDecisionFixture } from './browser-observation-decision-links.ts';

const sha256 = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');

export function prepareFinalRenderReviewFixture(
  routeFixture: 'copy-only' | 'synth-marketing' = 'copy-only',
): Readonly<{
  root: string;
  invocation: ReturnType<typeof publishTestAdaptiveRoute>;
  observationSha256s: readonly string[];
}> {
  const root = mkdtempSync(join(tmpdir(), 'omd-final-render-review-'));
  mkdirSync(join(root, '.omd'), { recursive: true });
  mkdirSync(join(root, 'src', 'copy'), { recursive: true });
  writeFileSync(join(root, '.omd', 'copy-deck.md'), '# Approved copy\n');
  const productionPath = routeFixture === 'synth-marketing'
    ? 'index.html'
    : 'src/copy/final.html';
  writeFileSync(join(root, productionPath), '<main>Approved copy</main>\n');
  const routeInput = JSON.parse(readFileSync(
    new URL(`../fixtures/adaptive-flow/${routeFixture}.json`, import.meta.url),
    'utf8',
  )) as unknown;
  const invocation = publishTestAdaptiveRoute(root, routeInput, 'final-render-review');
  if (routeFixture === 'synth-marketing') {
    const h = (character: string): string => character.repeat(64);
    const alternative = {
      register: 'quiet', subjectIdentityFit: 'The supplied identity supports the direction.',
      metaphorQualities: ['measured precision'], literalPropsToReject: ['literal ornament'],
      staticReferenceSlotIds: ['static'], motionReferenceSlotIds: [],
      conceptRole: 'A focused product narrative.',
      macroCompositionHypothesis: 'A clear asymmetric hierarchy.', motionHypothesis: 'none',
      uxAccessibilityPerformanceRisks: ['Maintain legible contrast.'],
      lawfulImplementationPath: 'Use project-owned CSS.',
      rejectionCondition: 'Rendered hierarchy does not hold.',
    };
    const decision = {
      schemaVersion: ART_DIRECTION_SCHEMA_VERSION,
      activationSha256: h('1'), intentSha256: h('2'), boardSha256: h('3'),
      preSelectionSha256: h('4'), route: '/', source: 'explicit-user',
      consideredAlternatives: [alternative], selectedRegister: 'quiet', motionDecision: 'none',
      conceptRole: alternative.conceptRole,
      metaphorQualities: alternative.metaphorQualities,
      literalPropsToReject: alternative.literalPropsToReject,
      selectedStaticReferenceSlotIds: ['static'], selectedMotionReferenceSlotIds: [],
      alternativesSha256: h('5'), motionResolutionProjectionSha256: h('6'),
      settledSelectionSha256: h('7'), implementationLane: 'CSS',
      fallbackPath: 'Keep the static hierarchy.',
      performanceAccessibilityBudget: 'Preserve contrast and avoid blocking assets.',
      rejectedAlternatives: [], authorInvocationSha256: h('8'), authorPayloadSha256: h('9'),
      authorResultSha256: h('a'), currentUserBeatExceptionReceiptSha256: h('b'),
    };
    const artRecord = {
      schemaVersion: ART_DIRECTION_RECORD_SCHEMA_VERSION,
      decision,
      decisionSha256: artDirectionSha256(decision),
      referenceHandoffSha256: h('c'), intentLedgerSha256: decision.intentSha256,
      activationSha256: decision.activationSha256, beatIds: ['B-1'],
    };
    const currentSha256 = artDirectionSha256(artRecord);
    const record = `art-direction-runs/sha256-${currentSha256}.json`;
    mkdirSync(join(root, '.omd', 'art-direction-runs'), { recursive: true });
    writeFileSync(join(root, '.omd', record), `${canonicalJson(artRecord)}\n`);
    writeFileSync(join(root, '.omd', 'art-direction.json'), `${canonicalJson({
      schemaVersion: 'art-direction-current-v2',
      record,
      sha256: currentSha256,
    })}\n`);
  }
  const browser = writeBrowserDecisionFixture(root);
  const desktopPath = '.omd/final-desktop.png';
  const mobilePath = '.omd/final-mobile.png';
  const desktop = browserFixturePng(1280, 900);
  const mobile = browserFixturePng(390, 844);
  writeFileSync(join(root, desktopPath), desktop);
  writeFileSync(join(root, mobilePath), mobile);
  const buildPath = '.omd/build.json';
  const buildValue = {
    schemaVersion: 'omd-build-identity-v1',
    packageVersion: '1.0.0',
    buildSha256: invocation.current.buildSha256,
    sourceSkillSha256: invocation.current.loadedSkillSha256,
  };
  writeFileSync(join(root, buildPath), `${canonicalJson(buildValue)}\n`);
  const buildReceipt = { path: buildPath, sha256: sha256(readFileSync(join(root, buildPath))) };
  const route = readPersistedRoute(root, invocation);
  const decisionGraphBytes = readFileSync(join(root, '.omd', 'decision-graph.json'));
  const decisionGraph = validateDecisionGraph(JSON.parse(decisionGraphBytes.toString('utf8')) as unknown);
  if (decisionGraph.value === undefined) throw new Error('test decision graph is missing its value');
  const trustedIdentity = deriveTrustedEvaluationIdentity({
    sourceContractSha256: route.sourceContractSha256,
    taskOutcome: route.sourceContract.taskOutcome,
    evidenceClaims: route.sourceContract.evidenceClaims,
    allowedPaths: route.allowedPaths,
    entryPath: productionPath,
  });
  const receipt: TrustedBrowserReceipt = {
    schema: TRUSTED_BROWSER_RECEIPT_SCHEMA,
    runId: 'final-render-review-fixture',
    routeSha256: adaptiveRouteRecordSha256(route),
    sourceContractSha256: route.sourceContractSha256,
    activationBuildSha256: invocation.current.buildSha256,
    productionRevisionSha256: servedProjectTreeSha256(root, productionPath),
    productionPath,
    testedUrl: 'http://127.0.0.1:1/index.html',
    decisionGraphSha256: sha256(decisionGraphBytes),
    outcomeResults: trustedIdentity.requiredOutcomeRefs.map((outcomeRef) => ({
      outcomeRef,
      status: 'pass' as const,
      findings: [],
    })),
    confirmedClaimRefs: trustedIdentity.confirmedClaimRefs,
    decisionRefs: deriveTrustedDecisionRefs(route.sourceContractSha256, decisionGraph.value.decisions),
    hardFloors: { behavior: 'pass', access: 'pass', safety: 'pass' },
    captures: [
      { path: desktopPath, sha256: sha256(desktop), width: 1280, height: 900 },
      { path: mobilePath, sha256: sha256(mobile), width: 390, height: 844 },
    ],
    transcript: [`assertion-pass:${'a'.repeat(64)}`],
  };
  const receiptSha256 = trustedBrowserReceiptSha256(receipt);
  const receiptBytes = Buffer.from(`${canonicalJson(receipt)}\n`);
  writeFileSync(
    join(root, `.omd/trusted-browser-receipt-sha256-${receiptSha256}.json`),
    receiptBytes,
  );
  authorizeTestProjectRunPayloads(root, invocation, [{
    purpose: 'product-probe-result',
    payload: receiptBytes,
  }]);
  const evidence = browser.evidence([
    { path: desktopPath, sha256: sha256(desktop), viewport: { width: 1280, height: 900 }, testedState: 'initial' },
    { path: mobilePath, sha256: sha256(mobile), viewport: { width: 390, height: 844 }, testedState: 'initial' },
  ]);
  const observation = writeObservationV2(root, {
    currentArtifact: buildReceipt,
    buildSha256: invocation.current.buildSha256,
    observedAt: '2026-09-06T00:00:00.000Z',
    evidence: {
      ...evidence,
      trustedOutcome: {
        schema: 'trusted-outcome-observation-v1',
        receiptSha256,
        routeSha256: receipt.routeSha256,
        sourceContractSha256: receipt.sourceContractSha256,
        activationBuildSha256: receipt.activationBuildSha256,
        productionRevisionSha256: receipt.productionRevisionSha256,
        outcomeResults: receipt.outcomeResults,
        confirmedClaimRefs: receipt.confirmedClaimRefs,
        decisionRefs: receipt.decisionRefs,
        hardFloors: receipt.hardFloors,
        captureSha256s: receipt.captures.map(({ sha256: digest }) => digest),
        transcriptSha256: sha256(canonicalJson(receipt.transcript)),
      },
    },
  }, createTestProjectWriteAdapter(root, invocation));
  return Object.freeze({
    root,
    invocation,
    observationSha256s: Object.freeze([observationV2Sha256(observation)]),
  });
}
