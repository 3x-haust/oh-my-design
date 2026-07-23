# Craft — decision material

These are the decisions that separate work that looks designed from work that looks
generated. None of them appear in textbooks as principles; they are accumulated from
practitioners watching what fails and adjusting. Every entry is a condition → choice →
reason triple, verified against real practice.

---

## Shadows: layered and coloured, never single-heavy

A single dense shadow — `box-shadow: 0 4px 20px rgba(0,0,0,0.4)` — reads as generated.
It is the shadow that appears when someone types "add a box shadow" and accepts the
default. It looks heavy, uniform, and unnatural because nothing in the physical world casts
light that way.

Natural shadow results from at least two light interactions: the ambient light that fills
a space with soft diffuse shadow, and the direct light that casts a sharp shadow close
beneath the object. Adam Wathan and Steve Schoger (*Refactoring UI*, 2018) document this
as the two-shadow system: a small, tight shadow directly beneath the element (sharp, low
opacity, small blur radius) and a larger, softer shadow extending further (large blur,
very low opacity). The two together read as physically plausible in a way a single shadow
cannot.

The values: a card at moderate elevation might use
`box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08)`. The first shadow
places the card; the second lifts it. Combined opacity stays low — the visual weight
is distributed across both.

**Coloured shadows** extend the system further. A shadow cast beneath a blue button does
not need to be grey — it can be a dark desaturated blue. This is how physical coloured
objects cast coloured shadows (ambient lighting takes on the hue of the emitting surface).
A coloured shadow reads as considered rather than default, and it ties the shadow to the
element's own colour system, making the depth feel coherent.

Condition → choice → reason: when adding elevation, compose two shadows at low opacity
rather than one at high opacity. When the element has a distinct brand colour, tint the
shadow toward that hue at 20–30% saturation.

---

## Borders vs background contrast: the separation decision

Borders are not the only way to separate things. They are the heaviest way, and they add
the most noise.

Three alternatives work better in most situations:

**Background contrast**: adjacent elements with slightly different background colours read
as separate without a line between them. A sidebar at `#F7F7F7` and a content area at
`#FFFFFF` need no border — the contrast between them creates the separation. This is the
technique behind most modern sidebars, navigation panels, and card layouts where the
"border" is actually a 5% luminance difference. Wathan and Schoger (*Refactoring UI*)
name this explicitly: "Giving adjacent elements slightly different background colors is
usually all you need to create distinction between them."

**Space as separator**: if two elements have enough gap between them, the negative space
reads as the boundary. A group of form fields at 24px internal gap and 48px between
sections needs no horizontal rule — the spacing hierarchy is the divider.

**Subtle box-shadow as outline**: `box-shadow: 0 0 0 1px rgba(0,0,0,0.06)` creates a
visible border-weight outline without the hard, opaque line of `border: 1px solid`. At low
opacity, this reads as surface definition rather than containment — appropriate for cards
on white backgrounds where a hard border would create visual noise.

The rule: use a border when none of these three alternatives produce sufficient separation.
In practice, this means borders are reserved for form inputs (where the border communicates
interactivity, not just separation), data tables (where the row-column structure requires
explicit lines for alignment), and code blocks.

---

## Text hierarchy: opacity over grey

When designing on a coloured background — a dark surface, a brand-coloured header, a card
with a coloured fill — secondary text is often set in a lighter grey to signal its lower
importance. This fails on coloured backgrounds: a fixed grey hex sits at the wrong
luminance relative to the background, either too light (insufficient contrast) or too dark
(indistinguishable from primary text).

The correct technique is opacity on white (or the background-adjacent colour), not a
separate grey value. Primary text: white at 87–90% opacity. Secondary text: white at
55–65% opacity. Tertiary / disabled: white at 35–40% opacity. These values come from
Material Design's dark theme specification and have been independently confirmed as
the correct perceptual steps.

The reason opacity outperforms fixed hex on coloured surfaces: opacity lets the background
colour bleed through. The secondary text picks up the surface hue, which makes it feel
native to the surface rather than pasted on. A fixed grey on a dark blue card looks like
a grey text on a blue background; an 60% opacity white on a dark blue card looks like
dim text that belongs on that card.

