import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { observeMotion } from '../core/render/motion-timeline.ts';

const CHOREOGRAPHED = `<!doctype html><meta charset="utf-8"><title>m</title>
<style>
body{margin:0;font:18px system-ui}
.hero{height:100vh;display:grid;place-content:center;gap:24px;text-align:center}
h1{font-size:72px;margin:0;opacity:0;transform:translateY(40px);animation:up .7s cubic-bezier(.16,1,.3,1) .1s forwards}
.cards{display:flex;gap:16px;justify-content:center}
.card{width:180px;height:120px;background:#eee;opacity:0;transform:translateY(24px);animation:up .5s cubic-bezier(.16,1,.3,1) forwards}
.card:nth-child(1){animation-delay:.5s}.card:nth-child(2){animation-delay:.62s}.card:nth-child(3){animation-delay:.74s}.card:nth-child(4){animation-delay:.86s}
@keyframes up{to{opacity:1;transform:none}}
section{min-height:80vh;padding:80px}
.r{opacity:0;transform:translateY(60px);transition:all .8s ease-out}.r.in{opacity:1;transform:none}
.pin{height:200vh}.pin h2{position:sticky;top:0;margin:0;padding:20px;background:#fff}
@media (prefers-reduced-motion: reduce){h1,.card{animation:none;opacity:1;transform:none}.r{transition:none}}
</style>
<div class="hero"><h1>Choreographed</h1><div class="cards"><div class="card">A</div><div class="card">B</div><div class="card">C</div><div class="card">D</div></div></div>
<section><p class="r">First reveal paragraph text</p></section>
<section class="pin"><h2>Pinned heading</h2></section>
<section><p class="r">Second reveal paragraph text</p></section>
<script>
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)e.target.classList.add('in')}),{threshold:.2});
document.querySelectorAll('.r').forEach(el=>io.observe(el));
</script>`;

const STATIC = '<!doctype html><meta charset="utf-8"><title>s</title><h1>Still</h1><p>Nothing moves here.</p>';

test('observes a hero lead, card stagger, scroll reveals, pinned content and honoured reduced motion', { timeout: 120_000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-motion-timeline-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const page = join(root, 'index.html');
  writeFileSync(page, CHOREOGRAPHED);
  const { timeline, frames } = await observeMotion(page, { viewport: { width: 1280, height: 800 } });
  assert.equal(timeline.load.lead, 'h1 "Choreographed"');
  const stagger = timeline.load.staggers[0];
  assert.ok(stagger, JSON.stringify(timeline.load));
  assert.equal(stagger.tracks, 4);
  assert.ok(Math.abs(stagger.intervalMs - 120) <= 30, String(stagger.intervalMs));
  assert.ok(timeline.load.tracks.every(track => track.easing === 'ease-out'));
  assert.equal(timeline.scroll.triggered.length, 2);
  assert.ok(timeline.scroll.triggered.every(track => Math.abs(track.durationMs - 800) <= 120));
  assert.deepEqual(timeline.scroll.pinned, ['h2 "Pinned heading"']);
  // Sticky engagement and release are part of the pin, not scroll-linked choreography.
  assert.deepEqual(timeline.scroll.scrubbed, []);
  assert.deepEqual(timeline.reducedMotion, { checked: true, loadTracks: 0, hiddenContent: 0 });
  assert.ok(frames.some(frame => frame.label.startsWith('t=')));
  assert.ok(frames.some(frame => frame.label.startsWith('scroll ')));
});

test('a still page reports no motion rather than inventing choreography', { timeout: 120_000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-motion-still-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const page = join(root, 'index.html');
  writeFileSync(page, STATIC);
  const { timeline } = await observeMotion(page, { viewport: { width: 1280, height: 800 }, reduced: false });
  assert.equal(timeline.load.tracks.length, 0);
  assert.equal(timeline.reducedMotion, null);
  assert.ok(timeline.notes.includes('No load motion observed in sampled content elements.'));
});

const canvasPage = (animated: boolean) => `<!doctype html><meta charset="utf-8"><title>c</title>
<style>body{margin:0;font:18px system-ui}canvas{display:block;width:640px;height:400px}</style>
<h1>Scene</h1><canvas width="640" height="400"></canvas>
<script>
const g=document.querySelector('canvas').getContext('2d');
const draw=t=>{g.fillStyle='#f4efe6';g.fillRect(0,0,640,400);g.fillStyle='#2a6';g.fillRect(40+(t/8)%480,160,80,80);${animated ? 'requestAnimationFrame(draw);' : ''}};
requestAnimationFrame(draw);
</script>`;

test('a canvas scene that keeps playing after content settles gets canvas frames; a still canvas gets none', { timeout: 120_000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-motion-canvas-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const playing = join(root, 'playing.html'), still = join(root, 'still.html');
  writeFileSync(playing, canvasPage(true));
  writeFileSync(still, canvasPage(false));
  const moving = await observeMotion(playing, { viewport: { width: 1280, height: 800 }, scroll: false, reduced: false });
  assert.equal(moving.frames.filter(frame => frame.label.startsWith('canvas ')).length, 4);
  assert.ok(moving.timeline.notes.some(note => note.includes('canvas frames')), JSON.stringify(moving.timeline.notes));
  const resting = await observeMotion(still, { viewport: { width: 1280, height: 800 }, scroll: false, reduced: false });
  assert.equal(resting.frames.filter(frame => frame.label.startsWith('canvas ')).length, 0);
  assert.ok(!resting.timeline.notes.some(note => note.includes('canvas frames')));
});
