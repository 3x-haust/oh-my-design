import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTrustedBrowserEvaluation } from '../../adapters/trusted-browser-runner.ts';
import { captureDesignExecutionPolicy } from '../../core/config/design-execution.ts';
import { loadTerminalProcess } from '../../core/evidence/final-v2-process.ts';
import type { VerifiedJudgment } from '../../core/judgment/index.ts';
import type { LocaleDesignRoute } from '../../core/locale/design-context.ts';
import { loadReviewPolicy } from '../../core/measure/review-policy.ts';
import { servedProjectTreeSha256 } from '../../core/render/serve.ts';
import { canonicalRouteJson } from '../../core/route/adaptive-source-contract.ts';
import { publishAdaptiveRoute } from '../../core/route/adaptive-route-persistence.ts';
import { adaptiveRouteRecordSha256, readPersistedRoute } from '../../core/route/adaptive-route-persistence.ts';
import { authorizeTestPayloads, type TestPayloadAuthorization } from '../../core/runtime/activation.ts';
import type { ProjectRunInvocation } from '../../core/runtime/invocation.ts';
import {
  authorizeNativePiPayload,
  createTestNativePiInvocation,
  getNativePiRun,
  isNativePiInvocation,
  type NativePiHost,
} from '../../core/runtime/native-pi-run.ts';
import { observationV2Sha256 } from '../../core/runtime/observation.ts';
import { createProjectWriteAdapter } from '../../core/runtime/project-write.ts';
import { signNativeObservation } from '../../core/runtime/self-signed-activation.ts';
import {
  deriveTrustedDecisionRefs,
  deriveTrustedEvaluationIdentity,
  parseTrustedLifecycleManifest,
} from '../../core/runtime/trusted-evaluation-contract.ts';
import { writeTrustedEvaluationObservation } from '../../core/runtime/trusted-evaluation-observation.ts';
import { validateDecisionGraph } from '../../core/deliberation/contracts.ts';
import type { DeveloperEvaluationSnapshot } from '../../core/coach/developer-evaluation-contract.ts';
import { inputSkeleton } from '../../core/schema/inputs.ts';
import {
  captureMeasuredSlopCheckpoint,
  publishMeasuredSlopReview,
} from '../../core/slop/measured-review.ts';
import { createAdaptiveSourceSealRoute } from '../../core/source-seal/adaptive-inputs.ts';
import { writeSourceSeal } from '../../core/source-seal/index.ts';
import { capturePiRequest } from '../../extensions/omd-request-source.ts';
import { observePiReviewPurpose } from '../../extensions/omd-review-purpose.ts';
import { writeBrowserDecisionFixture } from './browser-observation-decision-links.ts';

const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const cliPath = fileURLToPath(new URL('../../bin/omd.ts', import.meta.url));
const host: NativePiHost = {
  nodePath: realpathSync(process.execPath),
  nodeSha256: hash(readFileSync(process.execPath)),
  cliPath,
  cliSha256: hash(readFileSync(cliPath)),
  provider: 'test-provider',
  model: 'test-model',
  thinkingLevel: 'high',
  parentSessionId: 'test-session',
};

export function modelLedInput(request = 'Build the requested interface.'): Record<string, unknown> {
  const input = structuredClone(inputSkeleton('product-route-input').skeleton) as Record<string, unknown>;
  input.request = request;
  input.allowedPaths = ['src/**', 'package.json', 'package-lock.json', 'dist/**', 'index.html'];
  return input;
}

export function authorizeModelLedPayloads(
  root: string,
  invocation: ProjectRunInvocation,
  authorizations: readonly TestPayloadAuthorization[],
): void {
  if (!isNativePiInvocation(invocation)) {
    authorizeTestPayloads(invocation, root, authorizations);
    return;
  }
  for (const authorization of authorizations) {
    authorizeNativePiPayload(invocation, root, authorization.purpose, authorization.payload);
  }
}

