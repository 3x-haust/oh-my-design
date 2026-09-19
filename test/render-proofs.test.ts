import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createHash } from 'node:crypto';
import { captureMotionEvidenceV2, captureRenderedBeatReceipt, validateMotionEvidenceV2 } from '../core/render/index.ts';
import { authorizeTestProjectRunPayloads, createTestProjectRunInvocation, createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { createProjectWriteAdapter } from '../core/runtime/project-write.ts';
import { validatePostRenderBeatProof } from '../core/copy/index.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
// `omd render --proofs` renders all four sketch/craft proofs (fixed + full-page, desktop + mobile)
// over ONE browser launch instead of four — the render-heavy sketch/craft steps' speed lever.

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const SLOP = fileURLToPath(new URL('./fixtures/slop.html', import.meta.url));

test('omd render --proofs writes the four proofs from one command', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omd-proofs-'));
  const prefix = join(dir, 'proof');
  const result = spawnSync(process.execPath, [CLI, 'render', SLOP, '--proofs', '-o', prefix], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);

  const expected = ['proof-desktop.png', 'proof-mobile.png', 'proof-desktop-full.png', 'proof-mobile-full.png'];
  for (const name of expected) {
    const path = join(dir, name);
    assert.ok(existsSync(path), `${name} was rendered`);
    assert.ok(statSync(path).size > 0, `${name} is a real image`);
  }
  // The stdout lists every written proof path.
  for (const name of expected) assert.match(result.stdout, new RegExp(name.replace('.', '\\.')));
});
test('captures a real file URL load scene with path-backed ROI receipts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'omd-motion-receipt-'));
  const page = join(dir, 'motion.html');
  writeFileSync(page, `<!doctype html><html><style>
    html, body { width: 100%; height: 100%; margin: 0; }
    html { background: #111; }
    #scene { width: 240px; height: 180px; background: #111; }
  </style><body><main id="scene">motion</main><script>
    const scene = document.querySelector('#scene');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) scene.style.background = '#eee';
    else {
      const animation = scene.animate([{ background: '#111' }, { background: '#eee' }], { duration: 1, fill: 'forwards' });
      animation.pause();
      animation.currentTime = 0;
    }
  </script></body></html>`);
  const buildHash = createHash('sha256').update('build').digest('hex');
  const artDirectionHash = createHash('sha256').update('direction').digest('hex');
  const invocation = createTestProjectRunInvocation(dir);
  const evidence = await captureMotionEvidenceV2(page, {
    viewport: { width: 390, height: 300 }, outDir: dir, runId: 'run-1', buildHash,
    artDirectionHash, route: '/motion', taskId: 'motion-proof', invocation,
    referenceSlotId: 'motion-reference', selector: '#scene',
    trigger: 'load', intervalMs: 160, adapter: createProjectWriteAdapter(dir, invocation),
  });
  const currentMotion = { motionDecision: 'one' as const, buildHash, artDirectionHash, root: dir, invocation, route: '/motion', target: page, taskId: 'motion-proof' };
  authorizeTestProjectRunPayloads(dir, invocation, [{ purpose: 'motion-result', payload: Buffer.from(canonicalJson(evidence)) }]);
  assert.equal(validateMotionEvidenceV2(evidence, currentMotion).scenes.length, 1);
  const authorizeMotion = (value: unknown): void => authorizeTestProjectRunPayloads(dir, invocation, [{ purpose: 'motion-result', payload: Buffer.from(canonicalJson(value)) }]);
  const forgedResult = structuredClone(evidence);
  (forgedResult as { observed: { taskId: string } }).observed.taskId = 'forged-task';
  assert.throws(() => validateMotionEvidenceV2(forgedResult, currentMotion), /(?:host receipt does not authorize|no self-signed receipt authorizes) the exact motion-result payload/);
  assert.equal(evidence.scenes[0]!.boundary, 'selector');
  assert.equal(evidence.scenes[0]!.activeAnimationCount, 1);
  const capturePaths = [
    evidence.scenes[0]!.start.capture.path,
    evidence.scenes[0]!.mid.capture.path,
    evidence.scenes[0]!.end.capture.path,
    evidence.scenes[0]!.reducedMotion.capture.path,
  ];
  assert.equal(capturePaths.every(path => !isAbsolute(path) && existsSync(join(dir, path))), true);
  const forged = JSON.parse(JSON.stringify(evidence)) as { scenes: { mid: { capture: { bytesBase64: string } }; start: { capture: { bytesBase64: string } } }[] };
  forged.scenes[0]!.mid.capture.bytesBase64 = forged.scenes[0]!.start.capture.bytesBase64;
  authorizeMotion(forged);
  assert.throws(() => validateMotionEvidenceV2(forged, currentMotion), /bytes do not match|path does not contain/);
  const wrongRoi = JSON.parse(JSON.stringify(evidence)) as { scenes: { roi: { x: number; y: number; width: number; height: number } }[] };
  wrongRoi.scenes[0]!.roi = { x: 0, y: 0, width: 390, height: 300 };
  authorizeMotion(wrongRoi);
  assert.throws(
    () => validateMotionEvidenceV2(wrongRoi, currentMotion),
    /whole viewport/,
  );
  const tinyPulse = JSON.parse(JSON.stringify(evidence)) as { scenes: { calibration: { noiseFloor: number; roiEnergy: number } }[] };
  tinyPulse.scenes[0]!.calibration.roiEnergy = tinyPulse.scenes[0]!.calibration.noiseFloor;
  authorizeMotion(tinyPulse);
  assert.throws(() => validateMotionEvidenceV2(tinyPulse, currentMotion), /energy/);
  const wrongTrigger = JSON.parse(JSON.stringify(evidence)) as { scenes: { trigger: string }[] };
  wrongTrigger.scenes[0]!.trigger = 'pointer';
  authorizeMotion(wrongTrigger);
  assert.throws(() => validateMotionEvidenceV2(wrongTrigger, currentMotion), /trigger must be load/);
  const extraTrigger = JSON.parse(JSON.stringify(evidence)) as { observed: { triggerTranscript: unknown[] } };
  extraTrigger.observed.triggerTranscript.push({ event: 'scroll', timestampMs: 1 });
  authorizeMotion(extraTrigger);
  assert.throws(() => validateMotionEvidenceV2(extraTrigger, currentMotion), /exactly one observed trigger/);
  const staleFrames = JSON.parse(JSON.stringify(evidence)) as { scenes: { mid: { capture: unknown }; start: { capture: unknown } }[] };
  staleFrames.scenes[0]!.mid.capture = staleFrames.scenes[0]!.start.capture;
  authorizeMotion(staleFrames);
  assert.throws(() => validateMotionEvidenceV2(staleFrames, currentMotion), /ROI energy does not match/);
  const absoluteFrame = JSON.parse(JSON.stringify(evidence)) as { scenes: { start: { capture: { path: string } } }[] };
  absoluteFrame.scenes[0]!.start.capture.path = join(dir, evidence.scenes[0]!.start.capture.path);
  authorizeMotion(absoluteFrame);
  assert.throws(() => validateMotionEvidenceV2(absoluteFrame, currentMotion), /normalized project-relative/);
  const traversalFrame = JSON.parse(JSON.stringify(evidence)) as { scenes: { start: { capture: { path: string } } }[] };
  traversalFrame.scenes[0]!.start.capture.path = `../${evidence.scenes[0]!.start.capture.path}`;
  authorizeMotion(traversalFrame);
  assert.throws(() => validateMotionEvidenceV2(traversalFrame, currentMotion), /normalized project-relative/);
  const escapedFrame = JSON.parse(JSON.stringify(evidence)) as { scenes: { start: { capture: { path: string } } }[] };
  const captured = evidence.scenes[0]!.start.capture.path;
  symlinkSync(dirname(join(dir, captured)), join(dir, 'escape'));
  escapedFrame.scenes[0]!.start.capture.path = `escape/${basename(captured)}`;
  authorizeMotion(escapedFrame);
  assert.throws(() => validateMotionEvidenceV2(escapedFrame, currentMotion), /escapes the project root|could not be opened without following links/);
  const malformedInvocation = createTestProjectRunInvocation(dir);
  const malformedArtDirectionHash = createHash('sha256').update('unrelated-direction').digest('hex');
  await assert.rejects(() => captureMotionEvidenceV2(page, {
    viewport: { width: 390, height: 300 }, outDir: dir, runId: 'unrelated', buildHash,
    artDirectionHash: malformedArtDirectionHash, route: '/malformed-roi', taskId: 'malformed-roi',
    invocation: malformedInvocation,
    referenceSlotId: 'motion-reference', selector: 'html',
    trigger: 'load', intervalMs: 160, adapter: createProjectWriteAdapter(dir, malformedInvocation),
  }), /selector-local region/);
});

