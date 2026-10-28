# Scroll reveal

A scroll reveal makes content visible as it enters the viewport — opacity rising from
zero, a small translate completing to zero — so that each section announces itself as
the user scrolls toward it rather than sitting pre-exposed on a long static page.

The implementation hierarchy is: CSS scroll-driven animations first (`animation-timeline:
view()`), IntersectionObserver as the fallback for broader browser support. The static
layout — what the page shows when no animation fires — must be complete and legible.

## When it earns its place / When it does not

Condition: the content is a scroll narrative — sections have a sequential logic, and the
reveal of each section reinforces the order of reading. A portfolio case study where
chapters arrive one by one, a product page where features emerge in the sequence the
concept requires. The animation confirms what the layout already implies: read this, then
this, then this.

Condition against: product UI that the user came to operate. Navigation elements. Any
content the user is scrolling to find — when the destination is below the fold and the
user is scanning for it, a reveal that delays visibility is a usability failure dressed
as an aesthetic choice. `expressive.md`: "A reveal that delays reading is a usability
failure regardless of how well-timed it is." Also: `core/theory/motion.md` — entrance
animations that replay on scroll turn scrolling into a performance the user must watch.
Scroll-triggered reveal belongs on presentation pages, not on tools.

## Parameters

```css
:root {
  /* Illustrative travel distance. Test 20–32px as a restrained starting range;
     larger values create a more pronounced movement. */
  --reveal-y: 28px;

  /* Illustrative duration for this reveal; tune it to distance and content. */
  --duration-reveal: 340ms;

  /* Easing from core/motion/easing.md. ease-out-quint for graceful arrival;
     ease-out-expo for decisive arrival. */
  --ease-reveal: var(--ease-out-quint);

  /* For staggered groups (see stagger-orchestrator.md), this is the per-item delay. */
  --stagger-reveal: 60ms;
}
```

## Implementation

```css
/* ── CSS scroll-driven (preferred; Chromium 115+, Safari 18+) ─────────────── */

.reveal {
  animation: reveal-up var(--duration-reveal) var(--ease-reveal) both;
  animation-timeline: view();
  /* entry 0% = element starts entering viewport; 25% = comfortably inside. */
  animation-range: entry 0% entry 25%;
}

@keyframes reveal-up {
  from {
    opacity: 0;
    transform: translateY(var(--reveal-y));
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ── IntersectionObserver fallback for browsers without scroll-driven support ── */
/* Start hidden; JS adds .is-visible when the element intersects. */
@supports not (animation-timeline: view()) {
  .reveal {
    opacity: 0;
    transform: translateY(var(--reveal-y));
    transition: opacity var(--duration-reveal) var(--ease-reveal),
                transform var(--duration-reveal) var(--ease-reveal);
  }

  .reveal.is-visible {
    opacity: 1;
    transform: translateY(0);
  }
}
```

```js
// Only runs in browsers that lack scroll-driven animation support.
if (!CSS.supports('animation-timeline', 'view()')) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          // Reveal fires once. Unobserve after first intersection.
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 } // 15% of element visible triggers reveal
  );

  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
}
```

## React

```tsx
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const revealVariants = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.34,
      ease: [0.22, 1, 0.36, 1], // --ease-out-quint
    },
  },
};

function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // once: true — reveals fire once, not on every scroll pass.
  const isInView = useInView(ref, { once: true, margin: '-10% 0px' });

  return (
    <motion.div
      ref={ref}
      className={className}
      variants={revealVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
    >
      {children}
    </motion.div>
  );
}

// For staggered groups, wrap in a container with staggerChildren:
const groupVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

function RevealGroup({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-10% 0px' });

  return (
    <motion.div
      ref={ref}
      variants={groupVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
    >
      {children}
    </motion.div>
  );
}
```

## Reduced-motion variant

The reduced-motion state must be a complete, legible layout — not an empty page waiting
for JavaScript, not hidden content. In reduced-motion context, elements are visible from
the start. No fade, no translate, no delay.

```css
@media (prefers-reduced-motion: reduce) {
  .reveal {
    /* Override both the scroll-driven animation and the IO fallback. */
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
  }
}
```

The IntersectionObserver JS should also check before adding opacity:

```js
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!prefersReduced && !CSS.supports('animation-timeline', 'view()')) {
  // ... observer setup
}
```

## Performance note

`animation-timeline: view()` removes the author-side per-frame callback. That does not
guarantee an off-main-thread pipeline or lower total cost: the animated properties,
layering, page size, and browser still determine rendering work. IntersectionObserver
fires a callback at threshold changes rather than on every animation frame; compare the
two paths in the target browsers when performance is material.

Prefer `opacity` and `transform`; they usually avoid layout changes, though paint and
compositing work can remain. Avoid animating `height`, `padding`, or `margin` when a
visual transform such as `scaleY()` expresses the same result. When layout itself must
change, implement and profile that behavior rather than hiding it behind a rule.

Do not apply `will-change: transform` to every `.reveal` by default. Layer decisions and
memory cost vary by browser; use the hint only when profiling shows an improvement and
scope it to the period just before and during the reveal.