export function createModelLedRouteContext(
  root: string,
  request: string,
  options: Readonly<{
    calibration?: DeveloperEvaluationSnapshot;
    current?: ProjectRunInvocation['current'];
  }> = {},
) {
  const invocation = createTestNativePiInvocation({
    root,
    host,
    current: options.current ?? {
      buildSha256: hash('build'),
      loadedSkillSha256: hash('skill'),
      briefSha256: hash(request),
    },
    ...(options.calibration === undefined ? {} : { calibration: options.calibration }),
    designPolicy: captureDesignExecutionPolicy({}),
  });
  const run = getNativePiRun(invocation, root);
  mkdirSync(join(root, '.omd/native-pi'), { recursive: true });
  writeFileSync(join(root, '.omd/native-pi/run.json'), canonicalRouteJson({
    schema: 'native-pi-run-v1',
    run,
    signature: signNativeObservation(root, 'pi-run', hash(canonicalRouteJson(run))),
  }));
  capturePiRequest(root, request);
  observePiReviewPurpose(root, request, 'pi-rpc');
  return { invocation, writer: createProjectWriteAdapter(root, invocation) };
}

export function publishModelLedRoute(
  root: string,
  input: Record<string, unknown>,
  request = String(input.request),
  localeDesign?: LocaleDesignRoute,
  marketJudgment?: VerifiedJudgment,
) {
  const { invocation, writer } = createModelLedRouteContext(root, request);
  publishAdaptiveRoute(root, input, writer, invocation, localeDesign, marketJudgment);
  return { invocation, writer };
}

export async function publishModelLedMeasuredEvidence(input: {
  root: string;
  invocation: ProjectRunInvocation;
  writer: ReturnType<typeof createProjectWriteAdapter>;
  entryPath: string;
  buildIdentityPath: string;
  selector: string;
  visibleText: string;
  action?: Readonly<{ kind: 'click'; selector: string }>;
}) {
  const route = readPersistedRoute(input.root, input.invocation);
  writeBrowserDecisionFixture(input.root);
  const decisionBytes = readFileSync(join(input.root, '.omd/decision-graph.json'));
  const decisionGraph = validateDecisionGraph(JSON.parse(decisionBytes.toString('utf8'))).value;
  if (decisionGraph === undefined) throw new Error('model-led measured fixture needs a valid decision graph');
  const identity = deriveTrustedEvaluationIdentity({
    sourceContractSha256: route.sourceContractSha256,
    taskOutcome: route.sourceContract.taskOutcome,
    evidenceClaims: route.sourceContract.evidenceClaims,
    allowedPaths: route.allowedPaths,
    entryPath: input.entryPath,
  });
  const evaluation = await runTrustedBrowserEvaluation({
    root: input.root,
    manifest: parseTrustedLifecycleManifest({
      schema: 'trusted-lifecycle-manifest-v1',
      entryPath: input.entryPath,
      scripts: identity.requiredOutcomeRefs.map((outcomeRef) => ({
        outcomeRef,
        actions: input.action === undefined ? [] : [input.action],
        assertions: [{
          kind: 'visible-text',
          selector: input.selector,
          text: input.visibleText,
        }],
      })),
    }),
    binding: {
      runId: 'model-led-test-run',
      routeSha256: adaptiveRouteRecordSha256(route),
      sourceContractSha256: route.sourceContractSha256,
      activationBuildSha256: input.invocation.current.buildSha256,
      productionRevisionSha256: servedProjectTreeSha256(input.root, input.entryPath),
      productionPath: input.entryPath,
      decisionGraphSha256: hash(decisionBytes),
      requiredOutcomeRefs: identity.requiredOutcomeRefs,
      confirmedClaimRefs: identity.confirmedClaimRefs,
      decisionRefs: deriveTrustedDecisionRefs(
        route.sourceContractSha256,
        decisionGraph.decisions,
      ),
    },
    artifacts: {
      write: (path, bytes) => input.writer.writeContentAddressed(path, bytes),
    },
  });
  const observation = writeTrustedEvaluationObservation({
    root: input.root,
    writer: input.writer,
    invocation: input.invocation,
    evaluation,
    currentArtifactPath: input.buildIdentityPath,
    productionArtifactPath: input.entryPath,
    requireDecisionGraph: true,
  });
  authorizeModelLedPayloads(input.root, input.invocation, [{
    purpose: 'product-probe-result',
    payload: readFileSync(join(
      input.root,
      `.omd/trusted-browser-receipt-sha256-${evaluation.receiptSha256}.json`,
    )),
  }]);
  const observationSha256 = observationV2Sha256(observation);
  const stateGroups = new Map<string, typeof evaluation.receipt.captures>();
  for (const capture of evaluation.receipt.captures) {
    const state = capture.measurement?.state;
    if (state === undefined) continue;
    stateGroups.set(state, [...(stateGroups.get(state) ?? []), capture]);
  }
  const [testedState, stateCaptures] = [...stateGroups.entries()]
    .toSorted((left, right) => {
      const unique = (captures: typeof evaluation.receipt.captures) =>
        new Set(captures.map((capture) => `${capture.measurement!.viewport.width}x${capture.measurement!.viewport.height}`)).size;
      return unique(right[1]) - unique(left[1]);
    })[0] ?? [];
  if (testedState === undefined || stateCaptures === undefined) {
    throw new Error('model-led measured fixture did not retain a measured state');
  }
  const viewports = [...new Map(stateCaptures.map((capture) => [
    `${capture.measurement!.viewport.width}x${capture.measurement!.viewport.height}`,
    capture.measurement!.viewport,
  ])).values()];
  return {
    route,
    evaluation,
    observation,
    observationSha256,
    observationReceipt: {
      path: `.omd/observation-v2/sha256-${observationSha256}.json`,
      schema: 'observation-v2',
      sha256: observationSha256,
    },
    testedUrl: stateCaptures[0]?.testedUrl ?? evaluation.receipt.testedUrl,
    testedState,
    viewports,
    measurements: [...new Map(
      evaluation.receipt.captures.map((capture) => [
        capture.measurement!.packet.sha256,
        capture.measurement!.packet,
      ]),
    ).values()],
  };
}

