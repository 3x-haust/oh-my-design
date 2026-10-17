import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureDesignExecutionPolicy } from '../core/config/design-execution.ts';
import { verifyDirectionAutonomyGrant } from '../core/brief/candidate-authority.ts';
import { fileReceipt, hash } from '../core/brief/candidate-data.ts';
import { createTestNativePiInvocation, getNativePiRun, type NativePiHost } from '../core/runtime/native-pi-run.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { canonicalRouteJson } from '../core/route/adaptive-source-contract.ts';
import { bindNativeDesignRouteInput } from '../core/route/native-design-policy.ts';
import { capturePiRequest } from '../extensions/omd-request-source.ts';
import { observePiReviewPurpose } from '../extensions/omd-review-purpose.ts';
import { publishAdaptiveRoute, readPersistedRoute } from '../core/route/index.ts';
import { createProjectWriteAdapter } from '../core/runtime/project-write.ts';
import { routeInput } from './helpers/phase6-process.ts';
import { checkProductionReadiness } from '../core/brief/production-readiness.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { modelLedRouteInput } from '../core/schema/candidate-selection.ts';

const request = 'Create a populated support inbox with a detail panel.';
const cliPath = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const host: NativePiHost = {
  nodePath: realpathSync(process.execPath), nodeSha256: hash(readFileSync(process.execPath)),
  cliPath, cliSha256: hash(readFileSync(cliPath)), provider: 'test-provider',
  model: 'test-model', thinkingLevel: 'high', parentSessionId: 'test-session',
};
function fixture(t: { after(fn: () => void): void }, developer = false, brief = request) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-native-design-authority-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const invocation = createTestNativePiInvocation({
    root, host, current: { buildSha256: hash('build'), loadedSkillSha256: hash('skill'), briefSha256: hash(brief) },
    designPolicy: captureDesignExecutionPolicy(developer ? { OMD_DESIGN_MODE: 'developer-evaluation' } : {}),
  });
  const run = getNativePiRun(invocation, root);
  const record = {
    schema: 'native-pi-run-v1', run,
    signature: signNativeObservation(root, 'pi-run', hash(canonicalRouteJson(run))),
  };
  const path = '.omd/native-pi/run.json';
  mkdirSync(join(root, '.omd/native-pi'), { recursive: true });
  writeFileSync(join(root, path), canonicalRouteJson(record));
  return { root, run, record, path, invocation };
}

for (const developer of [false, true]) {
  test(`signed native ${developer ? 'developer' : 'ordinary'} policy authorizes harness choice without a user answer`, t => {
    const f = fixture(t, developer);
    const grant = verifyDirectionAutonomyGrant(f.root, fileReceipt(f.root, f.path), request);
    assert.equal(grant.source, 'native-host-policy');
    assert.equal('userMessage' in grant, false);
  });
}

test('native design authority rejects changed request, forged signature and relocated run records', t => {
  const f = fixture(t);
  assert.throws(() => verifyDirectionAutonomyGrant(f.root, fileReceipt(f.root, f.path), `${request} changed`));
  writeFileSync(join(f.root, '.omd/relocated.json'), canonicalRouteJson(f.record));
  assert.throws(() => verifyDirectionAutonomyGrant(f.root, fileReceipt(f.root, '.omd/relocated.json'), request));
  writeFileSync(join(f.root, f.path), canonicalRouteJson({ ...f.record, signature: 'forged' }));
  assert.throws(() => verifyDirectionAutonomyGrant(f.root, fileReceipt(f.root, f.path), request));
});

test('historical native runs without a captured policy are not implicit design grants', t => {
  const f = fixture(t);
  const invocation = createTestNativePiInvocation({ root: f.root, host, current: {
    buildSha256: hash('build'), loadedSkillSha256: hash('skill'), briefSha256: hash(request),
  } });
  const run = getNativePiRun(invocation, f.root);
  writeFileSync(join(f.root, f.path), canonicalRouteJson({
    schema: 'native-pi-run-v1', run,
    signature: signNativeObservation(f.root, 'pi-run', hash(canonicalRouteJson(run))),
  }));
  assert.throws(() => verifyDirectionAutonomyGrant(f.root, fileReceipt(f.root, f.path), request));
});

test('native route binding replaces model-selected interaction with genuine host authority', t => {
  const f = fixture(t);
  capturePiRequest(f.root, request);
  observePiReviewPurpose(f.root, request, 'pi-rpc');
  const authored = { request, processPolicy: {
    schema: 'human-design-process-v1', interactionMode: 'interactive', autonomyGrant: null,
  } };
  const bound = bindNativeDesignRouteInput(f.root, f.invocation, authored);
  assert.ok(typeof bound === 'object' && bound !== null);
  assert.deepEqual(Reflect.get(bound, 'processPolicy'), {
    schema: 'model-led-design-process-v1', interactionMode: 'autonomous',
    autonomyGrant: fileReceipt(f.root, f.path),
  });
  assert.equal(Reflect.get(bound, 'reviewPurpose'), 'ordinary');
  assert.equal(authored.processPolicy.interactionMode, 'interactive');
  assert.throws(() => bindNativeDesignRouteInput(f.root, f.invocation, { ...authored, request: 'Another request' }));
});

