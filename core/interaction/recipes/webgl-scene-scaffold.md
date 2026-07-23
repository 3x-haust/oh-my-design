# WebGL scene scaffold (the safe envelope every WebGL recipe builds on)

A WebGL/canvas scene is the highest-cost, highest-risk carrier OMD can ship: a rendering
library, a `<canvas>` that assistive technology and search engines cannot read, a per-frame
render loop that competes with the main thread, and a class of failure (context loss, no GPU,
reduced-motion) that a static image never has. This scaffold is not a technique on its own — it
is the mandatory envelope that makes the shader and particle recipes safe. Read it before either.

`core/theory/expressive.md` names FWA (WebGL, generative systems, bespoke interaction) as the
technical ceiling of the showpiece register. This scaffold is how the toolkit actually reaches
that ceiling without shipping an inaccessible, jank-prone canvas as the default.

## When it earns its place / When it does not

Condition: a `showpiece` (or explicitly authorised `confident`) surface whose concept is
genuinely spatial, volumetric, generative, or physical — light through geometry, a particle
system that is the product's own metaphor, a shader field a 2D gradient cannot represent — and
the CSS/SVG lane is provably insufficient for that mechanism, not merely less flashy.

Condition against: any `product`/`quiet` surface; any case where a static image, a CSS gradient,
an SVG system, or one of the CSS motion recipes already carries the concept; "it needs more
visual interest" (the answer is a stronger layout or type decision, never a canvas); a factual
carrier (a real product screen, a real person, a logo) — those are never WebGL.

## Gate

A WebGL scene ships only when all three hold, matching the asset-strategy gate
(`decideAssetStrategy` → `webgl-3d`, `evaluateWebglEscalation`) and the hand/composer prompts:

- **hand precedence** — an explicit user request for a 3D/volumetric/generative treatment, or a
  greenfield concept whose own mechanism is 3D and cannot be represented in 2D;
- **a declared performance budget** — bundle size (the renderer is not a default dependency) and
  runtime cost (target 60fps on mid hardware, a hard DPR cap) that this surface can actually
  afford, recorded with `omd decision`;
- **a non-canvas semantic fallback** — real DOM content that stays selectable, focusable, and
  indexable with the canvas absent or failed. The canvas is a decorative layer behind real
  content, never a replacement for it.

Absent any one gate, do not escalate: fall back to the CSS/SVG graphics recipes per
`graphics/placeholder-policy.md`.

## Parameters

```js
const SCENE_BUDGET = {
  maxDpr: 1.5,          // hard cap on devicePixelRatio — a 3x retina canvas is a GPU tax, not sharper
  targetFps: 60,        // degrade quality (fewer particles, lower-res buffer) before dropping frames
  initMargin: '200px',  // IntersectionObserver rootMargin: warm the renderer just before it enters
  maxRuntimeMs: null,   // optional auto-teardown for a one-shot intro scene; null = runs while visible
};
```

## Implementation

The scaffold is renderer-agnostic (raw WebGL or Three.js). It does four things every WebGL
recipe needs: lazy-initialise only when visible and permitted, cap the pixel ratio, tear down on
exit, and survive context loss. It never blocks first paint — the DOM fallback renders first and
the canvas layers on top.

```html
<!-- The DOM fallback is the real content; it renders and stands on its own. -->
<section class="scene" data-webgl-scene>
  <canvas class="scene__canvas" aria-hidden="true"></canvas>
  <div class="scene__content"><!-- real, selectable, focusable DOM --></div>
</section>
```

```css
.scene { position: relative; isolation: isolate; }
.scene__canvas { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.scene__content { position: relative; z-index: 1; } /* content always sits above the canvas */
```

```js
export function mountWebglScene(section, createScene) {
  // createScene(canvas, budget) => { render(t), resize(w,h,dpr), dispose() }
  const canvas = section.querySelector('.scene__canvas');
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasWebgl = (() => {
    try { return !!(canvas.getContext('webgl2') || canvas.getContext('webgl')); }
    catch { return false; }
  })();

  // No GPU / no support ⇒ never initialise. The DOM fallback is already on screen.
  if (!hasWebgl) return () => {};

  let scene = null, raf = 0, running = false;

  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, SCENE_BUDGET.maxDpr);
    const { clientWidth: w, clientHeight: h } = section;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    scene?.resize(w, h, dpr);
  };

  const start = () => {
    if (running) return; running = true;
    scene ??= createScene(canvas, SCENE_BUDGET);
    size();
    if (prefersReduced) { scene.render(0); return; }   // one static settled frame, then stop
    const loop = (t) => { scene.render(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
  };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  // Lazy-init: only build the renderer when the surface is near the viewport.
  const io = new IntersectionObserver(
    ([e]) => (e.isIntersecting ? start() : stop()),
    { rootMargin: SCENE_BUDGET.initMargin },
  );
  io.observe(section);

  const onResize = () => running && size();
  window.addEventListener('resize', onResize, { passive: true });

  // Context loss is expected on real devices (tab backgrounded, GPU reset). Recover, do not crash.
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(); }, false);
  canvas.addEventListener('webglcontextrestored', () => { scene = null; start(); }, false);

  return () => { io.disconnect(); window.removeEventListener('resize', onResize); stop(); scene?.dispose(); };
}
```

## Non-canvas fallback

The `.scene__content` DOM is the fallback and it is not optional. Everything the surface must
communicate — heading, value, CTA, real content — lives there and is legible with the canvas
removed. The canvas only ever adds atmosphere behind it. Test the surface with the `<canvas>`
element deleted from the DOM: if anything essential disappears or the layout breaks, the scene is
being used as content, which is a fallback failure. A `showpiece` scroll narrative built on WebGL
still keeps its complete no-scroll, no-canvas baseline (see `human-design-loop.md` scroll-scene).

## Reduced-motion variant

Under `prefers-reduced-motion: reduce` the scaffold renders exactly one settled frame and stops
the loop — never a frozen mid-animation frame, never a continuous render. For a scene whose only
value is motion, skip renderer initialisation entirely and let the DOM fallback (or its static
CSS-gradient stand-in) carry the surface. A reduced-motion user must never pay the renderer's
load and battery cost for motion they asked not to see.

## Performance note

The renderer is lazy-initialised via IntersectionObserver and torn down when the surface leaves
the viewport; it is never constructed at page load and never runs while off-screen. The pixel
ratio is hard-capped (`maxDpr`) because a 3x device buffer quadruples fragment-shader cost for no
perceptible gain. Prefer WebGL2, degrade quality (particle count, buffer resolution) before
dropping below the FPS target, and account for renderer initialisation cost, per-frame render
cost, and total JS payload against the declared performance budget — none of it is free, and none
of it is justified when a CSS/SVG lane already carries the concept.
