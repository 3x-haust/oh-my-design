# Stagger orchestrator

A stagger orchestrator drives a group of sibling elements — cards, list items, nav links,
feature blocks — so each child enters slightly after the previous, reading the group as a
sequence rather than a simultaneous burst. The recipe handles both static lists (CSS
nth-child delay cascade) and dynamic lists (JS-computed delays) and centralises the
stagger math so it is filled from the board's motion invariants rather than hardcoded
per-component.

## When it earns its place / When it does not

Condition: the elements have an implied order — a feature list whose items have a
sequence, a card grid whose items are ranked, a navigation whose items flow from primary
to secondary. The stagger communicates that order; the eye follows the arrival sequence
and reads a hierarchy. `core/theory/motion.md`: "staggering their arrivals reads the
group as a sequence — semantically correct when the elements have an implied order."

Condition against: elements with no meaningful order — a tag cloud, a random mosaic, a
grid of equally-weighted items. Staggering unordered items implies a sequence that does
not exist, which is misleading choreography. Also: long lists. A 30-item list staggered
at 60ms arrives over 1.8 seconds — the last card enters nearly two seconds after the
first, by which point the user has scrolled past it. Cap staggered groups at eight to
ten items; beyond that, consider grouping (reveal the first row together, then the second)
or collapsing the stagger to 20ms so the total remains under 600ms.

The stagger budget calculation: `--stagger-base × (n - 1)` must stay under 600ms.
For a group of eight at 55ms, the total span is 385ms — within budget. For fifteen items
at 55ms, the span is 770ms — over budget. Either reduce the group or reduce the delay.

## Parameters

```css
:root {
  /* Delay between each successive element. 40–80ms from core/theory/motion.md.
     Below 40ms: imperceptible, wasted. Above 80ms: waterfall. */
  --stagger-base: 55ms;

  /* Duration for each element's entrance animation. Independent of stagger;
     each element animates for its full duration from its delayed start. */
  --stagger-duration: 320ms;

  /* Easing for each element's entrance. */
  --stagger-ease: var(--ease-out-quint);

  /* Vertical translate offset on entrance. */
  --stagger-translate-y: 20px;
}
```

## Implementation

```css
/* ── CSS nth-child cascade (for static, known-count lists) ─────────────────── */

.stagger-group > * {
  opacity: 0;
  transform: translateY(var(--stagger-translate-y));
  animation: stagger-in var(--stagger-duration) var(--stagger-ease) forwards;
}

@keyframes stagger-in {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Generate nth-child delays via CSS. For a group of up to 10 items: */
.stagger-group > *:nth-child(1)  { animation-delay: calc(var(--stagger-base) * 0); }
.stagger-group > *:nth-child(2)  { animation-delay: calc(var(--stagger-base) * 1); }
.stagger-group > *:nth-child(3)  { animation-delay: calc(var(--stagger-base) * 2); }
.stagger-group > *:nth-child(4)  { animation-delay: calc(var(--stagger-base) * 3); }
.stagger-group > *:nth-child(5)  { animation-delay: calc(var(--stagger-base) * 4); }
.stagger-group > *:nth-child(6)  { animation-delay: calc(var(--stagger-base) * 5); }
.stagger-group > *:nth-child(7)  { animation-delay: calc(var(--stagger-base) * 6); }
.stagger-group > *:nth-child(8)  { animation-delay: calc(var(--stagger-base) * 7); }
.stagger-group > *:nth-child(9)  { animation-delay: calc(var(--stagger-base) * 8); }
.stagger-group > *:nth-child(10) { animation-delay: calc(var(--stagger-base) * 9); }
```

```js
// ── JS version for dynamic lists or when scroll-triggered stagger is needed ──
// Reads the custom property from :root so the board-wired token is respected.

function applyStagger(container) {
  const base = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--stagger-base')
  ) || 55;

  const children = Array.from(container.children);
  children.forEach((child, i) => {
    child.style.animationDelay = `${i * base}ms`;
    child.style.animationPlayState = 'running';
  });
}

// For scroll-triggered stagger: observe the container, apply delays when it enters view.
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        applyStagger(entry.target);
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1 }
);

document.querySelectorAll('.stagger-group').forEach((el) => observer.observe(el));
```

## React

```tsx
import { motion } from 'framer-motion';

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.055, // --stagger-base
      delayChildren: 0,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.32,          // --stagger-duration
      ease: [0.22, 1, 0.36, 1], // --ease-out-quint
    },
  },
};

function StaggerGroup<T>({
  items,
  renderItem,
}: {
  items: T[];
  renderItem: (item: T, i: number) => React.ReactNode;
}) {
  return (
    <motion.ul
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {items.map((item, i) => (
        <motion.li key={i} variants={itemVariants}>
          {renderItem(item, i)}
        </motion.li>
      ))}
    </motion.ul>
  );
}
```

For scroll-triggered stagger in React, combine with `useInView`:

```tsx
import { useInView } from 'framer-motion';
import { useRef } from 'react';

function ScrollStaggerGroup({ items, renderItem }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-15% 0px' });

  return (
    <motion.ul
      ref={ref}
      variants={containerVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
    >
      {items.map((item, i) => (
        <motion.li key={i} variants={itemVariants}>
          {renderItem(item, i)}
        </motion.li>
      ))}
    </motion.ul>
  );
}
```

## Reduced-motion variant

In reduced-motion context, all group members are visible simultaneously — no stagger,
no translate, no fade sequence. The content is available immediately.

```css
@media (prefers-reduced-motion: reduce) {
  .stagger-group > * {
    opacity: 1;
    transform: none;
    animation: none !important;
  }
}
```

For the JS path, check before applying delays:

```js
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!prefersReduced) {
  document.querySelectorAll('.stagger-group').forEach((el) => observer.observe(el));
}
```

## Performance note

Each child animates only `opacity` and `transform: translateY()` — compositor-only
properties. At 60fps on mid-range hardware, ten simultaneous opacity + transform
animations present no measurable cost. The browser composites them independently on
the GPU.

The CSS nth-child approach requires no JavaScript and is therefore zero-overhead at
runtime. Prefer it for static lists. The JS approach adds one IntersectionObserver
callback per group; the callback fires once and is immediately disconnected.

Do not generate more than ten nth-child rules in CSS for staggered groups — beyond ten
items, the total stagger duration at 55ms/item (550ms+) exceeds the perceivable range
and the JS approach with a capped delay is preferable.
