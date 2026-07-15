# Signature lighting (mouse-follow spotlight / god-ray)

A signature-lighting interaction ties a soft light source — a spotlight or a god-ray
volume — to the pointer, so the surface reads as lit from where the visitor is looking.
The pointer becomes the light. This is a single-slot signature moment: it earns the one
signature-moment allowance for a page and must not be combined with a second competing
signature interaction on the same surface.

## When it earns its place / When it does not

Condition: a showpiece or confident-register hero, section divider, or dark-canvas
surface where a light-driven read reinforces the product's own mechanism (optics,
depth, focus, discovery) and no other signature moment is already claimed. The
spotlight/god-ray works best over a dark or low-chroma ground, where the lit region
reads as a genuine luminance shift rather than a colour overlay.

Condition against: quiet-register or dense utility surfaces where a moving light draws
attention away from task completion; light backgrounds, where a `radial-gradient`
spotlight reads as a grey smudge instead of light; any surface that has already been
assigned a different signature moment (magnetic hover, parallax, etc.) — do not stack
two signature interactions on one page. Also: touch-primary contexts, where there is no
pointer to follow (see Reduced-motion variant for the fallback, which doubles as the
no-pointer fallback).

The default implementation lane is CSS. It requires no library, degrades safely, and
is cheap enough to run continuously. Escalating to a WebGL renderer is optional and
must be justified — see WebGL escalation below.

## Parameters

```css
:root {
  /* Pointer position in the lit surface's local coordinate space, updated on
     pointermove. Falls back to the element's centre before first movement. */
  --spot-x: 50%;
  --spot-y: 40%;

  /* Radius of the lit region. Larger values read as ambient god-ray light;
     smaller values read as a tight spotlight/torch. */
  --spot-radius: 45vmax;

  /* Colour and intensity of the lit region. Keep low-saturation: this is a
     luminance effect, not a colour wash. */
  --spot-color: rgba(255, 255, 255, 0.14);

  /* How quickly the lit region eases toward the pointer's true position.
     Non-zero lag reads as a physical light with mass; zero lag reads as a
     cursor decoration. */
  --spot-follow-duration: 400ms;
  --spot-follow-ease: var(--ease-out-circ, cubic-bezier(0.08, 0.82, 0.17, 1));
}
```

## Implementation

CSS is the default lane: a `radial-gradient` positioned by custom properties that a
`pointermove` listener updates. No canvas, no library.

```html
<section class="lit-surface" data-signature-light>
  <div class="lit-surface__content"><!-- real page content --></div>
</section>
```

```css
.lit-surface {
  position: relative;
  isolation: isolate;
}

.lit-surface::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: radial-gradient(
    circle at var(--spot-x) var(--spot-y),
    var(--spot-color) 0%,
    transparent var(--spot-radius)
  );
  transition: --spot-x var(--spot-follow-duration) var(--spot-follow-ease),
    --spot-y var(--spot-follow-duration) var(--spot-follow-ease);
}

.lit-surface__content {
  position: relative;
  z-index: 1;
}
```

```js
function attachSignatureLight(surface) {
  function onMove(e) {
    const rect = surface.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    surface.style.setProperty('--spot-x', `${x}%`);
    surface.style.setProperty('--spot-y', `${y}%`);
  }
  surface.addEventListener('pointermove', onMove, { passive: true });
}

if (window.matchMedia('(pointer: fine)').matches) {
  document.querySelectorAll('[data-signature-light]').forEach(attachSignatureLight);
}
```

`transition` on a custom property requires `@property` registration for the browser to
interpolate it as a `<percentage>` instead of snapping; register both custom properties
once at the stylesheet root:

```css
@property --spot-x {
  syntax: '<percentage>';
  inherits: true;
  initial-value: 50%;
}
@property --spot-y {
  syntax: '<percentage>';
  inherits: true;
  initial-value: 40%;
}
```

## WebGL escalation

The CSS lane above is the default and covers the large majority of signature-lighting
requests: a `radial-gradient` tied to pointer coordinates reads convincingly as a
spotlight or ambient god-ray without a rendering library. Escalating to a WebGL
implementation (Three.js) is permitted only when all of the following hold, per hand
precedence:

- an explicit user request for a volumetric/3D lighting treatment, or a greenfield
  concept where the product mechanism itself is 3D and a 2D gradient cannot represent
  it (e.g. true light shafts through geometry, refraction, depth-of-field falloff);
- a declared performance budget (bundle-size and runtime cost) that the surface can
  actually afford — Three.js is not a default dependency and must be justified per
  page, not assumed;
- a non-canvas semantic fallback: the underlying content must remain real DOM, so it
  stays selectable, focusable, and readable by assistive technology and search
  indexing with the canvas absent or failed. The canvas is a decorative light layer
  behind real content, never a replacement for it.

Reference: kaolti's WebGL/Three.js signature-lighting work (HTML-in-canvas content
composited with a Three.js volumetric light pass, built with Fable/F#) demonstrates the
escalation lane at its most literal — light genuinely lives in a 3D scene rather than
being simulated with a 2D gradient. The author's own retrospective on that work flagged
the god-ray pass as having too much visual noise for the surface it sat on. That
self-critique is the concrete basis for the restraint calibration in this recipe:
escalate to WebGL only when the CSS lane is provably insufficient for the mechanism,
keep the lit region's opacity and radius conservative even in the WebGL lane, and treat
"more visible light" as a defect, not a feature, once the signature moment already
reads. This recipe's default is CSS, and the WebGL lane is not a visual upgrade — it is
a narrow, gated escalation for volumetric cases the CSS lane cannot represent.

## Reduced-motion variant

In reduced-motion context (and on `pointer: coarse` devices with no cursor to follow),
the lit region is disabled entirely, or replaced with a static, fixed-position ambient
gradient that does not track any input. No `pointermove` listener is attached; no
custom-property transition runs.

```css
@media (prefers-reduced-motion: reduce) {
  .lit-surface::before {
    transition: none !important;
    background: radial-gradient(
      circle at 50% 35%,
      var(--spot-color) 0%,
      transparent var(--spot-radius)
    );
  }
}
```

```js
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pointerFine = window.matchMedia('(pointer: fine)').matches;

if (pointerFine && !prefersReduced) {
  document.querySelectorAll('[data-signature-light]').forEach(attachSignatureLight);
}
```

If a WebGL escalation is in use, the reduced-motion and no-pointer-fine paths must skip
canvas/renderer initialisation entirely and fall back to the same static CSS gradient —
never to a frozen WebGL frame, which still carries the renderer's load cost for no
motion benefit.

## Performance note

`radial-gradient` repaint driven by custom-property `transition` is compositor-light
but not compositor-only — moving the gradient's centre still triggers a paint on
`::before`, not a transform. Keep the effect scoped to one lit surface per page (the
one-signature-moment allowance already enforces this) and avoid attaching the
`pointermove` listener to more than one element.

If escalating to WebGL, the performance budget must account for renderer
initialisation cost, per-frame render cost, and total JS payload added to the page;
none of this is free, and none of it is justified for a spotlight effect the CSS lane
already achieves. Lazy-initialise the WebGL renderer only after the surface enters the
viewport, and tear it down when it leaves.
