import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { validateStaticDirectionEvidenceV1 } from '../core/art-direction/static-evidence.ts';
import { authorizeTestPayloads } from '../core/runtime/activation.ts';
import { captureRenderedBeatReceipt, renderFilmstrip, renderPage } from '../core/render/index.ts';
import { createTestProjectRunInvocation, createTestProjectWriteAdapter } from './helpers/project-write.ts';

const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const selectedStaticEvidenceDecision = {
  motionDecision: 'none' as const,
  selectedRegister: 'quiet' as const,
  selectedStaticReferenceSlotIds: ['editorial-board'],
};

async function staticEvidence() {
  const dir = mkdtempSync(join(tmpdir(), 'omd-static-evidence-'));
  const adapter = createTestProjectWriteAdapter(dir);
  const source = join(dir, 'observed.html');
  writeFileSync(source, '<!doctype html><style>body{margin:0;background:#123;color:white}main{min-height:900px;padding:40px}</style><main data-omd-beat="B-1">Browser-observed static direction</main>');
  const capture = async (name: string, target: string, viewport: { width: number; height: number }) => {
    const path = join(dir, `${name}.png`);
    await renderPage(target, { viewport, out: path, adapter });
    const bytes = readFileSync(path);
    return { path: relative(dir, path), sha256: hash(bytes) };
  };
  const temporalCapture = async (name: string, target: string, viewport: { width: number; height: number }) => {
    const frames = await renderFilmstrip(target, { viewport, out: join(dir, `${name}.html`), frames: 4, interval: 350, adapter });
    if (frames.length < 3) throw new Error('one-session temporal capture did not produce three samples');
    return frames.slice(0, 3).map((path) => ({ path: relative(dir, path), sha256: hash(readFileSync(path)) })) as [{ path: string; sha256: string }, { path: string; sha256: string }, { path: string; sha256: string }];
  };
  const observedReceipt = (path: string) => ({ path: relative(dir, path), sha256: hash(readFileSync(path)) });
  const desktopViewport = { width: 1280, height: 900 };
  const mobileViewport = { width: 390, height: 844 };
  const desktop = await capture('desktop-render', source, desktopViewport);
  const mobile = await capture('mobile-render', source, mobileViewport);
  const temporalSamples = {
    desktop: await temporalCapture('desktop-temporal', source, desktopViewport),
    mobile: await temporalCapture('mobile-temporal', source, mobileViewport),
  };
  const allObservations = [desktop, mobile, ...temporalSamples.desktop, ...temporalSamples.mobile];
  const observedSha256 = hash(JSON.stringify(allObservations.map((observation) => observation.sha256)));
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
  });
  const review = (role: 'signature' | 'narrative' | 'motionFit' | 'fidelity' | 'fallback' | 'blind', actor: 'host-reviewer' | 'host-evaluator') => {
    const path = join(dir, `${role}-${actor}.json`);
    const value = { schema: 'static-review-receipt-v1', role, actor, verdict: 'pass', artDirectionHash, buildHash, selectionSha256, handoffSha256, observedSha256 };
    writeFileSync(path, JSON.stringify(value));
    return observedReceipt(path);
  };
  const evidence = {
    schema: 'static-direction-evidence-v1',
    artDirectionHash,
    motionDecision: 'none' as const,
    expected: { artDirectionHash, selectionSha256, handoffSha256, buildHash, runId: 'static-run' },
    observed: { runId: 'static-run', buildHash, selectionSha256, handoffSha256, observedSha256 },
    beatReceipt,
    observations: { desktop: { capture: desktop, ...desktopViewport }, mobile: { capture: mobile, ...mobileViewport }, temporalSamples },
    reviewReceipts: {
      signature: review('signature', 'host-reviewer'),
      narrative: review('narrative', 'host-evaluator'),
      motionFit: review('motionFit', 'host-reviewer'),
      fidelity: review('fidelity', 'host-evaluator'),
      fallback: review('fallback', 'host-reviewer'),
      blind: review('blind', 'host-evaluator'),
    },
  };
  return { evidence, observationRoot: dir, invocation: createTestProjectRunInvocation(dir) };
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
});
const authorizeReviewReceipts = (
  evidence: Awaited<ReturnType<typeof staticEvidence>>['evidence'],
  observationRoot: string,
  invocation: ReturnType<typeof createTestProjectRunInvocation>,
) => authorizeTestPayloads(invocation, observationRoot, Object.values(evidence.reviewReceipts).map((receipt) => ({
  purpose: 'static-review-receipt',
  payload: readFileSync(join(observationRoot, receipt.path)),
})));

