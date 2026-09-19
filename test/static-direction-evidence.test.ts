import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { validateStaticDirectionEvidenceV1 } from '../core/art-direction/static-evidence.ts';
import { authorizeTestPayloads } from '../core/runtime/activation.ts';
import { captureRenderedBeatReceipt, renderFilmstrip } from '../core/render/index.ts';
import { createTestProjectRunInvocation, createTestProjectWriteAdapter } from './helpers/project-write.ts';

const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  throw new Error('Beat authorization payload must be JSON-compatible');
};
type MutableBeatReceiptFixture = {
  captureViewports: Array<{ width: number; height: number }>;
  renderedBeats: Array<{ boundary: boolean; distinctRegions: number }>;
  captures: Array<{ path: string; sha256: string }>;
};
type MutableStaticEvidenceFixture = Awaited<ReturnType<typeof staticEvidence>>['evidence'] & {
  beatReceipt: MutableBeatReceiptFixture;
};
const mutableStaticEvidence = (
  evidence: Awaited<ReturnType<typeof staticEvidence>>['evidence'],
): MutableStaticEvidenceFixture => structuredClone(evidence) as MutableStaticEvidenceFixture;
const selectedStaticEvidenceDecision = {
  motionDecision: 'none' as const,
  selectedRegister: 'quiet' as const,
  selectedStaticReferenceSlotIds: ['editorial-board'],
};

async function staticEvidence() {
  const dir = mkdtempSync(join(tmpdir(), 'omd-static-evidence-'));
  const invocation = createTestProjectRunInvocation(dir);
  const adapter = createTestProjectWriteAdapter(dir);
  const source = join(dir, 'observed.html');
  writeFileSync(source, '<!doctype html><style>body{margin:0;background:#123;color:white}main{min-height:900px;padding:40px}</style><main data-omd-beat="B-1">Browser-observed static direction</main>');
  const temporalCapture = async (name: string, target: string, viewport: { width: number; height: number }) => {
    const frames = await renderFilmstrip(target, { viewport, out: join(dir, `${name}.html`), frames: 4, interval: 350, adapter });
    if (frames.length < 3) throw new Error('one-session temporal capture did not produce three samples');
    return frames.slice(0, 3).map((path) => ({ path: relative(dir, path), sha256: hash(readFileSync(path)) })) as [{ path: string; sha256: string }, { path: string; sha256: string }, { path: string; sha256: string }];
  };
  const observedReceipt = (path: string) => ({ path: relative(dir, path), sha256: hash(readFileSync(path)) });
  const desktopViewport = { width: 1280, height: 900 };
  const mobileViewport = { width: 390, height: 844 };
  const temporalSamples = {
    desktop: await temporalCapture('desktop-temporal', source, desktopViewport),
    mobile: await temporalCapture('mobile-temporal', source, mobileViewport),
  };
  const artDirectionHash = hash('direction');
  const selectionSha256 = hash('selection');
  const handoffSha256 = hash('handoff');
  const buildHash = hash('build');
  const beatReceipt = await captureRenderedBeatReceipt(source, {
    adapter,
    out: join(dir, 'rendered-beats.json'),
    artDirectionHash,
    copyDeckSha256: hash('copy deck'),
    beatIds: ['B-1'],
    buildSha256: buildHash,
    route: '/',
    taskId: 'B-1',
    invocation,
  });
  authorizeTestPayloads(invocation, dir, [{ purpose: 'rendered-beat-result', payload: Buffer.from(`${canonicalJson(beatReceipt)}\n`) }]);
  const captures = beatReceipt.captures;
  if (captures === undefined) throw new Error('rendered Beat receipt must include captures');
  const desktop = captures.find((capture) => capture.viewport.width === desktopViewport.width && capture.viewport.height === desktopViewport.height);
  const mobile = captures.find((capture) => capture.viewport.width === mobileViewport.width && capture.viewport.height === mobileViewport.height);
  if (desktop === undefined || mobile === undefined) throw new Error('rendered Beat receipt must cover fixed viewports');
  const desktopCapture = { path: desktop.path, sha256: desktop.sha256 };
  const mobileCapture = { path: mobile.path, sha256: mobile.sha256 };
  const allObservations = [desktopCapture, mobileCapture, ...temporalSamples.desktop, ...temporalSamples.mobile];
  const observationManifestSha256 = hash(JSON.stringify(allObservations.map((observation) => ({ path: observation.path, sha256: observation.sha256 }))));
  const review = (role: 'signature' | 'narrative' | 'motionFit' | 'fidelity' | 'fallback' | 'blind', actor: 'host-reviewer' | 'host-evaluator') => {
    const path = join(dir, `${role}-${actor}.json`);
    const value = { schema: 'static-review-receipt-v1', role, verdict: 'pass', artDirectionHash, buildHash, selectionSha256, handoffSha256, runId: 'static-run', route: '/', target: source, taskId: 'B-1', observationManifestSha256, launchId: `${role}-${actor}-launch`, sessionId: `${role}-${actor}-session`, processIdentity: `${role}-${actor}-process`, configurationSha256: hash(`${role}-${actor}-configuration`) };
    writeFileSync(path, JSON.stringify(value));
    return observedReceipt(path);
  };
  const evidence = {
    schema: 'static-direction-evidence-v1',
    artDirectionHash,
    motionDecision: 'none' as const,
    expected: { artDirectionHash, selectionSha256, handoffSha256, buildHash, runId: 'static-run', route: '/', target: source, taskId: 'B-1' },
    observed: { runId: 'static-run', buildHash, selectionSha256, handoffSha256, route: '/', target: source, taskId: 'B-1', observationManifestSha256 },
    beatReceipt,
    observations: { desktop: { capture: desktopCapture, ...desktopViewport }, mobile: { capture: mobileCapture, ...mobileViewport }, temporalSamples },
    reviewReceipts: {
      signature: review('signature', 'host-reviewer'),
      narrative: review('narrative', 'host-evaluator'),
      motionFit: review('motionFit', 'host-reviewer'),
      fidelity: review('fidelity', 'host-evaluator'),
      fallback: review('fallback', 'host-reviewer'),
      blind: review('blind', 'host-evaluator'),
    },
  };
  return { evidence, observationRoot: dir, invocation, target: source };
}

