import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { measurementReady, releaseMeasurementFrame } from '../core/measure/capture.ts';

const PAGE = `<!doctype html><style>
  .spin { width: 80px; height: 80px; background: linear-gradient(90deg, #5a34ff, #ffa31a); animation: spin 2s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .once { animation: fade .3s ease-out both; } @keyframes fade { from { opacity: 0; } }
</style><div class="spin"></div><p class="once">Settles</p><canvas id="c" width="120" height="60"></canvas>
<script>
  window.frames = 0;
  const ctx = document.getElementById('c').getContext('2d');
  (function loop(t) { window.frames++; ctx.fillStyle = 'hsl(' + (t / 5 % 360) + ' 80% 50%)'; ctx.fillRect(0, 0, 120, 60); requestAnimationFrame(loop); })(0);
</script>`;

test('continuous motion is held on a reproducible frame for capture and resumes afterwards', { timeout: 60_000 }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await page.setContent(PAGE);
  await page.waitForTimeout(300);
  // Before the fix this threw "continuous motion requires a reproducible frame contract".
  await measurementReady(page);
  const first = await page.screenshot({ animations: 'allow' });
  await page.waitForTimeout(250);
  const second = await page.screenshot({ animations: 'allow' });
  assert.ok(first.equals(second), 'held frames must be pixel-identical');
  const heldFrames = await page.evaluate('window.frames');
  await releaseMeasurementFrame(page);
  await page.waitForTimeout(250);
  assert.ok(Number(await page.evaluate('window.frames')) > Number(heldFrames), 'the animation loop resumes after capture');
  assert.equal(await page.evaluate("document.getAnimations().filter(a => a.playState === 'running').length"), 1);
});

test('lazy images below the fold and scroll-driven animations do not stall measurement readiness', { timeout: 60_000 }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  const pixel = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#2f4bff"/></svg>');
  await page.setContent(`<!doctype html><style>
    .reveal { animation: rise linear both; animation-timeline: view(); } @keyframes rise { from { opacity: 0; } }
  </style><p class="reveal">Scroll-driven</p><div style="height:2400px"></div><img id="late" loading="lazy" src="${pixel}" width="40" height="40">`);
  const started = Date.now();
  await measurementReady(page);
  assert.ok(Date.now() - started < 4000, 'readiness must not wait for a scroll that never comes');
  assert.equal(await page.evaluate("document.getElementById('late').complete && document.getElementById('late').naturalWidth > 0"), true);
  await releaseMeasurementFrame(page);
});

test('a time-based animation that is still running is still awaited before capture', { timeout: 60_000 }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await page.setContent(`<!doctype html><style>.once { animation: fade 1.2s ease-out both; } @keyframes fade { from { opacity: 0; } }</style><p class="once">Settles</p>`);
  await measurementReady(page);
  assert.equal(await page.evaluate("getComputedStyle(document.querySelector('.once')).opacity"), '1');
  await releaseMeasurementFrame(page);
});

test('measurement readiness ships its page callback with the __name helper a transpiling loader needs', async () => {
  const sources: string[] = [];
  const page = { evaluate: async (callback: unknown) => { sources.push(String(callback)); } };
  await measurementReady(page as unknown as Parameters<typeof measurementReady>[0]);
  assert.match(sources[0]!, /const __name = \(callback\) => callback/);
});
