import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
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
  TRUSTED_BROWSER_EXECUTION_RECEIPT_SCHEMA,
  parseTrustedBrowserReceipt,
  trustedBrowserReceiptSha256,
  type TrustedBrowserReceipt,
} from '../../core/runtime/trusted-browser-receipt.ts';
import {
  deriveTrustedDecisionRefs,
  deriveTrustedEvaluationIdentity,
  trustedEvaluationPlanBytes,
  type TrustedLifecycleManifest,
} from '../../core/runtime/trusted-evaluation-contract.ts';
import { validateDecisionGraph } from '../../core/deliberation/contracts.ts';
import { browserObservationSha256, designDecisionSha256 } from '../../core/runtime/browser-observation.ts';
import { createTestProjectWriteAdapter } from './project-write.ts';
import { writeBrowserDecisionFixture } from './browser-observation-decision-links.ts';
import { publishModelLedRoute } from './model-led.ts';
import { measureProject } from '../../core/measure/index.ts';
import { loadMeasurement } from '../../core/measure/files.ts';
import { authorizeNativePiPayload } from '../../core/runtime/native-pi-run.ts';
import { requireProductProbeResultAuthorization } from '../../core/runtime/invocation.ts';

const sha256 = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');

export async function prepareFinalRenderReviewFixture(
  routeFixture: 'copy-only' | 'synth-marketing' = 'copy-only',
  options: Readonly<{
    withGraphHistory?: boolean;
    fillValue?: string;
    executionScripts?: (scripts: TrustedLifecycleManifest['scripts']) => TrustedLifecycleManifest['scripts'];
  }> = {},
): Promise<Readonly<{
  root: string;
  invocation: ReturnType<typeof publishModelLedRoute>['invocation'];
  observationSha256s: readonly string[];
}>> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-final-render-review-')));
  mkdirSync(join(root, '.omd'), { recursive: true });
  mkdirSync(join(root, 'src', 'copy'), { recursive: true });
  writeFileSync(join(root, '.omd', 'copy-deck.md'), '# Approved copy\n');
  const productionPath = routeFixture === 'synth-marketing'
    ? 'index.html'
    : 'src/copy/final.html';
  writeFileSync(join(root, productionPath), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Approved copy</title><style>
*{box-sizing:border-box}body{margin:0;background:#f7f7f5;color:#17201b;font:400 18px/1.5 Arial,sans-serif}main{max-width:760px;margin:auto;padding:64px 24px}input{display:block;width:100%;min-height:44px;margin-bottom:24px;font:inherit}
</style><main>${options.fillValue === undefined ? '' : '<input aria-label="Review value">'}<h1>Approved copy</h1><p>Review the approved confirmation sentence.</p></main></html>\n`);
  const routeInput = JSON.parse(readFileSync(
    new URL(`../fixtures/adaptive-flow/${routeFixture}.json`, import.meta.url),
    'utf8',
  )) as unknown;
  const { invocation } = publishModelLedRoute(
    root,
    routeInput as Record<string, unknown>,
    String((routeInput as Record<string, unknown>).request),
  );
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
  const testedUrl = 'http://127.0.0.1/index.html';
  const browser = writeBrowserDecisionFixture(root, testedUrl);
  const buildPath = '.omd/build.json';
  const buildValue = {
    schemaVersion: 'omd-build-identity-v1',
    packageVersion: '1.0.0',
    buildSha256: invocation.current.buildSha256,
    sourceSkillSha256: invocation.current.loadedSkillSha256,
  };
  writeFileSync(join(root, buildPath), `${canonicalJson(buildValue)}\n`);
  const buildReceipt = { path: buildPath, sha256: sha256(readFileSync(join(root, buildPath))) };
  const writer = createTestProjectWriteAdapter(root, invocation);
  const measured = await measureProject({ root, entry: productionPath, writer, invocation });
  const packet = loadMeasurement(root, measured.packet);
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
  const scripts: TrustedLifecycleManifest['scripts'] = trustedIdentity.requiredOutcomeRefs.map((outcomeRef, index) => ({
      outcomeRef, actions: index === 0 && options.fillValue !== undefined
        ? [{ kind: 'fill' as const, selector: 'input', value: options.fillValue }] : [],
      assertions: [{ kind: 'visible-text', selector: 'main', text: 'Approved copy' }],
    }));
  const executionPlan = trustedEvaluationPlanBytes({
    schema: 'trusted-lifecycle-manifest-v1', entryPath: productionPath,
    scripts: options.executionScripts?.(scripts) ?? scripts,
  });
  const executionPlanSha256 = sha256(executionPlan);
  mkdirSync(join(root, '.omd/evaluation-plans'), { recursive: true });
  writeFileSync(join(root, `.omd/evaluation-plans/sha256-${executionPlanSha256}.json`), executionPlan);
  const captures = packet.scope.map(view => {
    const capture = packet.captures.find(candidate => candidate.viewId === view.id)!;
    return {
      path: capture.capture.path,
      sha256: capture.capture.sha256,
      width: capture.image.width,
      height: capture.image.height,
      testedUrl,
      measurement: {
        packet: measured.packet,
        viewId: view.id,
        browserZoom: view.browserZoom,
        state: view.state,
        stateRecipeSha256: view.stateRecipeSha256,
        viewport: view.viewport,
        layoutViewport: view.viewport,
      },
    };
  });
  const receipt: TrustedBrowserReceipt = {
    schema: TRUSTED_BROWSER_EXECUTION_RECEIPT_SCHEMA,
    executionPlanSha256,
    runId: 'final-render-review-fixture',
    routeSha256: adaptiveRouteRecordSha256(route),
    sourceContractSha256: route.sourceContractSha256,
    activationBuildSha256: invocation.current.buildSha256,
    productionRevisionSha256: servedProjectTreeSha256(root, productionPath),
    productionPath,
    testedUrl,
    decisionGraphSha256: sha256(decisionGraphBytes),
    outcomeResults: trustedIdentity.requiredOutcomeRefs.map((outcomeRef) => ({
      outcomeRef,
      status: 'pass' as const,
      findings: [],
    })),
    confirmedClaimRefs: trustedIdentity.confirmedClaimRefs,
    decisionRefs: deriveTrustedDecisionRefs(route.sourceContractSha256, decisionGraph.value.decisions),
    hardFloors: { behavior: 'pass', access: 'pass', safety: 'pass' },
    captures,
    transcript: [`assertion-pass:${'a'.repeat(64)}`],
  };
  const receiptSha256 = trustedBrowserReceiptSha256(receipt);
  const receiptBytes = Buffer.from(`${canonicalJson(receipt)}\n`);
  const parsedReceipt = parseTrustedBrowserReceipt(JSON.parse(receiptBytes.toString('utf8')) as unknown);
  if (trustedBrowserReceiptSha256(parsedReceipt) !== receiptSha256) {
    throw new Error('test trusted browser receipt changed during canonical parsing');
  }
  writeFileSync(
    join(root, `.omd/trusted-browser-receipt-sha256-${receiptSha256}.json`),
    receiptBytes,
  );
  authorizeNativePiPayload(invocation, root, 'product-probe-result', receiptBytes);
  requireProductProbeResultAuthorization(invocation, root, receiptBytes);
  const evidence = browser.evidence(captures.map(capture => ({
    path: capture.path,
    sha256: capture.sha256,
    viewport: capture.measurement.layoutViewport,
    testedState: capture.measurement.state,
    measurement: capture.measurement,
  })));
  const observationSha256s: string[] = [];
  if (options.withGraphHistory) {
    const decisions = decisionGraph.value.decisions.map(item => ({ ...item, question: 'Which earlier composition keeps context?' }));
    const historicalBytes = Buffer.from(`${canonicalJson({ schema: 'decision-graph-v1', decisions })}\n`);
    writer.writeContentAddressed(`.omd/decision-graphs/sha256-${sha256(historicalBytes)}.json`, historicalBytes);
    writeFileSync(join(root, '.omd', 'decision-graph.json'), historicalBytes);
    const observations = evidence.browserObservations.observations.map(item => {
      const core = { ...item, decisionRefs: decisions.map(decision => ({
        decisionId: decision.id, decisionSha256: designDecisionSha256(decision),
      })) };
      return { ...core, observationSha256: browserObservationSha256(core) };
    });
    const historical = writeObservationV2(root, {
      currentArtifact: buildReceipt, buildSha256: invocation.current.buildSha256,
      observedAt: '2026-09-05T00:00:00.000Z',
      evidence: { browserObservations: {
        ...evidence.browserObservations, decisionGraphSha256: sha256(historicalBytes), observations,
      } },
    }, writer);
    observationSha256s.push(observationV2Sha256(historical));
    writeFileSync(join(root, '.omd', 'decision-graph.json'), decisionGraphBytes);
  }
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
  }, writer);
  observationSha256s.push(observationV2Sha256(observation));
  return Object.freeze({
    root,
    invocation,
    observationSha256s: Object.freeze(observationSha256s),
  });
}
