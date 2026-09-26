# Colour — decision material

Colour is a system of roles, not a mood-board verdict. Choose it from the work the surface must
support: brand recognition, hierarchy, interaction, status, data distinction, and readable content.
The user owns explicit brand preferences. Research and references may reveal conventions, but they
do not overrule supplied brand assets or turn a category stereotype into a requirement.

For every important choice, record: **condition → colour role → evidence → rendered check**. Name
the role before choosing a value: canvas, surface, text, border, action, focus, selection, success,
warning, error, or data series. A swatch without a role is not yet a design decision.

---

## Domain conventions and why they exist

Category palettes can be useful reference evidence because repeated exposure may create user
expectations. They are not laws and do not prove psychological effects. Do not infer trust from
blue, health from green, appetite from red, luxury from black, or technical credibility from a
dark theme. Industry, age, and country labels are too coarse to authorize those conclusions.

Use domain evidence in this order:

1. Apply explicit user direction and verified brand tokens.
2. Inspect real, current products that serve the same task and audience. Record the colour roles,
   not just their hex values.
3. Identify the convention's functional purpose: recognition, warning, wayfinding, dense-work
   comfort, data distinction, or something else.
4. Keep, adapt, or reject it based on the destination's task and concept. Record the reason when
   the choice carries material risk.
5. Test the choice in the complete rendered surface and in its real interactive states.

A developer tool may be light, dark, or themeable. A healthcare product may use red safely when
the role is unmistakable. A premium brand may be bright. Judge whether the system works for this
brand and task, not whether it resembles an industry costume.

---

## Harmony schemes: when to use each

Hue relationships are compositional tools, not meanings.

**Complementary** pairs create strong hue separation. Use them when two roles need clear visual
distinction, then check text contrast, colour-vision simulations, and the rendered area of each
colour. Large adjacent saturated fields can compete, but that is a rendered judgment rather than
a universal ban.

**Analogous** hues can make a palette feel related. They often need stronger lightness, shape, or
label differences when they encode separate states because hue proximity can weaken distinction.

**Triadic or multi-hue** palettes can support several categories or a deliberately expressive
composition. They do not require a fixed dominant/secondary/accent hierarchy; the hierarchy must
follow the content and semantic roles.

Start with the fewest hues that express the required roles. Add a hue only when it improves a
specific distinction or the authorized brand expression.

---

## The 60-30-10 distribution

60-30-10 is a composition heuristic, not a reading law or an acceptance threshold. It can prompt a
useful question on broad marketing compositions: is there a dominant field, supporting material,
and a restrained accent? The exact percentages are neither measurable proof of hierarchy nor a
substitute for reviewing the page.

It is not a universal product-UI ratio. Product colour follows semantic frequency: an error colour
appears when there is an error, selection colour follows selected objects, and surfaces follow the
information architecture. Marketing colour follows the concept, brand, imagery, and content; a
split layout, immersive photograph, or monochrome identity may not resemble 60-30-10 at all.

Evaluate the rendered composition at normal size and at a squint. Primary content and actions
should rank correctly, repeated accents should not create false importance, and critical states
must remain distinct. If the hierarchy fails, adjust area, contrast, placement, typography, or
spacing as appropriate rather than forcing a percentage.

---

## Saturation and register

Saturation changes prominence, but its social meaning depends on context. High saturation is not
inherently young, playful, anxious, or inappropriate for a regulated field; low saturation is not
inherently mature, safe, or premium.

Choose saturation by role and surroundings:

- Preserve verified brand colour unless adaptation is authorized.
- Give interactive and status colours enough separation from their actual adjacent colours.
- Check whether repeated chroma overwhelms content or whether muted colours become indistinct.
- Check small coloured text independently; a vivid hue may still have insufficient luminance
  contrast, while a muted one may pass.
- Compare candidate palettes in full desktop and mobile renders, not isolated swatches.

If reducing saturation improves the composition, do it because the render demonstrates excess
competition, not because the audience or industry supposedly demands restraint.

---

## Background temperature

Warm, cool, tinted, white, grey, and dark grounds are all available. None is universally neutral.
The ground affects perceived contrast, image treatment, brand recognition, and the amount of visual
weight carried by every surface above it.

Choose a ground from supplied brand guidance, content, task duration, imagery, theme expectations,
and measured reference evidence. Compare plausible candidates with real copy and components. Check
whether the ground supports the intended hierarchy without flattening boundaries or colouring every
content asset unintentionally.

### Default ground and evidence threshold

General product UI defaults to true white, `#FFFFFF`. Use a tinted, cream, dark, or material
ground only when the user, brand, subject, existing system, working conditions, or measured reference
evidence supports it. Beige, cream, sepia, and warm-paper styling is not an unearned premium default.
Test the chosen ground with real dense content, controls, states, imagery, and contrast pairs.
`tokens.md` defines the shared canvas, surface, text, border, focus, selection, and status roles; this
file owns the color judgment behind those mappings.

Marketing and editorial surfaces may choose another ground from their concept and evidence. An
explicit brand system or user preference is authority. Locale research may influence a ground only
through the evidence-bearing locale profile; a locale, script, market label, or metaphor such as
"editorial" or "premium" does not itself authorize a tint or dark theme. The 60-30-10 guidance
above remains a heuristic, never a law or acceptance threshold.