const cloneReviewsForActor = (
  evidence: Awaited<ReturnType<typeof staticEvidence>>['evidence'],
  observationRoot: string,
  actor: 'host-reviewer' | 'host-evaluator',
) => {
  const cloned = structuredClone(evidence);
  for (const receipt of Object.values(cloned.reviewReceipts)) {
    const path = join(observationRoot, receipt.path);
    const payload = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    payload.actor = actor;
    writeFileSync(path, JSON.stringify(payload));
    receipt.sha256 = hash(readFileSync(path));
  }
  return cloned;
};


test('static none evidence accepts exact host-authorized mixed reviewer and evaluator receipt bytes', async () => {
  const { evidence, observationRoot, invocation } = await staticEvidence();
  authorizeReviewReceipts(evidence, observationRoot, invocation);
  assert.doesNotThrow(() => validateStaticDirectionEvidenceV1(evidence, decisionFor(evidence, observationRoot, invocation)));
});

test('static none evidence requires semantically independent reviewer and evaluator actor classes', async () => {
  for (const actor of ['host-reviewer', 'host-evaluator'] as const) {
    const { evidence, observationRoot, invocation } = await staticEvidence();
    const homogeneous = cloneReviewsForActor(evidence, observationRoot, actor);
    authorizeReviewReceipts(homogeneous, observationRoot, invocation);
    assert.throws(
      () => validateStaticDirectionEvidenceV1(homogeneous, decisionFor(homogeneous, observationRoot, invocation)),
      /static evidence requires six distinct host reviewer\/evaluator receipts/,
    );
  }
});

test('reused screenshots, caller GREEN, self-authored proof, stale lineage, and non-canonical Beats fail closed', async () => {
  const { evidence, observationRoot, invocation } = await staticEvidence();
  const current = decisionFor(evidence, observationRoot, invocation);
  authorizeReviewReceipts(evidence, observationRoot, invocation);
  const repeatedScreenshot = structuredClone(evidence);
  repeatedScreenshot.observations.temporalSamples.desktop[0] = repeatedScreenshot.observations.desktop.capture;
  assert.throws(() => validateStaticDirectionEvidenceV1(repeatedScreenshot, current), /isolated capture receipt/);

  const callerGreen = structuredClone(evidence) as Record<string, unknown>;
  callerGreen.decisionFitGreen = true;
  assert.throws(() => validateStaticDirectionEvidenceV1(callerGreen, current), /unexpected keys/);

  const selfAuthored = structuredClone(evidence);
  const receiptPath = join(observationRoot, selfAuthored.reviewReceipts.signature.path);
  const receiptValue = JSON.parse(readFileSync(receiptPath, 'utf8')) as Record<string, unknown>;
  receiptValue.actor = 'caller';
  writeFileSync(receiptPath, JSON.stringify(receiptValue));
  selfAuthored.reviewReceipts.signature.sha256 = hash(readFileSync(receiptPath));
  assert.throws(() => validateStaticDirectionEvidenceV1(selfAuthored, current), /host receipt does not authorize the exact static-review-receipt payload/);

  assert.throws(() => validateStaticDirectionEvidenceV1(evidence, { ...current, buildHash: hash('stale') }), /build/);

  const flatBeatProof = structuredClone(evidence);
  flatBeatProof.beatReceipt.captureViewports = [{ width: 1280, height: 900 }];
  assert.throws(() => validateStaticDirectionEvidenceV1(flatBeatProof, current), /fixed desktop and mobile viewports/);
  assert.ok(existsSync(join(observationRoot, evidence.observations.desktop.capture.path)));
});