export async function modelLedMeasuredTerminalFixture(
  t: { after(fn: () => void): void },
  options: Readonly<{ reviewSlop?: boolean }> = {},
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-model-led-measured-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const request = 'Build an order confirmation with the approved confirmation sentence.';
  const input = modelLedInput(request);
  input.taskOutcome = {
    schema: 'task-outcome-contract-v1',
    goal: 'Show the approved order confirmation.',
    mustHave: ['Approved confirmation sentence is visible.'],
    mustNotHave: ['Do not claim delivery or external persistence.'],
    completionEvidence: ['Desktop and mobile browser captures show the approved sentence.'],
    strategyFreedom: ['Choose the implementation details.'],
  };
  const entry = 'src/copy/final.html';
  mkdirSync(join(root, 'src/copy'), { recursive: true });
  writeFileSync(join(root, entry), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Order receipt</title><style>
*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font:400 16px/1.5 Arial,sans-serif}main{min-height:100vh;padding:32px}h1{font:700 36px/1.2 Arial,sans-serif;margin:0 0 12px}.summary{font-size:18px;margin:0 0 16px}.review{margin:0 0 24px;padding:10px 16px;border:2px solid #164a35;background:#164a35;color:#fff;font:700 16px/1.4 Arial,sans-serif}.review:focus-visible{outline:3px solid #111;outline-offset:3px}.items{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.item{min-height:150px;border:1px solid #aaa;background:#f7f7f7}.item:nth-child(3n+1){padding:12px 16px}.item:nth-child(3n+2){padding:20px 24px}.item:nth-child(3n){padding:28px 32px}.item strong{display:block;font-size:18px;margin-bottom:12px}@media(max-width:700px){main{padding:18px 20px 30px}.items{grid-template-columns:1fr;gap:12px}.item{min-height:110px}}
</style><main><h1>Order receipt</h1><p class="summary">Approved confirmation sentence.</p><button class="review" type="button">Review receipt</button><section class="items">${Array.from({ length: 12 }, (_, index) => `<article class="item"><strong>Item ${index + 1}</strong><span>Review the recorded quantity and delivery details shown on this receipt.</span></article>`).join('')}</section></main></html>`);
  const { invocation, writer } = publishModelLedRoute(root, input, request);
  writeFileSync(join(root, '.omd/build.json'), `${canonicalRouteJson({
    schemaVersion: 'omd-build-identity-v1',
    packageVersion: '1',
    buildSha256: invocation.current.buildSha256,
    sourceSkillSha256: invocation.current.loadedSkillSha256,
  })}\n`);
  writeFileSync(join(root, '.omd/activation-record.json'), canonicalRouteJson(invocation.activation));
  writeSourceSeal(root, invocation);
  const measured = await publishModelLedMeasuredEvidence({
    root,
    invocation,
    writer,
    entryPath: entry,
    buildIdentityPath: '.omd/build.json',
    selector: 'main',
    visibleText: 'Approved confirmation sentence.',
  });
  if (measured.evaluation.receipt.hardFloors.access !== 'pass') {
    throw new Error(`model-led measured fixture access findings: ${JSON.stringify(
      measured.evaluation.receipt.transcript.filter((line) => line.startsWith('access-finding:')),
    )}`);
  }
  const checkpoint = captureMeasuredSlopCheckpoint(
    root,
    { schema: 'slop-measured-scope-v2', measurements: measured.measurements },
    writer,
    invocation,
  );
  if (checkpoint.findings.length !== 0) {
    throw new Error(`model-led measured fixture has slop findings: ${JSON.stringify(
      checkpoint.findings.map((finding) => finding.rule),
    )}`);
  }
  const slop = options.reviewSlop === false
    ? null
    : publishMeasuredSlopReview(root, {
      ...checkpoint.reviewInput,
      summary: 'Inspected the exact retained order confirmation captures.',
    }, writer, invocation);
  return {
    root,
    input,
    entry,
    invocation,
    writer,
    route: measured.route,
    evaluation: measured.evaluation,
    measurements: measured.measurements,
    observationSha256s: [measured.observationSha256],
    checkpoint,
    slop,
  };
}

export function reviewedModelLedGraph(
  fixture: Awaited<ReturnType<typeof modelLedMeasuredTerminalFixture>>,
) {
  const route = createAdaptiveSourceSealRoute(fixture.root, fixture.invocation);
  const receipt = (path: string, schema: string) => ({
    path,
    schema,
    sha256: hash(readFileSync(join(fixture.root, path))),
  });
  return {
    schema: 'final-evidence-v2-adaptive-omission-graph',
    activation: receipt('.omd/activation-record.json', 'activation-context-v2'),
    route,
    omissions: [],
    sourceSeal: receipt('.omd/source-seal.json', 'source-seal-v1'),
    buildIdentity: receipt('.omd/build.json', 'omd-build-identity-v1'),
    observations: fixture.observationSha256s.map((sha256) =>
      receipt(`.omd/observation-v2/sha256-${sha256}.json`, 'observation-v2')),
    measuredTerminal: {
      schema: 'measured-terminal-graph-v1',
      measurements: fixture.measurements,
      reviewPolicy: loadReviewPolicy(fixture.root, fixture.invocation),
      slop: {
        checkpoint: fixture.checkpoint.checkpoint,
        review: fixture.slop!,
      },
      process: loadTerminalProcess(
        fixture.root,
        fixture.invocation,
        fixture.observationSha256s,
      )!.binding,
      lanes: {},
    },
  };
}

export function modelLedFixture(t: { after(fn: () => void): void }, request = 'Build the requested interface.') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-model-led-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = modelLedInput(request);
  const { invocation, writer } = publishModelLedRoute(root, input, request);
  mkdirSync(join(root, 'src/copy'), { recursive: true });
  writeFileSync(join(root, 'src/copy/confirmation.ts'), 'export const confirmation = true;\n');
  return { root, invocation, writer, packRoot: fileURLToPath(new URL('../../core', import.meta.url)) };
}
