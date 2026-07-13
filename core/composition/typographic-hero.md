# Typographic hero

A typographic hero makes a short, concept-bearing line the primary visual event. It is an
exceptional composition, not a large-heading preset.
Use it with the register conditions in `core/theory/expressive.md`.

## When it earns its place / When it does not

Use it when the actual headline is short enough to survive both target containers, the
chosen face and weight visibly carry the concept, and the product can keep supporting
context and the primary CTA usable. A justified huge Hangul case might use a compact
two-to-five-word declaration whose syllable-block rhythm is itself the identity: the proof
shows intentional wrapping, clean counters, loaded intended weights, and an immediate CTA
at 1280x900 and 390x844.

Do not use it when the headline is long, generic, or doing the work of several paragraphs.
A giant heavy Korean sentence that wraps into a dense wall, clips at mobile, falls back to
another face, or pushes all secondary hierarchy and action away has failed even if it looks
dramatic in one screenshot.

## Parameters

The passing actual-copy specimen must supply these required custom properties:

```text
--type-proof-hero-measure
--type-proof-hero-size
--type-proof-hero-weight
--type-proof-hero-leading
--type-proof-hero-tracking
--type-proof-hero-gap
--type-proof-hero-padding-block
```

There are no recipe defaults. `.omd/type-proof.md` records the values produced by the
specimen for the selected copy and container. CSS `clamp()`, container queries, media
queries, or discrete type steps are all valid when the two rendered targets justify them.
Letter spacing follows visible glyph anatomy; there is no universal negative limit.

## Implementation

Use semantic heading order and let content determine block height. Keep overflow visible
unless a separate, evidenced visual effect owns the crop; never use clipping to hide failed
wrapping.

```css
.hero {
  display: grid;
  align-content: center;
  gap: var(--type-proof-hero-gap);
  padding-block: var(--type-proof-hero-padding-block);
}

.hero__title {
  max-inline-size: var(--type-proof-hero-measure);
  margin: 0;
  font-size: var(--type-proof-hero-size);
  font-weight: var(--type-proof-hero-weight);
  line-height: var(--type-proof-hero-leading);
  letter-spacing: var(--type-proof-hero-tracking);
  text-wrap: balance;
  overflow: visible;
}
```

The secondary line and primary action remain in the same reading sequence. If display type
makes either unavailable without scrolling in the target task, reduce or restructure it.

## Proof requirements

Before structure, render the real headline, secondary copy, CTA, mixed Korean/Latin/numerals,
and fallback state at 1280x900 and 390x844. Record requested and computed family/weight,
FontFace loading status, line count, wrap points, clipping, orphan behavior, and rejected
alternatives in `.omd/type-proof.md`.

After selecting the production structure, repeat the proof in the real hero container.
Copy, face/file, weight/axis, or container-width changes invalidate the earlier proof.
Browser evidence does not identify the physical font used for each glyph.

## Responsive behavior

The required evidence is the actual-copy specimen at 390x844 and 1280x900, not a fixed
scaling formula. At each viewport record the selected container, line count, wrap points,
clipping, fallback behavior, and the location of secondary copy and CTA. Tablet behavior
may interpolate or use a discrete step, but it must preserve the same reading order.

## Do not combine with

Avoid another dominant text event in the same opening view, such as an automatic marquee or
equally forceful split-text entrance. One technique owns the memorable moment. Motion, if
used, follows the motion specification and preserves the proof-clean final state.

## Linter notes

There is no safe huge-type threshold. Moderate type can be expressive; very large type can
be correct. Deterministic checks may catch clipping or accessibility defects, while the
typography proof judges concept, glyphs, loading, wrapping, and hierarchy.