test('rejects scroll and pointer motion evidence despite host-authorized collector receipts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'omd-motion-triggers-'));
  const buildHash = createHash('sha256').update('trigger-build').digest('hex');
  for (const trigger of ['scroll', 'pointer'] as const) {
    const page = join(dir, `${trigger}.html`);
    const artDirectionHash = createHash('sha256').update(`trigger-${trigger}`).digest('hex');
    const invocation = createTestProjectRunInvocation(dir);
    await assert.rejects(() => captureMotionEvidenceV2(page, {
      viewport: { width: 390, height: 300 }, outDir: dir, runId: trigger, buildHash, artDirectionHash,
      route: `/motion-${trigger}`, taskId: `motion-${trigger}`, invocation,
      referenceSlotId: 'motion-reference', selector: '#scene', trigger, intervalMs: 160,
      adapter: createProjectWriteAdapter(dir, invocation),
    }), /only supports the load trigger/);
  }
});
test('rendered Beat receipts use semantic DOM regions rather than visible wrappers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'omd-semantic-beats-'));
  const hash = createHash('sha256').update('semantic-beats').digest('hex');
  const prose = 'Semantic Beat evidence must contain enough ordinary rendered text to make this a real browser page rather than a hollow response. '.repeat(3);
  const capture = async (name: string, body: string, beatIds: string[]) => {
    const page = join(dir, `${name}.html`);
    const invocation = createTestProjectRunInvocation(dir);
    writeFileSync(page, `<!doctype html><html><style>
      html, body { margin: 0; } main, section { min-height: 160px; padding: 24px; }
      .overlap { position: absolute; top: 0; left: 0; width: 300px; min-height: 160px; }
    </style><body>${body}</body></html>`);
    return captureRenderedBeatReceipt(page, {
      adapter: createTestProjectWriteAdapter(dir),
      out: join(dir, `${name}.json`),
      artDirectionHash: hash,
      buildSha256: hash,
      route: `/${name}`,
      taskId: name,
      invocation,
      copyDeckSha256: hash,
      beatIds,
    });
  };

  const valid = await capture('valid', `<main data-omd-beat="B-1"><h1>One region</h1><p>${prose}</p></main>`, ['B-1']);
  assert.deepEqual(validatePostRenderBeatProof('', valid, { beatIds: ['B-1'] }), []);

  const wrapper = await capture('wrapper', `<div data-omd-beat="B-1"><h1>Wrapper only</h1><p>${prose}</p></div>`, ['B-1']);
  assert.ok(validatePostRenderBeatProof('', wrapper, { beatIds: ['B-1'] }).some((violation) => violation.id === 'COPY-RENDERED-BEAT-SEGMENT'));

  const headings = await capture('headings', `<main data-omd-beat="B-1"><h1>First heading</h1><h2>Second heading</h2><p>${prose}</p></main>`, ['B-1']);
  assert.ok(headings.renderedBeats instanceof Array && headings.renderedBeats.every((beat) => (beat as { distinctRegions: number }).distinctRegions > 0));
  assert.ok(validatePostRenderBeatProof('', headings, { beatIds: ['B-1'] }).some((violation) => violation.id === 'COPY-RENDERED-BEAT-SEGMENT'));

  const landmarks = await capture('landmarks', `<main data-omd-beat="B-1"><section><h2>Nested landmark</h2><p>${prose}</p></section></main>`, ['B-1']);
  assert.ok(validatePostRenderBeatProof('', landmarks, { beatIds: ['B-1'] }).some((violation) => violation.id === 'COPY-RENDERED-BEAT-SEGMENT'));

  const repeated = await capture('repeated', `<main data-omd-beat="B-1"><div class="card"><h2>Card one</h2><p>${prose}</p></div><div class="card"><h2>Card two</h2><p>${prose}</p></div></main>`, ['B-1']);
  assert.ok(validatePostRenderBeatProof('', repeated, { beatIds: ['B-1'] }).some((violation) => violation.id === 'COPY-RENDERED-BEAT-SEGMENT'));

  const overlap = await capture('overlap', `<main class="overlap" data-omd-beat="B-1"><h1>First owner</h1><p>${prose}</p></main><main class="overlap" data-omd-beat="B-2"><h1>Second owner</h1><p>${prose}</p></main>`, ['B-1', 'B-2']);
  assert.ok(overlap.renderedBeats instanceof Array && overlap.renderedBeats.every((beat) => (beat as { ancestorBeatIds: string[] }).ancestorBeatIds.length > 0));
  assert.ok(validatePostRenderBeatProof('', overlap, { beatIds: ['B-1', 'B-2'] }).some((violation) => violation.id === 'COPY-RENDERED-BEAT-SEGMENT'));
});
