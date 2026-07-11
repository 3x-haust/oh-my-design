# Sticky scene transition

A sticky scene pins the viewport at a fixed scroll position while the user continues
scrolling, advancing an animation timeline inside the pinned area instead of moving the
page. The result: sections that behave as discrete scenes rather than continuous columns.
The scroll gesture becomes a time axis — the user controls playback by scrolling, the
interface responds frame by frame.

## When it earns its place / When it does not

Condition: a multi-scene showpiece where each scene requires the user's full attention
before they advance — a product demo that teaches a feature sequence, a narrative
microsite with distinct chapters, a brand campaign where each scroll beat corresponds
to a concept moment. The scene boundary is earned: the user has finished one scene and
is deliberately entering the next. `expressive.md`: "The stage pins the viewport while
scroll advances the timeline inside the scene."

Condition against: sites where the user is goal-oriented and scrolling to find specific
content. Any product with return visits — a sticky stage the user has already watched
becomes pure friction; they must scroll through the entire scene again to reach content
below it. If there is any chance of return visits, a skip control is required. Also:
sites with more than three or four scenes — beyond that, the user's sense of scroll
distance breaks down and they feel trapped rather than guided. `expressive.md`: "Sticky
stages are navigation debt — the user cannot scroll past to scan; they must watch the
scene play."

## Parameters

```css
:root {
  /* Height of the sticky container — how much scroll distance each scene consumes.
     Larger values give more scroll range per scene (smoother progress on trackpad);
     smaller values feel more abrupt. 200–300vh per scene is typical. */
  --scene-height: 250vh;

  /* Duration of the transition between scenes when using CSS transitions on
     scene-specific elements. */
  --scene-transition-duration: 480ms;

  /* Easing for scene element transitions. */
  --scene-ease: var(--ease-in-out-quint);

  /* Easing for elements entering during a scene. */
  --scene-enter-ease: var(--ease-out-expo);
}
```

## Implementation

```html
<!-- Each .scene-stage is one scene. The inner .scene-content is the pinned viewport.
     The outer .scene-stage provides the scroll track. -->
<div class="scene-stage">
  <div class="scene-content" data-scene="1">
    <div class="scene-panel panel-a">First beat content</div>
    <div class="scene-panel panel-b">Second beat content</div>
  </div>
</div>

<div class="scene-stage">
  <div class="scene-content" data-scene="2">
    <!-- ... -->
  </div>
</div>
```

```css
.scene-stage {
  /* The scroll track: tall enough for the scene's full timeline. */
  height: var(--scene-height);
  position: relative;
}

.scene-content {
  /* Pin the content area for the height of its parent track. */
  position: sticky;
  top: 0;
  height: 100vh;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── CSS scroll-driven: advance panels via scroll progress ────────────────── */
.scene-panel {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: translateY(40px);
  animation: scene-enter var(--scene-transition-duration) var(--scene-enter-ease) forwards;
  animation-timeline: view(block);
  animation-range: entry 10% entry 40%;
}

.scene-panel.panel-b {
  /* Second panel enters at a later point in the scroll range. */
  animation-range: entry 50% entry 80%;
}

@keyframes scene-enter {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

```js
// JS-driven alternative when precise scroll-progress control is needed
// (e.g., driving a canvas, SVG, or WebGL scene with scroll position).

function SceneController(stageEl) {
  const contentEl = stageEl.querySelector('.scene-content');

  function update() {
    const rect = stageEl.getBoundingClientRect();
    const trackHeight = stageEl.offsetHeight - window.innerHeight;
    // progress: 0 = scene just pinned, 1 = scene about to unpin
    const progress = Math.max(0, Math.min(1, -rect.top / trackHeight));

    // Distribute progress to child panels
    const panels = contentEl.querySelectorAll('.scene-panel');
    const segmentSize = 1 / panels.length;
    panels.forEach((panel, i) => {
      const panelProgress = Math.max(0, Math.min(1,
        (progress - i * segmentSize) / segmentSize
      ));
      // Apply panelProgress to panel's opacity and transform
      panel.style.opacity = panelProgress;
      panel.style.transform = `translateY(${(1 - panelProgress) * 40}px)`;
    });
  }

  window.addEventListener('scroll', update, { passive: true });
  update();
}

document.querySelectorAll('.scene-stage').forEach((el) => SceneController(el));
```

## React

```tsx
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';

function StickyScene({ children }: { children: React.ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);

  // scrollYProgress: 0 = scene pinned, 1 = scene unpinning
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end end'],
  });

  return (
    // The track provides scroll height; the sticky wrapper pins content.
    <div ref={trackRef} style={{ height: 'var(--scene-height, 250vh)' }}>
      <div style={{ position: 'sticky', top: 0, height: '100vh' }}>
        {/* Pass scrollYProgress to children via context or props
            for per-element transform wiring */}
        {children}
      </div>
    </div>
  );
}

// A single panel driven by scroll progress:
function ScenePanel({
  enter,  // [0..1] range at which panel enters
  leave,  // [0..1] range at which panel leaves
  scrollProgress,
  children,
}: {
  enter: [number, number];
  leave: [number, number];
  scrollProgress: import('framer-motion').MotionValue<number>;
  children: React.ReactNode;
}) {
  const opacity = useTransform(scrollProgress, [enter[0], enter[1], leave[0], leave[1]], [0, 1, 1, 0]);
  const y = useTransform(scrollProgress, [enter[0], enter[1]], [40, 0]);

  return (
    <motion.div style={{ opacity, y, position: 'absolute', inset: 0 }}>
      {children}
    </motion.div>
  );
}
```

## Reduced-motion variant

In reduced-motion context, the sticky pinning is retained (it is a layout choice, not
a motion effect) but all animated transitions within the scene are removed. Each panel
is visible and the scroll track does not drive any per-frame style change.

```css
@media (prefers-reduced-motion: reduce) {
  .scene-panel {
    opacity: 1;
    transform: none;
    animation: none !important;
    /* Stack panels and let the user read them in document flow. */
    position: relative;
  }

  /* Disable the sticky pinning entirely in reduced-motion to restore normal scroll. */
  .scene-content {
    position: relative;
    height: auto;
  }

  .scene-stage {
    height: auto;
  }
}
```

The JS controller should check `prefers-reduced-motion` and skip scroll-driven updates:

```js
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!prefersReduced) {
  document.querySelectorAll('.scene-stage').forEach((el) => SceneController(el));
}
```

## Performance note

The CSS scroll-driven approach runs off the main thread in Chromium — zero JavaScript
per frame. The JS controller uses `{ passive: true }` on the scroll listener and updates
only `opacity` and `transform`, both compositor properties. Neither path touches layout
on scroll.

`will-change: transform` on pinned panels is appropriate here because these elements are
actively animated for the duration of the scene. Apply it at most to two or three panels
simultaneously; panels that have exited can have `will-change` removed.

The scroll track height (`--scene-height: 250vh`) determines how much scroll travel
each scene consumes. Longer tracks feel smoother on high-resolution trackpads; shorter
tracks feel abrupt. Test on both trackpad and scroll wheel — the scroll granularity
differs and a scene that feels cinematic on a MacBook may stutter on a mouse.
