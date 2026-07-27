import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createHash } from 'node:crypto';
import { captureMotionEvidenceV2, captureRenderedBeatReceipt, validateMotionEvidenceV2 } from '../core/render/index.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { validatePostRenderBeatProof } from '../core/copy/index.ts';
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
    #scene { width: 240px; height: 180px; background: #111; animation: production-scene 4000ms linear 150ms forwards; }
    @keyframes production-scene { to { background: #eee; } }
    @media (prefers-reduced-motion: reduce) { #scene { animation: none !important; background: #eee; } }
  </style><body><main id="scene">motion</main></body></html>`);
  const buildHash = createHash('sha256').update('build').digest('hex');
  const evidence = await captureMotionEvidenceV2(page, {
    viewport: { width: 390, height: 300 }, outDir: dir, runId: 'run-1', buildHash,
    artDirectionHash: createHash('sha256').update('direction').digest('hex'),
    referenceSlotId: 'motion-reference', selector: '#scene',
    trigger: 'load', intervalMs: 160, adapter: createTestProjectWriteAdapter(dir),
  });
  assert.equal(validateMotionEvidenceV2(evidence, { motionDecision: 'one', buildHash, root: dir }).scenes.length, 1);
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
  assert.throws(() => validateMotionEvidenceV2(forged, { root: dir, motionDecision: 'one' }), /bytes do not match|path does not contain/);
  const wrongRoi = JSON.parse(JSON.stringify(evidence)) as { scenes: { roi: { x: number; y: number; width: number; height: number } }[] };
  wrongRoi.scenes[0]!.roi = { x: 0, y: 0, width: 390, height: 300 };
  assert.throws(
    () => validateMotionEvidenceV2(wrongRoi, { root: dir, motionDecision: 'one' }),
    /whole viewport/,
  );
  const tinyPulse = JSON.parse(JSON.stringify(evidence)) as { scenes: { calibration: { noiseFloor: number; roiEnergy: number } }[] };
  tinyPulse.scenes[0]!.calibration.roiEnergy = tinyPulse.scenes[0]!.calibration.noiseFloor;
  assert.throws(() => validateMotionEvidenceV2(tinyPulse, { root: dir, motionDecision: 'one' }), /energy/);
  const wrongTrigger = JSON.parse(JSON.stringify(evidence)) as { scenes: { trigger: string }[] };
  wrongTrigger.scenes[0]!.trigger = 'pointer';
  assert.throws(() => validateMotionEvidenceV2(wrongTrigger, { root: dir, motionDecision: 'one' }), /does not match the executed trigger transcript/);
  const extraTrigger = JSON.parse(JSON.stringify(evidence)) as { observed: { triggerTranscript: unknown[] } };
  extraTrigger.observed.triggerTranscript.push({ event: 'scroll', timestampMs: 1 });
  assert.throws(() => validateMotionEvidenceV2(extraTrigger, { root: dir, motionDecision: 'one' }), /exactly one observed trigger/);
  const staleFrames = JSON.parse(JSON.stringify(evidence)) as { scenes: { mid: { capture: unknown }; start: { capture: unknown } }[] };
  staleFrames.scenes[0]!.mid.capture = staleFrames.scenes[0]!.start.capture;
  assert.throws(() => validateMotionEvidenceV2(staleFrames, { root: dir, motionDecision: 'one' }), /ROI energy does not match/);
  await assert.rejects(() => captureMotionEvidenceV2(page, {
    viewport: { width: 390, height: 300 }, outDir: dir, runId: 'unrelated', buildHash,
    artDirectionHash: createHash('sha256').update('direction').digest('hex'),
    referenceSlotId: 'motion-reference', selector: 'html',
    trigger: 'load', intervalMs: 160, adapter: createTestProjectWriteAdapter(dir),
  }), /selector-local region/);
});

test('captures selector-local scroll and pointer scenes only after their declared browser triggers execute', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'omd-motion-triggers-'));
  const buildHash = createHash('sha256').update('trigger-build').digest('hex');
  for (const trigger of ['scroll', 'pointer'] as const) {
    const page = join(dir, `${trigger}.html`);
    writeFileSync(page, `<!doctype html><html><style>
      html, body { margin: 0; min-height: 1200px; } #scene { position: fixed; left: 20px; top: 20px; width: 240px; height: 180px; background: #111; }
      @media (prefers-reduced-motion: reduce) { #scene { background: #eee; } }
    </style><body><main id="scene">${trigger}</main><script>
      const scene = document.querySelector('#scene');
      document.addEventListener('${trigger === 'scroll' ? 'scroll' : 'pointermove'}', () => {
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) scene.animate([{ background: '#111' }, { background: '#eee' }], { duration: 1000, fill: 'forwards' });
      }, { once: true, passive: true });
    </script></body></html>`);
    const evidence = await captureMotionEvidenceV2(page, {
      viewport: { width: 390, height: 300 }, outDir: dir, runId: trigger, buildHash,
      artDirectionHash: createHash('sha256').update(`trigger-${trigger}`).digest('hex'),
      referenceSlotId: 'motion-reference', selector: '#scene', trigger, intervalMs: 160, adapter: createTestProjectWriteAdapter(dir),
    });
    assert.equal(evidence.observed.triggerTranscript[0]!.event, trigger);
    assert.equal(evidence.scenes[0]!.trigger, trigger);
    assert.equal(validateMotionEvidenceV2(evidence, { root: dir, motionDecision: 'one', buildHash }).scenes.length, 1);
  }
});
test('rendered Beat receipts use semantic DOM regions rather than visible wrappers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'omd-semantic-beats-'));
  const hash = createHash('sha256').update('semantic-beats').digest('hex');
  const prose = 'Semantic Beat evidence must contain enough ordinary rendered text to make this a real browser page rather than a hollow response. '.repeat(3);
  const capture = async (name: string, body: string, beatIds: string[]) => {
    const page = join(dir, `${name}.html`);
    writeFileSync(page, `<!doctype html><html><style>
      html, body { margin: 0; } main, section { min-height: 160px; padding: 24px; }
      .overlap { position: absolute; top: 0; left: 0; width: 300px; min-height: 160px; }
    </style><body>${body}</body></html>`);
    return captureRenderedBeatReceipt(page, {
      adapter: createTestProjectWriteAdapter(dir),
      out: join(dir, `${name}.json`),
      artDirectionHash: hash,
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
