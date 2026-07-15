# Typography: prove the text that will ship

Typography starts with the reader, task, register, and actual copy. A font name or ratio is
not a decision until the target-language specimen shows what it does to meaning, hierarchy,
wrapping, loading, and fallback.

## Evidence order

Work in this order:

1. Read the target-language copy deck and identify productive and expressive roles.
2. Name the task and register: dense scanning, long reading, transactional UI, editorial
   authority, playful showpiece, or another evidenced need.
3. Study cited typography references for visible anatomy and behavior, not brand prestige.
4. Build neutral specimens with the real headline, body, labels, CTA, numerals, punctuation,
   dates, prices, identifiers, and the longest representative strings.
5. Render at 1280x900 and 390x844 after `document.fonts.ready`.
6. Record requested and computed browser evidence, then judge the visible result.

Do not start from a generic font-name default. A familiar family can still be wrong for the
copy, language coverage, voice, or production constraints.

## Role map

Separate two jobs:

- **Productive type** carries navigation, body, metadata, forms, tables, states, and repeated
  actions. It needs calm differentiation, durable glyph coverage, and predictable density.
- **Expressive type** carries a concept-bearing display line or rare editorial moment. Its
  face and weight must contribute meaning; size alone cannot supply the concept.

One family can cover both roles. Two families can be justified when their visible anatomy
creates a useful distinction. Start with one or two families and add another only when a
specimen proves the existing set cannot express a required role.

## Target-language and glyph coverage

List the scripts and symbols that the product actually uses. For a Korean product this often
includes Hangul syllables and jamo, Latin names and URLs, Arabic numerals, currency, dates,
punctuation, arrows, and product-specific symbols. Test the real strings.

Browser `document.fonts.check()` can show only that the browser considers a requested face
ready for a sample; it does not prove glyph coverage. FontFace status reports declared-face
loading state. Computed CSS can show the requested/computed family, size, weight, and line
height. None identifies the physical font that painted every glyph.
Visible tofu, style jumps, mismatched punctuation, or a fallback-shaped substring is a
failure even when the API reports loaded.

Hangul line breaking is a contextual author choice. W3C KLREQ describes both word-based and
character-based practices. Test the chosen `word-break` and wrapping policy with actual copy
at the intended container widths; do not enforce one policy for every Korean interface.

## Visible anatomy and voice

Compare what is visible in the specimen:

- Hangul square density, counters, terminals, stroke modulation, and punctuation alignment;
- Latin x-height, width, apertures, numeral shapes, and compatibility with Hangul color;
- the rhythm of mixed Korean, Latin, and numeral lines;
- whether the face sounds aligned with the recorded register rather than merely “modern.”

Reject an alternative by naming the visible condition and consequence. “Too generic” is not
enough; “the narrow Latin numerals create a second texture inside Korean prices” is evidence.

## Size, measure, and line height

Choose size from reading distance, role, actual copy, and container. Useful starting ranges
are hypotheses to render, not mandates: body text often begins around the mid-teens in CSS
pixels, compact UI may begin lower, and display roles may begin much larger. Adjust only from
specimen evidence.

Likewise, a body line height around 1.4–1.7 can be a starting test. KLREQ's 160% example is
an example, not a universal Korean requirement. Display lines often need tighter leading,
but the specimen must show that stacked glyphs, accents, and wrapping remain clear.

Record desktop and mobile container widths, line counts, deliberate breaks, accidental
orphans, clipping, and the relationship between primary, secondary, and CTA text. Never hide
a heading's overflow to make a failed proof look clean.

## Weight, axes, and optical size

Request only weights the source provides. Compare requested and computed weights and inspect
whether the visible face actually changes. A synthetic bold or faux italic fails when it
distorts the intended anatomy.

For variable fonts, record the file, supported axes, requested values, and relevant named
instances. Test intermediate weights rather than assuming the browser interpolates as
intended. Variable fonts can reduce requests in some deployments, but are not inherently
smaller than every static subset.

When the face provides an `opsz` axis, test `font-optical-sizing: auto` against an explicit
setting. MDN documents the mechanism; the actual specimen decides whether it helps this
face, copy, and size.

## Fallback, loading, CLS, and performance

Record source, licence, hosting choice, formats, unicode subsets, preload decision, and
`font-display` behavior. Build a fallback stack that covers the same scripts. Compare its
metrics and wraps with the primary face; use metric overrides only with measured source data.

Test:

- first render and post-font render for layout shift;
- fallback and primary wraps at both proof viewports;
- unavailable, slow, and failed font states;
- whether critical text stays readable while loading;
- the network cost of the files and subsets actually shipped.

web.dev's font guidance is a starting reference for preload, subsetting, and layout shift.
Performance claims belong to measured project output, never a fixed file-size promise.

## Typography proof record

`.omd/type-proof.md` records:

- role map and target task/register;
- family source, licence, hosting, scripts, glyphs, weights, and axes;
- actual copy specimens;
- requested and computed family/weight evidence;
- desktop/mobile line, wrap, clip, orphan, and hierarchy observations;
- fallback/loading/CLS/performance plan;
- alternatives rejected with visible evidence;
- a fingerprint of copy, font family/files, weights/axes, and container widths.

Changing any fingerprint input invalidates the proof. After a structure is selected, repeat
the proof inside the real production container before the visual craft checkpoint.

## Sources

- W3C, *Requirements for Hangul Text Layout and Typography (KLREQ)*.
- web.dev, *Font best practices*.
- MDN, *CSS Font Loading API* and *font-optical-sizing*.
- U.S. Web Design System, typography guidance.
- Carbon Design System, productive and expressive type roles.