const decisionFor = (
  evidence: Awaited<ReturnType<typeof staticEvidence>>['evidence'],
  observationRoot: string,
  invocation: ReturnType<typeof createTestProjectRunInvocation>,
) => ({
  ...selectedStaticEvidenceDecision,
  artDirectionHash: evidence.artDirectionHash,
  selectionSha256: evidence.expected.selectionSha256,
  handoffSha256: evidence.expected.handoffSha256,
  buildHash: evidence.expected.buildHash,
  runId: evidence.expected.runId,
  observationRoot,
  invocation,
  target: evidence.beatReceipt.target,
  route: evidence.beatReceipt.route,
  taskId: evidence.beatReceipt.taskId,
});
const authorizeBeatReceipt = (
  evidence: Awaited<ReturnType<typeof staticEvidence>>['evidence'],
  observationRoot: string,
  invocation: ReturnType<typeof createTestProjectRunInvocation>,
) => authorizeTestPayloads(invocation, observationRoot, [{
  purpose: 'rendered-beat-result',
  payload: Buffer.from(`${canonicalJson(evidence.beatReceipt)}\n`),
}]);
const authorizeReviewReceipts = (
  evidence: Awaited<ReturnType<typeof staticEvidence>>['evidence'],
  observationRoot: string,
  invocation: ReturnType<typeof createTestProjectRunInvocation>,
) => authorizeTestPayloads(invocation, observationRoot, Object.values(evidence.reviewReceipts).map((receipt) => ({
  purpose: 'static-review-receipt',
  payload: readFileSync(join(observationRoot, receipt.path)),
})));

const cloneReviewsForExecutionIdentity = (
  evidence: Awaited<ReturnType<typeof staticEvidence>>['evidence'],
  observationRoot: string,
  actor: 'host-reviewer' | 'host-evaluator',
) => {
  const cloned = structuredClone(evidence);
  for (const receipt of Object.values(cloned.reviewReceipts)) {
    const path = join(observationRoot, receipt.path);
    const payload = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    payload.sessionId = `${actor}-session`;
    payload.processIdentity = `${actor}-process`;
    writeFileSync(path, JSON.stringify(payload));
    receipt.sha256 = hash(readFileSync(path));
  }
  return cloned;
};


test('static none evidence accepts exact host-authorized mixed reviewer and evaluator receipt bytes', async () => {
  const { evidence, observationRoot, invocation } = await staticEvidence();
  authorizeReviewReceipts(evidence, observationRoot, invocation);
  authorizeBeatReceipt(evidence, observationRoot, invocation);
  assert.doesNotThrow(() => validateStaticDirectionEvidenceV1(evidence, decisionFor(evidence, observationRoot, invocation)));
});

test('static none evidence requires distinct reviewer and evaluator execution identities', async () => {
  for (const actor of ['host-reviewer', 'host-evaluator'] as const) {
    const { evidence, observationRoot, invocation } = await staticEvidence();
    const homogeneous = cloneReviewsForExecutionIdentity(evidence, observationRoot, actor);
    authorizeReviewReceipts(homogeneous, observationRoot, invocation);
    authorizeBeatReceipt(homogeneous, observationRoot, invocation);
    assert.throws(
      () => validateStaticDirectionEvidenceV1(homogeneous, decisionFor(homogeneous, observationRoot, invocation)),
      /static evidence requires six distinct completed host reviewer\/evaluator process and session receipts/,
    );
  }
});
test('host-authorized review receipts cannot transfer between tasks sharing the same build and art direction', async () => {
  const { evidence, observationRoot, invocation } = await staticEvidence();
  const receipt = evidence.reviewReceipts.signature;
  const path = join(observationRoot, receipt.path);
  const payload = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  payload.taskId = 'B-2';
  writeFileSync(path, JSON.stringify(payload));
  receipt.sha256 = hash(readFileSync(path));
  authorizeReviewReceipts(evidence, observationRoot, invocation);
  authorizeBeatReceipt(evidence, observationRoot, invocation);
  assert.throws(() => validateStaticDirectionEvidenceV1(evidence, decisionFor(evidence, observationRoot, invocation)), /taskId/);
});