On light backgrounds, the same logic applies in reverse: use black (or the text colour)
at different opacity levels for hierarchy, rather than separate grey tokens. The cascade
reads as a single family at different weights of presence, not as multiple colours
competing.

---

## Optical alignment: why mathematical centre is wrong

Centering by coordinate is not the same as centering by perception. The eye processes
visual weight, not coordinates; a perfectly centred element that carries more visual weight
at the top will appear to sit too low.

**The most common violation**: icons inside circular or square containers. A triangle
icon centred by coordinate at the geometric centre of its container appears to float too
high, because the triangle carries visual mass at its base and open space at its peak.
Correct optical alignment moves the icon 1–2px downward from coordinate centre.

**The second-most common violation**: icons beside text. An icon at 16px placed alongside
16px text is not optically aligned — the icon's visual centre and the text's cap height
are at different heights. The correct alignment is not to align the icon's bounding box
midpoint to the text's bounding box midpoint; it is to align the icon's optical centre
to the text's cap height. This often requires the icon to be 1–2px lower than a strict
middle-align would place it. Rauno Freiberg's web interface guidelines (interfaces.rauno.me)
note that when text and icons sit side by side, adjustment of weight, size, or position is
required so they don't clash visually.

**The third violation**: padding on buttons. A button with 16px padding top and bottom
appears to sit low if the label is a capital-heavy word, because the ascenders occupy
optical space that descenders do not. Adding 1px of extra top padding corrects it
optically while maintaining the stated 16px value in both directions.

Condition → choice → reason: when an element "looks off" despite correct coordinate
values, the issue is optical weight distribution. Adjust by eye in 1px increments until
the perception matches the intent, then document the deviation.

---

## Optical balance vs mathematical symmetry

A symmetrical layout is not always a balanced one. Mathematical symmetry places elements
at equal distances from a central axis; optical balance places them at positions where
they carry equal visual weight.

The most common asymmetry that reads as balance: a heavy text block on one side paired
with a large open area on the other, because white space carries visual weight. Müller-
Brockmann's grid work (and its later formalisation in Josef Albers' compositional studies)
establishes that a large empty area "pushes back" against a dense content block — the
result is tension and balance, not imbalance.

The practical consequence: a design that looks "too light on the right" may not need more
content on the right. It may need the existing content moved slightly left, or a single
visual anchor (a horizontal rule, a colour block, a differently weighted element) on the
right that resolves the imbalance without filling the space.

Symmetry is a statement. Perfect bilateral symmetry says "this is formal and restrained."
Near-symmetry with deliberate asymmetric elements says "this is considered." Accidental
asymmetry — elements placed symmetrically by coordinate that read as unbalanced because
of optical weight — says "nobody checked."

---

## Hover states: compound changes over brightness alone

Changing brightness on hover — lighter on hover of a dark element, darker on hover of a
light one — is the default hover behavior and produces the least interesting result.
It communicates "interactive" but nothing else. Compound hover changes communicate more.

A hover state can change multiple properties simultaneously to produce a richer signal:

- **Background + shadow**: the background lightens slightly and a subtle shadow appears,
  suggesting the element is rising off the surface to meet the cursor. This communicates
  elevation change rather than just colour change.

- **Colour + underline reveal**: for text links, a colour shift combined with an underline
  appearing on hover communicates "this is a link" more reliably than either signal alone.
  The underline is the semantic signal; the colour shift is the visual confirmation.

- **Scale + shadow**: a slight scale increase (`transform: scale(1.02)`) on a card combined
  with a shadow increase communicates physical lift — the card rises. Scale alone without
  shadow reads as zoom; shadow alone without scale reads as flat highlighting.

Rauno Freiberg's guidelines specify that font weight should remain consistent on hover
or selected states to prevent layout shifts — a `font-weight` change on hover causes
surrounding text to reflow, which is distracting even at the character level. Use `bold`
for initial state or accept that the hover state cannot add weight.

