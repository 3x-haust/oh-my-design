# Scroll scene timeline

A scroll scene pins one section while the scroll distance drives a timeline of several elements
inside it: a product turns, panels exchange, a statement assembles, a figure counts up. Unlike a
triggered reveal, progress is scrubbed — scrolling back plays it backwards — so the reader stays in
control of the pace. This is the mechanism behind most award-site landing narratives. The CSS
`sticky-scene-transition` recipe covers simple cases; this recipe pins with CSS `position: sticky`
and scrubs a multi-element timeline with Motion (`motion`, MIT), with optional Lenis (MIT) smooth
scrolling. Both libraries are free with no use restrictions.

## When it earns its place / When it does not

Condition: a marketing or launch page with one idea that genuinely unfolds in steps — a
before/after, a feature sequence, a product explained part by part — where seeing the steps in
order is the explanation. One or two scenes per page; each scene states one thing.

Condition against: content people scan or return to (documentation, pricing tables, settings),
long scenes whose meaning would fit in one static frame, and stacking several pinned scenes until
the page feels trapped. Every pinned scene is scroll distance the reader must spend; keep the
pinned distance proportional to what changes. If a still composition explains it as well, ship
the still. Observe the result with `omd render <page> --motion`: the scrubbed groups should be
the scene's content, not the whole page.

## Parameters

```js
// Example values; tune by watching the contact sheet and scrolling it yourself.
export const SCENE = {
  // Scroll distance the pinned scene consumes, as a multiple of the viewport height.
  // The section is (1 + distance) viewports tall; the stage stays pinned for `distance`.
  distance: 1.8,
  // Scene progress 0 → 1 runs from "scene top meets viewport top" to "scene bottom meets
  // viewport bottom" — exactly the span in which the sticky stage is pinned.
  offset: ['start start', 'end end'],
};
```

## Implementation

```html
<section class="scene" data-scene style="--scene-distance: 1.8">
  <div class="scene-stage">
    <h2 class="scene-title">One idea, in steps</h2>
    <figure class="scene-figure"><img src="product.png" alt="Product"></figure>
    <ol class="scene-steps">
      <li>First step</li>
      <li>Second step</li>
      <li>Third step</li>
    </ol>
  </div>
</section>
```

```css
/* The pin is plain CSS: a tall section with a sticky stage. No spacer, no JS measurement. */
.scene { position: relative; height: calc((1 + var(--scene-distance)) * 100svh); }
.scene-stage {
  position: sticky;
  top: 0;
  height: 100svh;
  display: grid;
  place-items: center;
  overflow: hidden;
}
/* Without the script every step is simply visible in order. */
.scene-steps li + li { margin-top: 1rem; }
```

```js
// npm i motion lenis   (both MIT). Pin exact versions in package.json.
// Without a bundler: import { animate, scroll } from 'https://cdn.jsdelivr.net/npm/motion@13.5.1/+esm';
import { animate, scroll } from 'motion';
import Lenis from 'lenis';

export function mountScrollScenes({ smooth = false } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  // Lenis drives native scroll, so Motion's scroll tracking needs no wiring.
  const lenis = smooth ? new Lenis({ autoRaf: true }) : null;
  const stops = [...document.querySelectorAll('[data-scene]')].map((scene) => {
    const steps = [...scene.querySelectorAll('.scene-steps li')];
    // A sequence is the timeline. `at` places each segment: '<' starts with the previous one,
    // '-0.1' overlaps it. Durations are relative; the scroll span sets real speed.
    const sequence = [
      [scene.querySelector('.scene-title'), { opacity: [0, 1], y: [40, 0] }, { duration: 1 }],
      [scene.querySelector('.scene-figure'), { opacity: [0, 1], scale: [0.86, 1] }, { duration: 1, at: '-0.8' }],
    ];
    steps.forEach((step, index) => {
      // Each step takes the stage in turn; the previous one steps back.
      sequence.push([step, { opacity: [0, 1], y: [24, 0] }, { duration: 1, at: index === 0 ? undefined : '-0.1' }]);
      if (index > 0) sequence.push([steps[index - 1], { opacity: [1, 0.25] }, { duration: 1, at: '<' }]);
    });
    // Scrubbed: the scroll is the easing, so every segment is linear.
    const timeline = animate(sequence, { defaultTransition: { ease: 'linear' } });
    // scroll() takes control of the timeline's clock: scrolling back plays it backwards.
    return scroll(timeline, { target: scene, offset: ['start start', 'end end'] });
  });
  return () => { stops.forEach((stop) => stop()); lenis?.destroy(); };
}

mountScrollScenes();
```

## React

```tsx
import { useRef, type ReactNode } from 'react';
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react';

/** One step that enters over its slice of the scene's progress and steps back after it. */
function Step({ progress, index, count, children }: {
  progress: MotionValue<number>; index: number; count: number; children: ReactNode;
}) {
  const start = index / count, end = (index + 1) / count;
  const opacity = useTransform(progress, [start, start + 0.1, end, end + 0.1], [0, 1, 1, index === count - 1 ? 1 : 0.25]);
  const y = useTransform(progress, [start, start + 0.1], [24, 0]);
  return <motion.li style={{ opacity, y }}>{children}</motion.li>;
}

/** Pins its stage with CSS sticky and scrubs each step through the scroll span. */
export function ScrollScene({ steps, distance = 1.8 }: { steps: ReactNode[]; distance?: number }) {
  const scene = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: scene, offset: ['start start', 'end end'] });
  if (reduce) return <section><ol>{steps.map((step, i) => <li key={i}>{step}</li>)}</ol></section>;
  return (
    <section ref={scene} style={{ position: 'relative', height: `calc(${1 + distance} * 100svh)` }}>
      <div style={{ position: 'sticky', top: 0, height: '100svh', display: 'grid', placeItems: 'center' }}>
        <ol>{steps.map((step, i) => <Step key={i} progress={scrollYProgress} index={i} count={steps.length}>{step}</Step>)}</ol>
      </div>
    </section>
  );
}
```

## Reduced-motion variant

```css
@media (prefers-reduced-motion: reduce) {
  /* No pin, no scrub: the steps are a readable static sequence. The script above returns
     before building any timeline in this mode, so nothing is hidden. */
  .scene { height: auto; }
  .scene-stage { position: static; height: auto; padding-block: 4rem; }
}
```

## Performance note

Animate `transform` and `opacity` only; a scrubbed timeline runs on every scroll frame, so layout
properties there show up directly as jank. The
sticky pin needs no refresh after fonts or images load, but the scene height must come from CSS,
not from measured content. Keep one smooth-scroll instance per page and never make content
reachability depend on it. Test with a trackpad and a mouse wheel and on a mid-range phone: the
scene should follow the input without lag, and leaving it should return the page to ordinary
scrolling. `omd render <page> --motion` reports the scene as scrubbed groups plus pinned content.