test('ordinary native production preserves outcomes and scope without intermediate design records', t => {
  const input = routeInput();
  input.strategyDecision = {
    schema: 'adaptive-strategy-decision-v1', owner: 'user-selected-model',
    roles: ['omd-hand', 'omd-eye'],
    stages: ['production', 'browser-evidence', 'independent-review'],
    executionWaves: [
      { id: 'build', mode: 'concurrent', roles: ['omd-hand'] },
      { id: 'review', mode: 'concurrent', roles: ['omd-eye'] },
    ],
    methods: [], aiAssets: [], attributionCategories: [], skips: [],
    rationale: 'Build and verify the requested result directly; use optional methods when needed.',
  };
  const f = fixture(t, false, input.request);
  capturePiRequest(f.root, input.request);
  observePiReviewPurpose(f.root, input.request, 'pi-rpc');
  publishAdaptiveRoute(f.root, input, createProjectWriteAdapter(f.root, f.invocation), f.invocation);
  const route = readPersistedRoute(f.root, f.invocation);
  assert.deepEqual(route.sourceContract.taskOutcome, input.taskOutcome);
  assert.deepEqual(route.sourceContract.allowedPaths, input.allowedPaths);
  assert.equal(route.sourceContract.processPolicy?.schema, 'model-led-design-process-v1');
  const pack = fileURLToPath(new URL('../core', import.meta.url));
  const readiness = checkProductionReadiness(f.root, f.invocation, pack, 'index.html');
  assert.deepEqual(readiness.blockers, []);
  assert.equal(readiness.ok, true);
  assert.equal(readiness.sourceAuthoring, 'model');
  assert.equal(existsSync(join(f.root, '.omd/frame.md')), false);
  assert.equal(existsSync(join(f.root, '.omd/composition.md')), false);
  assert.equal(checkProductionReadiness(f.root, f.invocation, pack, 'outside.ts').ok, false);
});

test('the model-led route starter selects results and verification rather than a design ceremony', () => {
  const structured = inputSkeleton('route-input');
  const direct = modelLedRouteInput(structured);
  const skeleton = direct.skeleton as { strategyDecision: { stages: string[]; roles: string[]; methods: string[] }; request: string; taskOutcome: unknown };
  assert.deepEqual(skeleton.strategyDecision.stages, ['production', 'browser-evidence', 'independent-review']);
  assert.deepEqual(skeleton.strategyDecision.roles, ['omd-hand', 'omd-eye']);
  assert.deepEqual(skeleton.strategyDecision.methods, []);
  assert.equal(Reflect.has(skeleton, 'processPolicy'), false);
  assert.equal(skeleton.request, Reflect.get(structured.skeleton as object, 'request'));
  assert.deepEqual(skeleton.taskOutcome, Reflect.get(structured.skeleton as object, 'taskOutcome'));
});

test('native route publication persists harness authority while preserving the requested scope', t => {
  const input = routeInput();
  const f = fixture(t, false, input.request);
  capturePiRequest(f.root, input.request);
  observePiReviewPurpose(f.root, input.request, 'pi-rpc');
  publishAdaptiveRoute(f.root, input, createProjectWriteAdapter(f.root, f.invocation), f.invocation);
  const route = readPersistedRoute(f.root, f.invocation);
  assert.equal(route.request, input.request);
  assert.deepEqual(route.allowedPaths, input.allowedPaths);
  assert.equal(route.sourceContract.processPolicy?.interactionMode, 'autonomous');
  const receipt = route.sourceContract.processPolicy?.autonomyGrant;
  assert.ok(receipt);
  assert.equal(verifyDirectionAutonomyGrant(f.root, receipt, input.request).source, 'native-host-policy');
});

test('current reference analysis cannot select a route that forbids its domain publisher', t => {
  const input = routeInput();
  input.strategyDecision.stages = input.strategyDecision.stages.filter((stage: string) => stage !== 'domain');
  const f = fixture(t, false, input.request);
  capturePiRequest(f.root, input.request);
  observePiReviewPurpose(f.root, input.request, 'pi-rpc');
  const before = readFileSync(join(f.root, f.path));
  assert.throws(() => publishAdaptiveRoute(f.root, input, createProjectWriteAdapter(f.root, f.invocation), f.invocation),
    /include domain before reference-board/);
  assert.equal(existsSync(join(f.root, '.omd/route.json')), false);
  assert.deepEqual(readFileSync(join(f.root, f.path)), before);
});
