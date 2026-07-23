import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { captureScrollSceneEvidence } from '../core/render/scroll-scene-capture.ts';
import { validateScrollSceneEvidence } from '../core/render/scroll-scene-evidence.ts';

const artDirectionHash = createHash('sha256').update('scroll-direction').digest('hex');
const viewport = { width: 480, height: 800 };

// A tall page whose sections reveal via a scroll-DRIVEN (position, not time) animation. At any fixed
// scroll offset the scrubbed value is constant, so two captures across time are byte-identical.
function scrubbedFixture(dir: string): string {
  const page = join(dir, 'scroll-scrubbed.html');
  writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;box-sizing:border-box}
    body{font-family:system-ui,sans-serif}
    section{height:100vh;display:flex;align-items:center;justify-content:center;font-size:8vh;font-weight:800;color:#fff}
    #hero{background:#0a0a0a}
    #scene-a{background:#e11d48}
    #scene-b{background:#2563eb}
    #scene-c{background:#059669}
    .scrub{opacity:.15;transform:translateY(8vh);animation:reveal linear both;animation-timeline:view();animation-range:entry 10% cover 45%}
    @keyframes reveal{to{opacity:1;transform:none}}
    @media (prefers-reduced-motion:reduce){.scrub{opacity:1;transform:none;animation:none}}
  </style></head><body>
    <section id="hero">HERO</section>
    <section class="scrub" id="scene-a">SCENE A</section>
    <section class="scrub" id="scene-b">SCENE B</section>
    <section class="scrub" id="scene-c">SCENE C</section>
  </body></html>`);
  return page;
}

test('captures a scroll-position-scrubbed sequence: each scene settles at its fixed position', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'omd-scroll-cap-'));
  const target = scrubbedFixture(dir);
  const evidence = await captureScrollSceneEvidence(target, {
    viewport,
    artDirectionHash,
    scenes: [
      { sceneId: 'scene-a', scrollFraction: 0.34, roiSelector: '#scene-a' },
      { sceneId: 'scene-b', scrollFraction: 0.67, roiSelector: '#scene-b' },
      { sceneId: 'scene-c', scrollFraction: 1, roiSelector: '#scene-c' },
    ],
  });
  assert.equal(evidence.register, 'showpiece');
  assert.equal(evidence.artDirectionHash, artDirectionHash);
  assert.equal(evidence.scenes.length, 3);
  let prior = 0;
  for (const scene of evidence.scenes) {
    // Scrubbed to a fixed position ⇒ settled within the render noise floor.
    assert.ok(scene.settle.settledEnergy <= scene.settle.noiseFloor * 2, `${scene.sceneId} did not settle`);
    // A real observed state change versus the top baseline.
    assert.ok(scene.stateChangeEnergy > scene.settle.noiseFloor, `${scene.sceneId} showed no state change`);
    assert.ok(scene.scrollFraction > prior, 'scroll fractions strictly increase');
    prior = scene.scrollFraction;
  }
  // The captured record is a valid contract instance and round-trips through the validator.
  assert.deepEqual(validateScrollSceneEvidence(evidence), evidence);
});

test('rejects a scene that keeps animating in TIME at a fixed scroll position', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'omd-scroll-cap-neg-'));
  const target = join(dir, 'scroll-timed.html');
  writeFileSync(target, `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0}
    section{height:100vh;display:flex;align-items:center;justify-content:center;font-size:8vh;font-weight:800;color:#fff}
    #hero{background:#0a0a0a}
    #timed{background:#7c3aed;animation:flash 600ms linear infinite alternate}
    @keyframes flash{from{filter:brightness(.35)}to{filter:brightness(1.7)}}
    @media (prefers-reduced-motion:reduce){#timed{animation:none;filter:none}}
  </style></head><body>
    <section id="hero">HERO</section>
    <section id="timed">TIMED</section>
  </body></html>`);
  await assert.rejects(
    () => captureScrollSceneEvidence(target, {
      viewport,
      artDirectionHash,
      scenes: [{ sceneId: 'timed', scrollFraction: 1, roiSelector: '#timed' }],
    }),
    /scrubbed|settled|time-animating/i,
  );
});

test('a scroll capture request is bounded and non-empty before any browser launches', async () => {
  await assert.rejects(
    () => captureScrollSceneEvidence('/does/not/matter.html', { viewport, artDirectionHash, scenes: [] }),
    /at least one scene/,
  );
  await assert.rejects(
    () => captureScrollSceneEvidence('/does/not/matter.html', {
      viewport,
      artDirectionHash,
      scenes: Array.from({ length: 7 }, (_unused, index) => ({ sceneId: `s${index}`, scrollFraction: (index + 1) / 8, roiSelector: `#s${index}` })),
    }),
    /bounded to 6 scenes/,
  );
});
