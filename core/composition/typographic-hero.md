# Typographic hero

A typographic hero fills the viewport with display type — no photography, no illustration.
The heading is the image. The face, the size, the weight, and the leading do the work that
a photograph would otherwise do. When executed with purpose, a typographic hero reads as
more confident than a stock photo: the brand commits to a statement rather than a mood.

`expressive.md` names this directly: "Display type at 90–200px (or equivalent
viewport-relative value) acts as the hero image: it fills the viewport, it sets the tone,
it contains the entire conceptual gesture in one glance."

## When it earns its place / When it does not

Condition: the headline is a genuine claim — something is being asserted, not merely
labelled. The words are strong enough to occupy the viewport alone without the viewer
wondering what they are looking at. The concept has no photographic identity, or the brief
deliberately rejects photography to let the type carry the register (agency portfolio,
product launch microsite, typographic brand campaign).

Condition against: when the brand's primary asset is photographic and the concept depends
on an image to make its point. When the headline is a category label rather than a
position ("Software for Teams" fills the viewport with almost no information). When the
register is quiet or tool-oriented — `expressive.md` is explicit that showpiece technique
in a dashboard context loses on Usability (30% of the Awwwards score) before the first
scroll.

`core/theory/layout.md` — visual hierarchy rule 1: "The single most reliable hierarchy
signal [is] size." A typographic hero applies that rule at maximum scale. If the type does
not contain the hierarchy signal the page needs, scaling it will not save it.

## Parameters

```css
:root {
  /* The clamp floor, preferred, and ceiling for the hero heading.
     Floor: readable on 375px without overflow.
     Preferred: scales continuously with viewport width.
     Ceiling: holds composition at 1280px and above.
     Tuned values per brief — these are starting points, not measurements. */
  --hero-font-size: clamp(3rem, 12vw, 9rem);

  /* Letter-spacing at display scale.
     Latin display type: -0.05em to -0.08em reads as intentional.
     Hangul display type: -0.03em to 0em — block structure resists compression.
     expressive.md § Korean market: "compressing below -0.05em causes stroke collision." */
  --hero-letter-spacing: -0.04em;

  /* Line-height at display scale. Tighter than body — 0.9 to 1.05 for large type.
     Body line-height at display scale produces rivers of air that read as broken. */
  --hero-line-height: 0.95;

  /* Vertical position of the hero block within the viewport.
     Center is the Z-pattern landing zone. Off-center (40/60) introduces tension.
     core/theory/layout.md: Z-pattern — the diagonal lands centre-of-screen. */
  --hero-block-padding-top: 20vh;
  --hero-block-padding-bottom: 12vh;
}
```

## Implementation

```html
<!-- The wrapping element defines the viewport height and the reading zone.
     The heading itself is the only primary element in the hero.
     A short subhead or CTA may follow at a deliberately smaller scale — not competing. -->
<section class="typo-hero">
  <h1 class="typo-hero__heading">The infrastructure<br>that disappears</h1>
  <!-- Optional: one supporting line at body scale or slightly above. Not a second heading. -->
  <p class="typo-hero__sub">Available in early access.</p>
</section>
```

```css
.typo-hero {
  display: flex;
  flex-direction: column;
  justify-content: flex-end; /* anchors to lower third — weighted, not floating */
  min-height: 100svh;
  padding-top: var(--hero-block-padding-top);
  padding-bottom: var(--hero-block-padding-bottom);
  padding-inline: var(--space-page-margin, 5vw);
  overflow: hidden; /* prevent display type from widowing into scrollable overflow */
}

.typo-hero__heading {
  font-size: var(--hero-font-size);
  letter-spacing: var(--hero-letter-spacing);
  line-height: var(--hero-line-height);
  font-weight: var(--weight-display, 700);
  font-family: var(--font-display);
  /* max-width prevents runon at ultra-wide viewports.
     80ch is too wide for display type; 18ch–22ch is the readable range. */
  max-width: 20ch;
  text-wrap: balance; /* Chrome 114+, Safari 17.5+ — improves orphan control */
}

.typo-hero__sub {
  margin-top: var(--space-6, 1.5rem);
  font-size: var(--text-sm, 0.875rem);
  letter-spacing: 0.02em;
  text-transform: uppercase;
  opacity: 0.6;
}
```

## Responsive behavior

**375px (mobile):** The `clamp()` floor value governs. At `clamp(3rem, 12vw, 9rem)` the
375px computation is `max(3rem, 12 * 3.75px) = max(48px, 45px) = 48px` — the floor holds.
The heading wraps naturally; do not force it to one line with `white-space: nowrap`. At
this width the hero still commands the full viewport height; reduce `--hero-block-padding-top`
from 20vh to 12vh so the type does not start below mid-screen.

```css
@media (max-width: 600px) {
  .typo-hero {
    --hero-block-padding-top: 12vh;
    --hero-block-padding-bottom: 8vh;
  }

  .typo-hero__heading {
    max-width: 100%; /* full width on narrow screens */
  }
}
```

**768px (tablet):** The preferred value `12vw` computes to roughly 92px — approaching the
ceiling. The composition reads as a full-bleed typographic statement at this width.
Padding-inline may increase from 5vw to 6vw to prevent the type from touching the edges.

**1280px (desktop):** The ceiling value `9rem` (144px at default root size) governs. The
type no longer grows; the composition is fixed. At this width the `max-width: 20ch`
constraint may trim the heading to a narrower column, leaving deliberate open space to the
right — not dead space, but negative space as structure. `core/theory/layout.md`:
"space over borders wherever density allows."

## Do not combine with

**split-text-entrance.md** in the same viewport — both are making the heading the event;
combining them produces a heading that both controls the composition and performs on entry,
which reads as the recipe list, not the concept.

**A marquee immediately below in the same viewport** — two auto-moving text elements in one
screen competes for the eye's entry point before the heading has been read.

**A photographic background** — a typographic hero whose face is obscured by a background
image is neither a typographic hero nor a photographic hero; it is a compromise that
satisfies neither condition.
