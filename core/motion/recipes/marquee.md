# Marquee

A marquee scrolls a sequence of items continuously across the viewport — a brand phrase
repeated, a list of client names, a scrolling ticker. The motion is constant and
low-velocity; it creates peripheral activity that reinforces the concept without
competing with primary content.

## When it earns its place / When it does not

Condition: the marquee carries a message that is part of the concept — a repeated claim
whose repetition is the point ("Fast. Fast. Fast."), a rhythmic brand phrase, a roster
of names whose accumulation communicates scale. The content loops because looping is
meaningful, not because the list is too long for a static layout.

Condition against: navigation areas and any context where the user is reading or
interacting with nearby content. Peripheral motion competes with focal attention —
`expressive.md`: "A marquee adjacent to a form field splits attention between peripheral
motion and the focal task — vestibular disruption for users with motion sensitivity."
Also: a marquee used because the designer ran out of content. If the marquee stops and
the page still makes sense, the marquee was decoration. If the list it contains would
fit in a single static row, it should be a static row.

One marquee per page is a useful house-style starting point, not a universal ceiling.
Multiple moving regions need stronger concept justification and direct testing because
they can create a kinetic noise floor.

An automatically moving marquee that lasts more than five seconds while other content
is present needs a user-operable pause, stop, or hide mechanism under WCAG 2.2.2. Hover
pause is a convenience, not that mechanism.

## Parameters

```css
:root {
  /* Example time for one full loop at the content's natural width. Longer = slower.
     Measure reading and distraction with the actual content and audience. */
  --marquee-duration: 18s;

  /* Gap between each item in the marquee track. */
  --marquee-gap: 4rem;

  /* Direction: normal = left to right; reverse = right to left. */
  --marquee-direction: normal;

  /* Pause on hover: enables on interactive marquees, disables on ambient ones. */
  --marquee-play-state: running;
}
```

## Implementation

The technique: duplicate the content so the seam is never visible. The duplicate starts
immediately after the first copy; when the first copy has scrolled fully off-screen, the
duplicate has arrived at the start position and the loop is seamless.

```html
<button type="button" class="marquee-toggle" aria-pressed="false">
  Pause motion
</button>
<div class="marquee">
  <div class="marquee-track">
    <ul class="marquee-content" aria-label="Client roster">
      <li>Acme</li>
      <li>Globex</li>
      <li>Initech</li>
      <!-- … items … -->
    </ul>
    <!-- Duplicate for seamless loop. Aria-hidden on the duplicate. -->
    <ul class="marquee-content" aria-hidden="true">
      <li>Acme</li>
      <li>Globex</li>
      <li>Initech</li>
    </ul>
  </div>
</div>
```

```css
.marquee {
  overflow: hidden;
  white-space: nowrap;
}

.marquee-track {
  display: flex;
  width: max-content;
  animation: marquee-scroll var(--marquee-duration) linear infinite;
  animation-direction: var(--marquee-direction);
  animation-play-state: var(--marquee-play-state);
}

/* Hover pause is optional convenience; the persistent button is the control. */
.marquee:hover .marquee-track {
  animation-play-state: paused;
}

.marquee.is-paused .marquee-track {
  animation-play-state: paused;
}

.marquee-content {
  display: flex;
  gap: var(--marquee-gap);
  list-style: none;
  padding: 0;
  margin: 0;
  /* Second copy immediately follows the first — no gap between copies needed
     because the animation moves the entire track exactly one copy-width. */
  padding-inline-end: var(--marquee-gap);
}

@keyframes marquee-scroll {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
  /* -50%: moves the track by exactly one copy's width, bringing the duplicate
     to the start position. The loop is seamless. */
}
```

```js
const marquee = document.querySelector('.marquee');
const toggle = document.querySelector('.marquee-toggle');

toggle?.addEventListener('click', () => {
  const paused = marquee?.classList.toggle('is-paused') ?? false;
  toggle.setAttribute('aria-pressed', String(paused));
  toggle.textContent = paused ? 'Resume motion' : 'Pause motion';
});
```

## React

```tsx
import { useRef } from 'react';
import { motion } from 'framer-motion';

function Marquee({
  items,
  duration = 18,
  direction = 1, // 1 = left-to-right, -1 = right-to-left
  pauseOnHover = false,
}: {
  items: string[];
  duration?: number;
  direction?: 1 | -1;
  pauseOnHover?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  // Duplicate items for seamless loop.
  const allItems = [...items, ...items];

  return (
    <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
      <motion.div
        ref={trackRef}
        style={{ display: 'flex', width: 'max-content' }}
        animate={{ x: direction === 1 ? [0, '-50%'] : ['-50%', 0] }}
        transition={{
          duration,
          ease: 'linear',
          repeat: Infinity,
          repeatType: 'loop',
        }}
        whileHover={pauseOnHover ? { animationPlayState: 'paused' } : undefined}
      >
        {allItems.map((item, i) => (
          <span
            key={i}
            style={{ paddingInlineEnd: 'var(--marquee-gap, 4rem)' }}
            aria-hidden={i >= items.length ? 'true' : undefined}
          >
            {item}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
```

The React excerpt demonstrates the loop mechanics only. If it auto-runs for more than
five seconds alongside other content, expose persistent pause/stop state in the rendered
UI rather than relying on `whileHover`.

## Reduced-motion variant

In reduced-motion context, the marquee must stop. A moving marquee for users with
vestibular disorders can trigger nausea even at low velocity. The content is shown as a
static, wrapped list — the information is preserved, the motion is removed.

```css
@media (prefers-reduced-motion: reduce) {
  .marquee-track {
    animation: none;
    width: auto;
    flex-wrap: wrap;
  }

  /* Hide the duplicate copy — only needed for the loop illusion. */
  .marquee-content:last-child {
    display: none;
  }

  .marquee {
    overflow: visible;
    white-space: normal;
  }
}
```

## Performance note

`transform: translateX()` avoids layout changes and is usually cheaper to animate than
layout properties, but it does not guarantee GPU execution, 60fps, or zero main-thread
work. Profile the duplicated content at its real dimensions.

The `animation-duration` drives perceived velocity, not the actual pixel distance per
frame. As items are added to the marquee, the content becomes wider; the same duration
now produces a faster apparent motion (more pixels per second). Recalculate the duration
when the content changes: `duration = contentWidth / targetPixelsPerSecond`. A JavaScript
observer on the marquee-content can handle this dynamically.

Do not use `marquee-gap` so large that the duplicate's arrival is visible before the
original departs — there should be no visible gap between copies at the seam. The
`padding-inline-end` on `.marquee-content` absorbs this gap, but verify on your actual
content widths.
