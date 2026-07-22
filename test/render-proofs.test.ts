import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createHash } from 'node:crypto';
import { captureMotionEvidenceV2, MotionEvidenceValidationError, validateMotionEvidenceV2 } from '../core/render/index.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
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
  writeFileSync(page, `<!doctype html><html data-omd-production-boundary="whole-page"><style>
    html, body { width: 100%; height: 100%; margin: 0; }
    html { background: #111; }
    body { min-height: 100%; background: #111; animation: production-scene 1000ms linear 100ms forwards; }
    @keyframes production-scene { to { background: #eee; } }
    @media (prefers-reduced-motion: reduce) { body { animation: none !important; background: #eee; } }
  </style><body>motion</body></html>`);
  const buildHash = createHash('sha256').update('build').digest('hex');
  const evidence = await captureMotionEvidenceV2(page, {
    viewport: { width: 390, height: 300 }, outDir: dir, runId: 'run-1', buildHash,
    artDirectionHash: createHash('sha256').update('direction').digest('hex'),
    referenceSlotId: 'motion-reference', selector: 'html',
    trigger: 'load', intervalMs: 160, adapter: createTestProjectWriteAdapter(dir),
  });
  assert.equal(validateMotionEvidenceV2(evidence, { motionDecision: 'one', buildHash }).scenes.length, 1);
  assert.equal(evidence.scenes[0]!.boundary, 'viewport');
  assert.equal(evidence.scenes[0]!.activeAnimationCount, 1);
  assert.ok(existsSync(evidence.scenes[0]!.start.capture.path));
  const forged = JSON.parse(JSON.stringify(evidence)) as { scenes: { mid: { capture: { bytesBase64: string } }; start: { capture: { bytesBase64: string } } }[] };
  forged.scenes[0]!.mid.capture.bytesBase64 = forged.scenes[0]!.start.capture.bytesBase64;
  assert.throws(() => validateMotionEvidenceV2(forged), /bytes do not match|path does not contain/);
  const wrongRoi = JSON.parse(JSON.stringify(evidence)) as { scenes: { roi: { width: number } }[] };
  wrongRoi.scenes[0]!.roi.width = 1;
  assert.throws(
    () => validateMotionEvidenceV2(wrongRoi),
    (error: unknown) => {
      assert.ok(error instanceof MotionEvidenceValidationError);
      assert.equal(error.reason, 'scene must be a visible non-trivial viewport rectangle');
      assert.equal(error.message, 'motion evidence is invalid: scene must be a visible non-trivial viewport rectangle');
      return true;
    },
  );
  const tinyPulse = JSON.parse(JSON.stringify(evidence)) as { scenes: { calibration: { noiseFloor: number; roiEnergy: number } }[] };
  tinyPulse.scenes[0]!.calibration.roiEnergy = tinyPulse.scenes[0]!.calibration.noiseFloor;
  assert.throws(() => validateMotionEvidenceV2(tinyPulse), /energy/);
  const hoverOnly = JSON.parse(JSON.stringify(evidence)) as { scenes: { trigger: string }[] };
  hoverOnly.scenes[0]!.trigger = 'hover';
  assert.throws(() => validateMotionEvidenceV2(hoverOnly), /trigger/);
  const unrelatedSibling = join(dir, 'motion-unrelated-sibling.html');
  writeFileSync(unrelatedSibling, `<!doctype html><html><style>
    html, body { width: 100%; height: 100%; margin: 0; }
    #sibling { width: 240px; height: 180px; background: #111; animation: sibling 1000ms linear 100ms forwards; }
    @keyframes sibling { to { background: #eee; transform: translateX(12px); } }
  </style><body><main id="sibling">unrelated sibling</main></body></html>`);
  await assert.rejects(() => captureMotionEvidenceV2(unrelatedSibling, {
    viewport: { width: 390, height: 300 }, outDir: dir, runId: 'unrelated', buildHash,
    artDirectionHash: createHash('sha256').update('direction').digest('hex'),
    referenceSlotId: 'motion-reference', selector: 'html',
    trigger: 'load', intervalMs: 160, adapter: createTestProjectWriteAdapter(dir),
  }), /unrelated sibling animation/);
});
