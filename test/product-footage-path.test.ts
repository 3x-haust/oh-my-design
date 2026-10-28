import assert from 'node:assert/strict';
import test from 'node:test';
import { humanPath, seededRandom } from '../core/render/product-footage.ts';

const box = { x: 900, y: 500, width: 160, height: 48 };
const from = { x: 200, y: 700 };

test('the recorded cursor lands near, not exactly on, the centre and stays inside the target', () => {
  const centres = Array.from({ length: 20 }, (_, i) => humanPath(from, box, seededRandom(`seed-${i}`)).to);
  assert.ok(centres.some(p => Math.abs(p.x - 980) > 1 || Math.abs(p.y - 524) > 1));
  for (const p of centres) assert.ok(p.x > box.x && p.x < box.x + box.width && p.y > box.y && p.y < box.y + box.height);
});

test('the path bends, varies its speed, and overshoots a long move before settling', () => {
  const { to, points } = humanPath(from, box, seededRandom('long-move'));
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
  const offChord = Math.max(...points.map(p => Math.abs((p.x - from.x) * dy - (p.y - from.y) * dx) / length));
  assert.ok(offChord > length * 0.02, `max deviation ${offChord}`);
  const steps = points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y));
  const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
  const spread = Math.sqrt(steps.reduce((a, b) => a + (b - mean) ** 2, 0) / steps.length) / mean;
  assert.ok(spread > 0.3, `speed variation ${spread}`);
  assert.ok(points.some(p => ((p.x - from.x) * dx + (p.y - from.y) * dy) / length > length + 1), 'no overshoot');
  assert.deepEqual(points.at(-1), { ...to, ms: points.at(-1)!.ms });
});

test('the same step records the same hand', () => {
  assert.deepEqual(humanPath(from, box, seededRandom('same')), humanPath(from, box, seededRandom('same')));
});