test('reused screenshots, caller GREEN, self-authored proof, stale lineage, and non-canonical Beats fail closed', async () => {
  const { evidence, observationRoot, invocation } = await staticEvidence();
  const current = decisionFor(evidence, observationRoot, invocation);
  authorizeReviewReceipts(evidence, observationRoot, invocation);
  authorizeBeatReceipt(evidence, observationRoot, invocation);
  const repeatedScreenshot = structuredClone(evidence);
  repeatedScreenshot.observations.temporalSamples.desktop[0] = repeatedScreenshot.observations.desktop.capture;
  assert.throws(() => validateStaticDirectionEvidenceV1(repeatedScreenshot, current), /isolated capture receipt/);

  const callerGreen = structuredClone(evidence) as Record<string, unknown>;
  callerGreen.decisionFitGreen = true;
  assert.throws(() => validateStaticDirectionEvidenceV1(callerGreen, current), /unexpected keys/);

  const selfAuthored = structuredClone(evidence);
  const receiptPath = join(observationRoot, selfAuthored.reviewReceipts.signature.path);
  const receiptValue = JSON.parse(readFileSync(receiptPath, 'utf8')) as Record<string, unknown>;
  receiptValue.processIdentity = 'caller';
  writeFileSync(receiptPath, JSON.stringify(receiptValue));
  selfAuthored.reviewReceipts.signature.sha256 = hash(readFileSync(receiptPath));
  assert.throws(() => validateStaticDirectionEvidenceV1(selfAuthored, current), /(?:host receipt does not authorize|no self-signed receipt authorizes) the exact static-review-receipt payload/);

  assert.throws(() => validateStaticDirectionEvidenceV1(evidence, { ...current, buildHash: hash('stale') }), /build/);

  const flatBeatProof = mutableStaticEvidence(evidence);
  flatBeatProof.beatReceipt.captureViewports = [{ width: 1280, height: 900 }];
  authorizeBeatReceipt(flatBeatProof, observationRoot, invocation);
  assert.throws(() => validateStaticDirectionEvidenceV1(flatBeatProof, current), /fixed viewport observations/);
  const forgedBeatFacts = mutableStaticEvidence(evidence);
  const forgedBeat = forgedBeatFacts.beatReceipt.renderedBeats[0];
  if (forgedBeat === undefined) throw new Error('fixture requires a rendered Beat');
  forgedBeat.boundary = false;
  authorizeBeatReceipt(forgedBeatFacts, observationRoot, invocation);
  assert.throws(() => validateStaticDirectionEvidenceV1(forgedBeatFacts, current), /visible, non-nested visual region/);
  const unauthorizedBeatFacts = mutableStaticEvidence(evidence);
  const unauthorizedBeat = unauthorizedBeatFacts.beatReceipt.renderedBeats[0];
  if (unauthorizedBeat === undefined) throw new Error('fixture requires a rendered Beat');
  unauthorizedBeat.boundary = false;
  unauthorizedBeat.distinctRegions = 1;
  assert.throws(() => validateStaticDirectionEvidenceV1(unauthorizedBeatFacts, current), /exact rendered-beat-result payload/);
  const swappedBeatCaptures = mutableStaticEvidence(evidence);
  const firstCapture = swappedBeatCaptures.beatReceipt.captures[0];
  const secondCapture = swappedBeatCaptures.beatReceipt.captures[1];
  if (firstCapture === undefined || secondCapture === undefined) throw new Error('fixture requires desktop and mobile captures');
  [firstCapture.path, secondCapture.path] = [secondCapture.path, firstCapture.path];
  [firstCapture.sha256, secondCapture.sha256] = [secondCapture.sha256, firstCapture.sha256];
  authorizeBeatReceipt(swappedBeatCaptures, observationRoot, invocation);
  assert.throws(() => validateStaticDirectionEvidenceV1(swappedBeatCaptures, current), /capture dimensions do not match its fixed viewport/);
  assert.throws(() => validateStaticDirectionEvidenceV1(evidence, { ...current, route: '/stale' }), /expected route is not current/);
  assert.throws(() => validateStaticDirectionEvidenceV1(evidence, { ...current, taskId: 'wrong-task' }), /expected taskId is not current/);
  assert.ok(existsSync(join(observationRoot, evidence.observations.desktop.capture.path)));
});
