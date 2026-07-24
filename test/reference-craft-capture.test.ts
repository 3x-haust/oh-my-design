import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { captureReferenceCraft } from '../core/ref/reference-craft-capture.ts';

const fixture = (name: string): string => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));
const viewport = { width: 800, height: 600 };

test('captureReferenceCraft measures reveal motion and scroll-linkage on a real reveal fixture', async () => {
  const craft = await captureReferenceCraft(fixture('craft-reveal.html'), {
    source: 'fixture', as: 'reveal-part', technique: 'scroll reveal', viewport, selector: '#part',
  });
  assert.equal(craft.schema, 'reference-craft-v1');
  assert.equal(craft.selector, '#part');
  assert.ok(craft.motion.peakEnergy > 0.01, `expected observed motion, got ${craft.motion.peakEnergy}`);
  assert.equal(craft.motion.scrollLinked, true);
  assert.equal(craft.motion.reducedMotionSafe, true);
});

test('captureReferenceCraft records a static part as not moving and not scroll-linked', async () => {
  const craft = await captureReferenceCraft(fixture('craft-static.html'), {
    source: 'fixture', as: 'static-part', technique: 'none', viewport, selector: '#part',
  });
  assert.ok(craft.motion.peakEnergy < 0.01, `expected static, got ${craft.motion.peakEnergy}`);
  assert.equal(craft.motion.scrollLinked, false);
  assert.equal(craft.motion.reducedMotionSafe, true);
});