The constraint from `prefers-reduced-motion`: all hover transitions must be instant (or
very short) when `prefers-reduced-motion: reduce` is active. A compound hover transition
that takes 200ms looks fine; the same 200ms transition replaying on every link in a dense
page layout is distracting. Scale transformations in particular should be removed or
reduced to zero duration under `prefers-reduced-motion`.

---

## 60fps-safe properties

Not all CSS properties are created equal for animation. The browser rendering pipeline
processes properties in three stages: layout (positioning, sizing), paint (colour,
background, shadow), and composite (transform, opacity). Only composite-stage properties
can be offloaded to the GPU and animated without touching the layout or paint pipeline.

**Safe for animation** (composite only — 60fps on all reasonable hardware):
- `transform: translate()`, `rotate()`, `scale()`
- `opacity`

**Unsafe for animation** (trigger layout or paint — cause jank on mid-range devices):
- `width`, `height`, `top`, `left`, `bottom`, `right`
- `padding`, `margin`
- `border-width`
- `background-color` (triggers paint, not layout — less severe but not free)
- `box-shadow` (triggers paint on every frame)

The practical constraint for design: if the visual effect requires animating a property
not on the safe list, re-examine whether the effect can be achieved through transform and
opacity instead. A "growing border" on hover can be achieved with a `box-shadow` inset of
0 opacity transitioning to opacity 1 — or better, with a `transform: scaleX()` on a
pseudo-element. A "sliding in from the side" panel should use `transform: translateX()`,
not `left: -100%` to `left: 0`. The design constraints are the engineering constraints.

---

## The "design is boring" checklist

When a design feels flat or unresolved and you do not know what to change, this checklist
provides the diagnostic. Each item identifies a specific deficiency and its correction.

**1. Contrast scale is too narrow.** All text is at similar sizes. The solution is to make
the most important element dramatically larger — not 20% larger, but 2–3× larger. Dramatic
scale contrast reads as intentional hierarchy; mild scale difference reads as inconsistency.

**2. Everything is centred.** Centring is emphasis. When everything is centred, emphasis
is absent. Left-align body content, reserve centring for single-line headlines and
isolated call-out elements.

**3. The colour palette has no accent.** All colours are muted or neutral — there is
nothing with visual energy. Add one high-saturation or high-contrast element in the accent
role, even briefly, and the composition becomes legible.

**4. Alignment axes are too consistent.** When every element aligns on the same left edge
and the same grid column, the design reads as orderly but static. One intentional
misalignment — a large decorative element that bleeds past the grid, a pull quote indented
from the main measure — creates movement. But only one: two misalignments become chaos.

**5. Weight ladder is too flat.** Text throughout the design uses the same weight. The
hierarchy exists only through size. Add weight contrast: the primary content at
`font-weight: 600`, secondary at 400, tertiary at 400 and reduced opacity. The weight
ladder is the cheapest hierarchy tool available.

**6. There is no breathing room.** Padding and margins are too conservative. The
conventional instinct is to pack content because packed content "shows more value." Empty
space reads as confidence; packed space reads as uncertainty. Double the padding on the
most important element and observe whether it reads as more important, not less.

**7. No element is unexpected.** Everything is where the user expects it to be, at the
scale they expect it. Introduce one element that is larger, different, or placed
differently than its role would suggest. This is the Von Restorff mechanism: the
unexpected element is what gets remembered.

---

## Smooth in-page navigation

An in-page anchor — a "jump to section" link, a "↓ see the nine steps" affordance, a table-of-contents entry — that hard-jumps the viewport to its target is a polish gap that separates generated work from designed work. The instantaneous jump gives the user no spatial continuity: they do not see that they moved down the page, so they lose their place and the relationship between where they were and where they landed. The award-tier version scrolls the viewport there smoothly, so the motion itself is the wayfinding — the user feels the distance travelled.