---

## Dark mode: the rules for colour adjustment

Dark mode is a separate rendered theme, not an inverted light palette. It is also not mandatory for
developer tools or any other category. Offer or prioritize it when the brief, existing product,
platform convention, user preference, or observed working conditions support it.

For a dark candidate:

- Choose the ground and elevation model together. Pure black is valid when it serves the brand,
  display behavior, or contrast strategy; near-black is valid when it gives the surface hierarchy
  better separation. Neither is universally correct.
- Re-evaluate every brand, action, focus, status, chart, and illustration colour against its actual
  dark surroundings. Do not apply a blanket desaturation percentage.
- Specify text colours per surface. Opacity tokens can be useful, but composited results vary with
  the background; fixed colours can be equally valid. Test the final computed colours rather than
  prescribing universal opacity tiers.
- Render hover, focus, active, selected, disabled, error, overlays, and forced-colour or high-
  contrast adaptations where applicable. A palette that works only in the resting state is not
  complete.

Keep light and dark tokens tied to the same semantic roles, even when their values and contrast
relationships differ.

---

## Accessibility contrast: APCA vs WCAG 2

WCAG 2.2 is the current W3C Recommendation. At Level AA, ordinary text and images of text require
at least 4.5:1 contrast against their background; large-scale text requires at least 3:1, with the
criterion's stated exceptions. Visible information needed to identify user-interface components
and states, and graphical objects needed to understand content, generally requires 3:1 against
adjacent colours. Colour must not be the only visual means of conveying information.

Apply those checks to final rendered combinations, including gradients, images, overlays,
transparency, themes, and interactive states. Preserve visible focus, labels, icons, patterns, or
other redundant cues for semantic states. Do not assume that green/red or any hue pair is
self-explanatory.

APCA is an experimental perceptual contrast method that can be used as an additional design probe.
It is not part of WCAG 2.2, and W3C has not confirmed it as the final contrast model for WCAG 3.
WCAG 3 remains an incomplete Working Draft whose requirements can change. Do not substitute an APCA
score for applicable WCAG 2.2 conformance checks or present APCA as legal compliance. If a team uses
APCA, record the implementation and thresholds used, then validate the result with real font size,
weight, rendering, and user needs.

Contrast numbers are necessary checks, not a full legibility verdict. Also inspect text size and
weight, typeface, spacing, glare, content behind text, disabled-state meaning, and zoom. When a
combination technically passes but remains hard to read, improve it.

---

## Cultural colour conventions: East Asian and Korean markets

Do not assign a colour meaning from a country-sized stereotype. Red, white, gold, and every other
hue can carry multiple and conflicting meanings within Korean and East Asian contexts depending on
task, generation, subculture, ceremony, brand, and placement.

Locale-grounded colour decisions follow the project's locale contract:

- Keep interface language, market region, audience, task, and brand identity separate.
- Transfer only mechanisms marked `supported` or `shared` in the evidence-backed locale profile.
- Treat `contested` findings as decisions to resolve and `unknown` findings as no rule.
- Use current native first-party task references and counterexamples; do not infer cultural fit from
  a same-owner homepage or a single competitor.
- Describe what was observed: role, placement, neighboring cues, frequency, and state. Do not turn
  an observation into a claim about what a population feels.
- Pair status colour with text, iconography, shape, or position so meaning does not depend on a
  cultural association or colour perception alone.

Only evaluation with the named target audience can support a claim of cultural fit. In its absence,
describe the result as evidence-grounded adaptation, not culturally correct design.

---

## Data visualisation palettes vs UI palettes

UI and data visualisation colours have different semantic jobs, even when they share brand values.
Maintain distinct tokens and names so an action colour cannot silently become a data category and a
data series cannot look selected or erroneous by accident.

Choose the visualisation scheme from the data relationship:

- categorical: distinguish unordered groups;
- sequential: show ordered magnitude with a perceptually ordered ramp;
- diverging: show movement around a meaningful midpoint;
- status or threshold: encode the defined domain meaning and provide redundant cues.

Check series and marks against the chart background and against one another. Test legends, direct
labels, hover and selection states, small marks, light and dark themes, colour-vision simulations,
grayscale or print when relevant, and representative real data. Add labels, patterns, line styles,
or shapes whenever colour alone would carry meaning.

A proven visualization palette such as ColorBrewer can be a starting point, not automatic evidence
that it works in this chart. The number and area of marks, display conditions, and surrounding UI
still determine the rendered result.

---

## Sources

- [W3C, Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/) —
  normative contrast, non-text contrast, and use-of-colour requirements
- [W3C WAI, Understanding SC 1.4.1: Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color) —
  visible alternatives to colour-only information
- [W3C WAI, WCAG 3 Introduction](https://www.w3.org/WAI/standards-guidelines/wcag/wcag3-intro/) —
  current draft status and warning that requirements will change
- [W3C, W3C Accessibility Guidelines (WCAG) 3.0 Working Draft](https://www.w3.org/TR/wcag-3.0/) —
  developing requirements; not a W3C Recommendation
- [Brewer, ColorBrewer](https://colorbrewer2.org/) — candidate categorical, sequential, and
  diverging schemes that still require destination testing
