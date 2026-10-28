# Parallax

A parallax effect moves background and foreground elements at different rates as the
user scrolls, creating an illusion of depth. The CSS scroll-driven implementation
(`animation-timeline: scroll()`) moves an element by a fixed offset over the full
scroll range of its container without author JavaScript on each frame. The browser still
performs rendering work, and off-main-thread execution is not guaranteed for every
property, browser, or page.

Read the restraint clause below before deciding whether to use this recipe. The evidence
for not using parallax is substantial, and the recipe's conditions are narrow.

## When it earns its place / When it does not

Condition: the content is a scroll-narrative — a case study, a product demo page, a
campaign microsite — and the concept explicitly requires a sense of depth or layering.
The parallax element contributes to the narrative; removing it would remove meaning, not
just decoration. The movement is subtle: the `--parallax-offset` is small (20–40px over
the full scroll range), producing depth rather than motion-sickness. `core/theory/
motion.md`: "use scroll-linked animation only when the content is itself a
scroll-narrative and the concept explicitly requires it."

Condition against: product UI. Navigation elements. Any page where the user is scanning
for content rather than experiencing a narrative. `core/theory/motion.md` cites the
NN/g evidence directly: users scroll quickly to scan for keywords; parallax requires slow
scrolling to read; users who scroll at normal speed can miss the effect, and parallax can
trigger vestibular symptoms. The NN/g article "What Parallax Lacks" (2019) reports
content missed by fast scrollers, reading and control problems, dizziness, effects that
go unnoticed, and lukewarm user reactions. Measure Core Web Vitals and frame delivery
on the actual implementation rather than attributing an unverified performance case
to this pattern.

If you are reaching for parallax because the page needs more visual interest, the correct
answer is a better layout or a stronger type decision — not depth simulation. Apply this
recipe only when the brief explicitly names the concept as depth-dependent and the scroll
narrative test is met.

## Parameters

```css
:root {
  /* How far the element moves over the full scroll range of its container.
     20–40px is an illustrative subtle range, not a safety threshold.
     Negative values move the element against the scroll direction (classic parallax).
     Positive values move it with scroll (subtle, less disorienting). */
  --parallax-offset: -30px;

  /* Whether to apply the effect. Set to 'none' to disable without removing CSS. */
  --parallax-enabled: block; /* unused in current implementation; see JS approach */
}
```

## Implementation

```html
<section class="parallax-section">
  <!-- The background element moves at the slower rate. -->
  <div class="parallax-bg" aria-hidden="true">
    <!-- decorative image or gradient -->
  </div>

  <!-- Foreground content scrolls at normal speed. -->
  <div class="parallax-content">
    <h2>The infrastructure layer</h2>
  </div>
</section>
```

```css
/* ── CSS scroll-driven (preferred when supported and measured) ───────────── */

.parallax-section {
  /* Establish a scroll timeline scoped to this container. */
  overflow: hidden; /* contain the background overflow */
  position: relative;
}

.parallax-bg {
  position: absolute;
  inset: calc(var(--parallax-offset) * -1) 0; /* compensate so bg fills section at start */
  background-image: var(--parallax-bg-image);
  background-size: cover;
  background-position: center;

  /* The animation moves translateY from 0 to --parallax-offset over the scroll range. */
  animation: parallax-drift linear both;
  animation-timeline: scroll(root block); /* tracks document scroll, not section scroll */
  animation-range: contain 0% contain 100%;
}

@keyframes parallax-drift {
  from { transform: translateY(0); }
  to   { transform: translateY(var(--parallax-offset)); }
}

/* ── IntersectionObserver + requestAnimationFrame fallback ───────────────── */
/* For browsers without scroll-driven support; also gives per-frame control. */
```

```js
// Only use the JS path when CSS scroll-driven is unavailable.
if (!CSS.supports('animation-timeline', 'scroll()')) {
  document.querySelectorAll('.parallax-bg').forEach(attachParallax);
}

function attachParallax(el) {
  const section = el.closest('.parallax-section');
  if (!section) return;

  const offset = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--parallax-offset')
  ) || -30;

  let ticking = false;

  function update() {
    const rect = section.getBoundingClientRect();
    const viewH = window.innerHeight;

    // Progress: 0 = section top at bottom of viewport, 1 = section bottom at top.
    const progress = (viewH - rect.top) / (viewH + rect.height);
    const clamped = Math.max(0, Math.min(1, progress));

    // Transform avoids changing document layout; rendering cost still needs profiling.
    el.style.transform = `translateY(${clamped * offset}px)`;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });
}
```

## React

```tsx
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';

function ParallaxSection({
  children,
  bgContent,
  offset = -30,
}: {
  children: React.ReactNode;
  bgContent: React.ReactNode;
  offset?: number; // px; negative = against scroll direction
}) {
  const sectionRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });

  const y = useTransform(scrollYProgress, [0, 1], [0, offset]);

  return (
    <div ref={sectionRef} style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Background moves at a different rate */}
      <motion.div
        style={{
          position: 'absolute',
          inset: `${Math.abs(offset)}px 0`,
          y,
        }}
        aria-hidden
      >
        {bgContent}
      </motion.div>

      {/* Foreground at normal scroll speed */}
      <div style={{ position: 'relative' }}>
        {children}
      </div>
    </div>
  );
}
```

## Reduced-motion variant

In reduced-motion context, the parallax background is static — no scroll-linked
movement. The section renders identically to a non-parallax section with a normal
background image.

```css
@media (prefers-reduced-motion: reduce) {
  .parallax-bg {
    animation: none;
    transform: none;
    /* Restore to full-bleed static background. */
    inset: 0;
  }
}
```

The JS path must also check:

```js
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!prefersReduced && !CSS.supports('animation-timeline', 'scroll()')) {
  document.querySelectorAll('.parallax-bg').forEach(attachParallax);
}
```

This is one of the few recipes where the reduced-motion variant genuinely improves the
experience for a broader audience — not just the audience that has set the preference.
As `core/theory/motion.md` notes, many users who experience vestibular discomfort from
parallax have not discovered or set the `prefers-reduced-motion` preference. The
restraint clause above (applying this recipe narrowly) is the stronger intervention.

## Performance note

The CSS scroll-driven path removes the author-side per-frame callback, but it does not
guarantee an off-main-thread pipeline or lower total cost. Compare it with the
`requestAnimationFrame` fallback in browser performance tools using the real background,
section size, and surrounding page.

The JS path uses the `ticking` pattern to batch updates to one `requestAnimationFrame`
per scroll event burst. `{ passive: true }` communicates that the handler will not call
`preventDefault()`; it does not guarantee smooth scrolling.

Do not assume that the scroll-driven animation or Framer Motion has promoted a stable
layer. Add `will-change` only when profiling demonstrates a benefit, and remove it when
the animation is no longer imminent.

Keep `--parallax-offset` proportionate to the section. The `30px` example is a restrained
starting point; test larger and smaller values for legibility, overlap, and vestibular
comfort rather than treating one ratio as a perceptual guarantee.
