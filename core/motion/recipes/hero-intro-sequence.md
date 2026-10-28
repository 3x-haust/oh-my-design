# Hero intro sequence

A hero intro is one short sequence with a lead: the element that carries the page's promise
arrives first, supporting elements follow in overlapping beats, and the whole thing settles
before the reader would have finished the headline anyway. It differs from a stagger: a
stagger repeats one move across equal items, while an intro gives different roles different
moves and timing. `theory/motion.md` (Choreography) supplies the reasoning; this recipe supplies
a dependency-free orchestrator and a Motion (MIT) sequence alternative.

## When it earns its place / When it does not

Condition: a first visit to a marketing or launch page where the hero carries one idea that the
sequence can stage — the headline lands, then the proof (product image, figure, demo) answers
it, then the action appears where the eye ends. The order should follow the reading the page
wants, so the sequence explains the hierarchy rather than decorating it.

Condition against: product surfaces people return to, task entry points, and pages where the
first action must be immediately usable. If the user's goal is to act, show the action at once
and keep any motion on secondary material. Also against: sequences that hold content invisible
after it would naturally have been read, or that replay on every navigation inside the same
session. Observe the result with `omd render <page> --motion`: one lead, distinct roles, and a
settle time you would accept when you already know the page.

## Parameters

```css
:root {
  /* Lead move: the element that carries the promise. Example values, tune by observation. */
  --intro-lead-duration: 720ms;
  --intro-lead-distance: 28px;
  --intro-lead-ease: var(--ease-out-expo);

  /* Supporting moves are shorter and travel less; they should not compete with the lead. */
  --intro-support-duration: 520ms;
  --intro-support-distance: 16px;
  --intro-support-ease: var(--ease-out-quint);

  /* Overlap: a follower starts before its predecessor has settled, so the sequence reads
     as one gesture instead of a queue. Expressed as the gap between starts. */
  --intro-beat-gap: 140ms;
}
```

## Implementation

```html
<!-- data-intro gives the role and order; content is visible without JavaScript. -->
<section class="hero">
  <h1 data-intro="lead">The headline that carries the page</h1>
  <p data-intro="support">One line of proof or context.</p>
  <figure data-intro="proof"><img src="product.png" alt="Product view"></figure>
  <a data-intro="action" href="/start">Start</a>
</section>
```

```css
/* Pre-hide only once the script has opted in, so a script failure never hides the hero. */
.intro-armed [data-intro] { opacity: 0; }
```

```js
// Dependency-free orchestrator built on the Web Animations API. Roles map to moves; the order
// in the document is the order of the sequence. Returns a promise that resolves when settled.
function playHeroIntro(root = document) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const items = [...root.querySelectorAll('[data-intro]')];
  if (reduce || !items.length || !('animate' in Element.prototype)) return Promise.resolve();
  const css = getComputedStyle(document.documentElement);
  const read = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const ms = (name, fallback) => parseFloat(read(name, fallback));
  const moves = {
    lead: { duration: ms('--intro-lead-duration', '720'), distance: read('--intro-lead-distance', '28px'), easing: read('--intro-lead-ease', 'cubic-bezier(0.16, 1, 0.3, 1)') },
    support: { duration: ms('--intro-support-duration', '520'), distance: read('--intro-support-distance', '16px'), easing: read('--intro-support-ease', 'cubic-bezier(0.22, 1, 0.36, 1)') },
  };
  const gap = ms('--intro-beat-gap', '140');
  document.documentElement.classList.add('intro-armed');
  const animations = items.map((el, index) => {
    const move = el.dataset.intro === 'lead' ? moves.lead : moves.support;
    return el.animate(
      [{ opacity: 0, transform: `translateY(${move.distance})` }, { opacity: 1, transform: 'none' }],
      { duration: move.duration, delay: index * gap, easing: move.easing, fill: 'both' },
    );
  });
  return Promise.all(animations.map((animation) => animation.finished)).then(() => {
    // Hand the settled state back to CSS so later layout or theme changes are not frozen.
    animations.forEach((animation) => { animation.commitStyles?.(); animation.cancel(); });
    document.documentElement.classList.remove('intro-armed');
  });
}

playHeroIntro();
```

```js
// Motion alternative when the intro needs spring physics, labels or many overlapping roles.
// npm i motion   (MIT). Without a bundler:
// import { animate } from 'https://cdn.jsdelivr.net/npm/motion@13.5.1/+esm';
import { animate } from 'motion';

function playHeroIntroMotion(root = document) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  const q = (role) => root.querySelectorAll(`[data-intro="${role}"]`);
  const expo = [0.16, 1, 0.3, 1];
  // `at: '-0.58'` starts the follower before the lead settles: overlap, not a queue.
  return animate([
    [q('lead'), { opacity: [0, 1], y: [28, 0] }, { duration: 0.72, ease: expo }],
    [q('support'), { opacity: [0, 1], y: [16, 0] }, { duration: 0.52, ease: expo, at: '-0.58' }],
    [q('proof'), { opacity: [0, 1], y: [16, 0], scale: [0.98, 1] }, { duration: 0.6, ease: expo, at: '<' }],
    [q('action'), { opacity: [0, 1], y: [12, 0] }, { duration: 0.44, ease: expo, at: '-0.4' }],
  ]); // .stop() halts it; .finished resolves when it settles.
}
```

## React

```tsx
import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Wrap a hero whose children carry data-intro roles; plays once per mount. */
export function HeroIntro({ children, gapMs = 140 }: { children: ReactNode; gapMs?: number }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const items = [...el.querySelectorAll<HTMLElement>('[data-intro]')];
    const animations = items.map((item, index) => {
      const lead = item.dataset.intro === 'lead';
      return item.animate(
        [{ opacity: 0, transform: `translateY(${lead ? 28 : 16}px)` }, { opacity: 1, transform: 'none' }],
        { duration: lead ? 720 : 520, delay: index * gapMs, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' },
      );
    });
    return () => animations.forEach((animation) => animation.cancel());
  }, [gapMs]);
  return <div ref={root}>{children}</div>;
}
```

## Reduced-motion variant

```css
@media (prefers-reduced-motion: reduce) {
  /* The content is the point; it is present immediately. A short opacity-only fade is an
     acceptable alternative where an abrupt appearance would feel broken. */
  .intro-armed [data-intro] { opacity: 1; transform: none; }
}
```

## Performance note

Animate only `transform` and `opacity` so the sequence does not trigger layout while images
and fonts are still arriving. Do not pre-hide content in CSS that ships before the script:
arm the hidden state from the script (`intro-armed`) so a failed or slow script leaves the hero
readable. Keep the lead's first frame within the first paint budget — an intro that waits for a
heavy image delays the whole page; stage the image as the follower instead. Verify with
`omd render <page> --motion`: the load Gantt should show one lead, overlapping followers, a
settle time near the sum of gaps plus the last duration, and no layout jumps during the sequence.
