# Editorial index labels (01, 02, 03)

> Candidate hypothesis only. Revalidate its condition, values, and responsive transition
> against the current composition contract; do not transfer this page recipe unchanged.

A large ordinal number — set at display scale, typically 10–15% opacity — anchors each
section to its position in a sequence. The number reads as background field before it
reads as a numeral; it reinforces order and creates depth without competing with the
section's primary content.

`expressive.md` on this technique: "The large number (set at display scale, often 10–15%
opacity as a background element) reinforces the ordered reading without becoming the
dominant visual."

## When it earns its place / When it does not

Condition: the content has a genuine sequence — steps in a process, chapters in a
narrative, items in an ordered argument. The numbering must correspond to a sequence the
user will perceive as sequential; the label confirms what the user already suspects. A
case study with four distinct phases, a feature walkthrough with a natural order, a
methodology page with numbered stages — each earns the label because the sequence is real.

`core/theory/layout.md` — von Restorff and the one memorable thing: the large number
differentiates each section from the others through the isolation effect. Used across all
sections, each number is equally differentiated, which means none of them is — the effect
cancels itself. Applied to a genuine sequence, the number adds the memory hook von Restorff
describes; applied arbitrarily, it is visual noise.

Condition against: fake sequences — content enumerated to look ordered when the items have
no natural sequence. A features section with three independent capabilities numbered 01–03
implies the user should attend to them in order; if they should not, the numbering lied.
`expressive.md`: "Numerical labels that carry no sequential meaning are decoration, and
decoration at display scale is noise." Also: navigation lists, card grids, or any context
where the user is scanning rather than reading in order.

This specific tell — large low-opacity ordinals on unordered sections — is a documented
signature of generated pages: giant faint numerals that imply sequence where none exists. The counter-condition is this recipe: ordinals on
sections whose content has a genuine sequence (methodology phases, walkthrough steps,
ordered chapters). When the label earns its place the ordinal confirms what the user
already suspects; when it does not, it is decoration at display scale and should be removed.
The SLOP-TRIPLE-CARD rule fires on the underlying grid structure that often accompanies
unearned numbering; adding ordinals to a triple-card grid resolves neither finding.

## Parameters

```css
:root {
  /* Font size for the index number.
     Large enough to read as a background field, not a foreground label.
     Typical range: clamp(5rem, 15vw, 12rem). */
  --index-font-size: clamp(5rem, 15vw, 12rem);

  /* Opacity: low enough to read as depth, not text.
     10–15% is the operative range; above 20% the number competes with the heading. */
  --index-opacity: 0.1;

  /* Position within the section grid.
     Typically anchored to the left or top-left, offset behind the heading. */
  --index-offset-top: -0.15em; /* nudge behind the heading's cap-height */
  --index-offset-left: -0.05em; /* slight bleed into the margin */

  /* Font weight.
     Heavy weight at low opacity reads as texture; light weight at low opacity disappears.
     700 or 800 is the operative range. */
  --index-font-weight: 700;
}
```

## Implementation

```html
<!-- Each section carries its own index number.
     aria-hidden: the number is decorative; screen readers skip it.
     The section heading carries the actual label for assistive technology. -->
<section class="indexed-section" data-index="01">
  <span class="indexed-section__number" aria-hidden="true">01</span>
  <div class="indexed-section__content">
    <h2 class="indexed-section__heading">Discovery</h2>
    <p>The phase where assumptions are tested against the real problem.</p>
  </div>
</section>

<section class="indexed-section" data-index="02">
  <span class="indexed-section__number" aria-hidden="true">02</span>
  <div class="indexed-section__content">
    <h2 class="indexed-section__heading">Definition</h2>
    <p>Where the real problem is named, with evidence.</p>
  </div>
</section>
```

```css
.indexed-section {
  position: relative;
  padding-block: var(--space-section, 6rem);
  padding-inline: var(--space-page-margin, 5vw);
  /* Overflow hidden: the large number must not create horizontal scroll */
  overflow: hidden;
}

.indexed-section__number {
  position: absolute;
  top: var(--index-offset-top);
  left: var(--index-offset-left);
  font-size: var(--index-font-size);
  font-weight: var(--index-font-weight);
  font-family: var(--font-display);
  line-height: 1;
  letter-spacing: -0.04em;
  opacity: var(--index-opacity);
  /* Prevent the number from intercepting pointer events on content above */
  pointer-events: none;
  user-select: none;
  /* z-index: below the content, above the background */
  z-index: 0;
}

.indexed-section__content {
  position: relative;
  z-index: 1; /* above the index number */
  /* The content column stays within the readable measure — max 72ch for body,
     narrower for the heading. */
  max-width: 60ch;
}

.indexed-section__heading {
  font-size: var(--text-2xl, 2rem);
  font-weight: var(--weight-heading, 600);
  margin-bottom: var(--space-4, 1rem);
}
```

## Responsive behavior

**375px (mobile):** The large number at `clamp(5rem, 15vw, 12rem)` computes to
`max(5rem, 56px) = 80px` at 375px — small enough to not dominate the viewport. The
absolute-positioned number may overlap the heading at this size; verify the heading remains
legible. If contrast is compromised, increase the `--index-offset-top` negative value to
push the number further behind or reduce `--index-opacity` to 0.06 at narrow viewports.

```css
@media (max-width: 600px) {
  .indexed-section {
    --index-opacity: 0.07; /* reduce further at narrow viewports to preserve legibility */
    padding-block: var(--space-section-mobile, 3rem);
  }
}
```

**768px (tablet):** The number at `15vw` computes to ~115px. The absolute positioning works
well; the heading and body copy are clearly in the foreground. No structural change needed;
adjust offset if the number's baseline aligns uncomfortably with the heading's cap height.

**1280px (desktop):** The ceiling `12rem` (192px at 16px root) governs. At this size the
number reads as a large background field. The content column at `max-width: 60ch` leaves
significant space on the right at full viewport — the index number fills that zone
naturally. The composition reads as editorial depth, not as an oversized ordinal.

## Do not combine with

**sidebar-margin-annotation.md** in the same section — both create competing secondary
reading tracks in the peripheral field (left side for the index, right margin for
annotations). The eye cannot establish which secondary track is the intended one.

**section-inversion.md** per section — when every section inverts, the index number's
opacity calibration breaks across light and dark surfaces. Calibrate separately for each
surface or avoid the combination.

**editorial-index-labels with fake sequences** — this bears repeating because the temptation
is real: do not apply index labels to a grid of independent features to make the page look
more structured. `expressive.md` names this directly as decoration. The slop linter's
`SLOP-TRIPLE-CARD` rule fires on the underlying grid; adding index numbers to that grid
does not resolve the finding.
