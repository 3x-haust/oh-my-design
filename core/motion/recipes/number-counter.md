# Number counter

A number counter animates a numeric value from a starting point to its final value —
`0 → 4,200` or `12% → 98%` — when the element enters the viewport. The motion is
eased so the count accelerates at first and decelerates as it approaches the target,
reading as accumulation rather than mechanical increment.

## When it earns its place / When it does not

Condition: a stat whose magnitude is the point — the scale of a number communicates
something the number alone at rest does not. "4,200 customers" has more weight arriving
from zero than landing at rest. The counter is appropriate when the count duration
aligns with reading speed: the user sees the number rising and understands its scale
before it settles.

Condition against: tables, data grids, or any context where numbers change due to
user interaction or live data. Animating numbers that the user is trying to read or
compare makes reading impossible. Also: very small numbers — `0 → 5` counts through
all six values visibly; this reads as a spinner rather than an accumulation. Use a
simple fade-in for numbers under 10. Also: numbers that update repeatedly — a live
dashboard counter that re-animates on each update is a usability failure.

The counter must complete quickly enough that the user does not wait for it: 600–1000ms
is the legible range. Beyond 1000ms the user has moved on and the animation resolves
for no one.

## Parameters

```css
:root {
  /* Total duration of the count animation. */
  --counter-duration: 800ms;

  /* The easing is applied to the animation progress, not to a CSS property.
     Described here for documentation; actual implementation is in JS via a
     cubic-bezier computation over the progress value. */
  --counter-ease: ease-out-quint; /* see easing.md for the cubic-bezier values */

  /* Optional: hold before counting starts (e.g., after the element fades in). */
  --counter-delay: 80ms;
}
```

## Implementation

```html
<div class="stat-block">
  <span class="counter" data-target="4200" data-prefix="" data-suffix=" customers">0</span>
</div>
```

```css
/* The counter fades in as counting begins. The value animation is JS-driven
   (requestAnimationFrame), but the entrance uses opacity — a compositor-only
   property — so both axes animate without touching layout. */
.counter {
  font-variant-numeric: tabular-nums;
  opacity: 0;
  transition: opacity 180ms var(--ease-out-quint, ease-out);
}

.counter.is-counting {
  opacity: 1;
}
```

```js
// Easing function: ease-out-quint approximation over [0..1].
// Equivalent to --ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1).
function easeOutQuint(t) {
  return 1 - Math.pow(1 - t, 5);
}

function animateCounter(el) {
  const target = parseFloat(el.dataset.target ?? '0');
  const prefix = el.dataset.prefix ?? '';
  const suffix = el.dataset.suffix ?? '';
  const start = parseFloat(el.dataset.from ?? '0');
  const duration = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--counter-duration')
  ) || 800;
  const delay = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--counter-delay')
  ) || 0;

  // Format numbers with locale-aware separators.
  function format(n) {
    return prefix + Math.round(n).toLocaleString() + suffix;
  }

  // Fade in as counting begins.
  el.classList.add('is-counting');

  let startTime = null;

  function frame(now) {
    if (!startTime) startTime = now + delay;
    const elapsed = Math.max(0, now - startTime);
    const progress = Math.min(1, elapsed / duration);
    const eased = easeOutQuint(progress);
    el.textContent = format(start + (target - start) * eased);

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      el.textContent = format(target); // ensure exact final value
    }
  }

  requestAnimationFrame(frame);
}

// Trigger on intersection — count fires once when the stat enters the viewport.
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.5 }
);

document.querySelectorAll('.counter').forEach((el) => observer.observe(el));
```

## React

```tsx
import { useEffect, useRef, useState } from 'react';
import { useInView } from 'framer-motion';

function easeOutQuint(t: number) {
  return 1 - Math.pow(1 - t, 5);
}

function useCounter(target: number, duration = 800, enabled = true) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }

    let startTime: number | null = null;
    let rafId: number;

    function frame(now: number) {
      if (!startTime) startTime = now;
      const progress = Math.min(1, (now - startTime) / duration);
      setValue(Math.round(target * easeOutQuint(progress)));
      if (progress < 1) {
        rafId = requestAnimationFrame(frame);
      } else {
        setValue(target);
      }
    }

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration, enabled]);

  return value;
}

function StatCounter({
  target,
  prefix = '',
  suffix = '',
  duration = 800,
}: {
  target: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-20% 0px' });
  const value = useCounter(target, duration, isInView);

  return (
    <span ref={ref} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {prefix}{value.toLocaleString()}{suffix}
    </span>
  );
}
```

## Reduced-motion variant

In reduced-motion context, the final number is shown immediately — no counting
animation. The value is present and readable from the moment the element enters
the viewport.

```css
/* No CSS to add — the counter is entirely JS-driven.
   The JS check below handles the reduced-motion case. */
```

```js
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (prefersReduced) {
  // Show final values immediately without animation.
  document.querySelectorAll('.counter').forEach((el) => {
    const target = el.dataset.target ?? '0';
    const prefix = el.dataset.prefix ?? '';
    const suffix = el.dataset.suffix ?? '';
    el.textContent = prefix + parseFloat(target).toLocaleString() + suffix;
  });
} else {
  // ... observer setup
}
```

In the React hook, `useCounter` already accepts an `enabled` flag — pass `false` when
`prefers-reduced-motion` is active:

```tsx
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const value = useCounter(target, duration, isInView && !prefersReduced);
```

## Performance note

`requestAnimationFrame` is the correct animation driver for JS-computed value changes —
it aligns updates to the browser's paint schedule and is automatically throttled on
background tabs. Do not use `setInterval` for counter animation; it runs off the paint
schedule and produces visible frame drops.

The counter updates `textContent` — a DOM write — on every frame. This triggers a
text-specific paint on the element but not a layout reflow, provided the element's
dimensions are stable. `font-variant-numeric: tabular-nums` is required for this:
proportional numerals change width on each digit change, triggering layout reflow on
every frame. Tabular numerals are fixed-width; the element's width is constant.

For multiple counters on one page, each runs its own `requestAnimationFrame` loop.
The browser batches these into one paint per frame; there is no penalty for multiple
concurrent loops.
