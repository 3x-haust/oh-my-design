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
import { checkProductionReadiness } from '../core/brief/production-readiness.ts';
import { inputSkeleton, modelLedRouteInput } from '../core/schema/inputs.ts';
import { PNG } from 'pngjs';
import { chooseDirection, idea, pinBoard, shipAssets } from './helpers/studio-stages.ts';

const request = 'Create a populated support inbox with a detail panel.';
type MutableRouteInput = Record<string, unknown> & {
  request: string;
  taskOutcome: unknown;
  allowedPaths: string[];
};
const routeInput = (): MutableRouteInput =>
  structuredClone(inputSkeleton('product-route-input').skeleton) as MutableRouteInput;
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
  const f = fixture(t, false, input.request);
  capturePiRequest(f.root, input.request);
  observePiReviewPurpose(f.root, input.request, 'pi-rpc');
  publishAdaptiveRoute(f.root, input, createProjectWriteAdapter(f.root, f.invocation), f.invocation);
  const route = readPersistedRoute(f.root, f.invocation);
  assert.deepEqual(route.sourceContract.taskOutcome, input.taskOutcome);
  assert.deepEqual(route.sourceContract.allowedPaths, input.allowedPaths);
  assert.equal(route.sourceContract.processPolicy?.schema, 'model-led-design-process-v1');
  const pack = fileURLToPath(new URL('../core', import.meta.url));
  // The new page's own source waits only for its studied system; no frame or composition record stands in front of it.
  assert.deepEqual(checkProductionReadiness(f.root, f.invocation, pack, 'index.html').blockers.map(blocker => blocker.split(':').slice(0, 2).join(':')),
    ['studio: STUDIO_STUDY_MISSING']);
  const readiness = checkProductionReadiness(f.root, f.invocation, pack);
  assert.deepEqual(readiness.blockers, []);
  assert.equal(readiness.ok, true);
  assert.equal(readiness.sourceAuthoring, 'model');
  assert.equal(existsSync(join(f.root, '.omd/frame.md')), false);
  assert.equal(existsSync(join(f.root, '.omd/composition.md')), false);
  assert.equal(checkProductionReadiness(f.root, f.invocation, pack, 'outside.ts').ok, false);
});

test('a new product\'s source is refused until its board, direction and owned assets exist, then authorized', t => {
  const input = routeInput();
  const f = fixture(t, false, input.request);
  capturePiRequest(f.root, input.request);
  observePiReviewPurpose(f.root, input.request, 'pi-rpc');
  publishAdaptiveRoute(f.root, input, createProjectWriteAdapter(f.root, f.invocation), f.invocation);
  const pack = fileURLToPath(new URL('../core', import.meta.url));
  const blockers = () => checkProductionReadiness(f.root, f.invocation, pack, 'index.html').blockers.map(blocker => blocker.split(':').slice(0, 2).join(':'));
  const png = (seed: number) => { const image = new PNG({ width: 4, height: 4 }); for (let at = 0; at < image.data.length; at += 4) image.data.set([seed, 24, 8, 255], at); return PNG.sync.write(image); };
  mkdirSync(join(f.root, '.omd/studio/refs/inbox-example'), { recursive: true });
  writeFileSync(join(f.root, '.omd/studio/refs/inbox-example/study.json'), JSON.stringify({ requested: 'https://inbox.example/' }));
  for (const name of ['first-screen.png', 'full.png']) writeFileSync(join(f.root, '.omd/studio/refs/inbox-example', name), png(1));
  assert.deepEqual(blockers(), ['studio: STUDIO_BOARD_MISSING']);
  pinBoard(f.root);
  assert.deepEqual(blockers(), ['studio: STUDIO_DIRECTION_MISSING']);
  const [chosen] = chooseDirection(f.root);
  writeFileSync(join(f.root, '.omd/studio/system.md'), 'Primary reference inbox.example, measured: 32/24/16/14 px, weights 400 and 600. '.repeat(8));
  writeFileSync(join(f.root, '.omd/studio/system.json'), JSON.stringify({ reference: 'https://inbox.example/', sizes: [32, 24, 16, 14], weights: [400, 600],
    colors: [{ hex: '#281808', from: chosen }] }));
  for (const name of ['inbox-1', 'inbox-2']) idea(f.root, name, 'page', 3);
  assert.deepEqual(blockers(), ['studio: STUDIO_ASSETS_MISSING']);
  assert.equal(existsSync(join(f.root, 'index.html')), false, 'a refused stage writes no source');
  shipAssets(f.root);
  assert.deepEqual(blockers(), []);
  assert.equal(checkProductionReadiness(f.root, f.invocation, pack, 'index.html').sourceAuthoring, 'model');
});

test('the model-led route starter selects results and verification rather than a design ceremony', () => {
  const structured = inputSkeleton('route-input');
  const direct = modelLedRouteInput(structured);
  const skeleton = direct.skeleton as { request: string; taskOutcome: unknown };
  assert.equal(Reflect.has(skeleton, 'strategyDecision'), false);
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