The technique is one line: `scroll-behavior: smooth` on the scroll container (usually `html`), or, for control over duration and easing, `element.scrollIntoView({ behavior: 'smooth', block: 'start' })` on the anchor's click. The smooth scroll must resolve quickly; a long-distance smooth scroll that takes seconds is worse than a jump, because it holds the user hostage to the animation past the point where it informs.

Condition → choice → reason: any in-page anchor or "scroll to the next section" affordance the design owns scrolls smoothly to its target rather than jumping. Under `prefers-reduced-motion: reduce` it reverts to an instant jump — the smooth motion is the enhancement and the destination is reached either way. Never override cross-page navigation or the browser's back/forward; this is only for same-page anchors.

---

## Human calibration

Every rule above is grounded in a named practitioner source, but the *verdict* on whether a finished render actually reads as designed is currently made by `omd-eye` — a blind reviewer, but still a language model judging a model's output. `theory/voice.md` closes this loop on the prose side: its "Calibration evidence" section measured a fully human-authored essay against a pipeline version on the same metrics and let the gaps rewrite the rules. Visual craft has no equivalent yet. That asymmetry is the one place "human-like" is still an LLM's opinion rather than a measurement.

Condition → choice → reason: keep visual craft honest by calibrating it against real people on the same cadence, not by trusting the model's self-report.

**The protocol** (a maintenance routine on the repository, like `core/rules/slop-intake.md`, not a step in a user's run):

1. **Sample** — a fixed, versioned set of OMD renders across registers (quiet/confident/showpiece) and surface types, plus the human-made references they were built toward.
2. **Rate** — real human designers and target users rank or score them on named dimensions (hierarchy clarity, colour commitment, craft finish, "reads as designed vs generated"), blind to which are OMD's, using an A/B or forced-choice format so the signal is a preference, not a number pulled from the air.
3. **Compare** — set the human verdicts beside `omd-eye`'s own verdicts on the same renders. The **divergences** — where the model eye and real designers disagree — are the evidence, exactly as the measured prose gaps were in `voice.md`.
4. **Feed back** — each divergence becomes a candidate change to a craft entry, a slop rule (through the `slop-intake.md` evidence bar), or an eye instruction, carried in a PR with the data. A dimension where the eye already matches human preference is left alone.

**Data format**: real human ratings are recorded the way explicit user taste already is — appended to `.omd/taste/preferences.jsonl` (`actor: 'user'`, with the subject, verbatim evidence, and the chosen render), kept strictly separate from the agent's own choices (Coach never reads `.omd/taste/`). A calibration run is a batch of such records tagged with the sample version.

**Honest limitation**: no calibration dataset has been collected yet — this section defines the methodology and the standing loop, not a finished result. Until a dataset exists, `omd-eye`'s verdict is explicitly a proxy for human taste, not ground truth, and any claim that a render "reads as human-made" is the model's estimate. The prose side (`voice.md`) is the worked example of what this produces once the data is in; visual craft is expected to reach the same standard on the same quarterly cadence.

---

## Sources

- Wathan & Schoger, *Refactoring UI* (2018 / refactoringui.com) — two-shadow system,
  borders vs background contrast, colour hierarchy on coloured backgrounds, two-weight
  system for text hierarchy
- Rauno Freiberg, Web Interface Guidelines (interfaces.rauno.me) — optical alignment of
  icons and text, hover weight consistency, animation duration ceiling, tabular figures
- Material Design 3 (2023) — white-opacity text hierarchy on dark surfaces (87%/60%/38%),
  GPU-composited animation properties
- Müller-Brockmann, *Grid Systems in Graphic Design* (1981) — optical balance and the
  visual weight of negative space
- Albers, *Interaction of Color* (1963) — visual weight, optical perception of spatial
  relationships, the inadequacy of coordinate-based alignment
- von Restorff, "Über die Wirkung von Bereichsbildungen im Spurenfeld" (1933) — the
  isolation effect and why one unexpected element produces memory while many produce none
- Google Chrome Developers, "Stick to Compositor-Only Properties and Manage Layer Count"
  (developers.google.com) — composite-only animation properties, paint and layout costs
