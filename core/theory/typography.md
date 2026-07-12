# Typography — decision material

Typography is not font selection. It is a system of decisions that determine whether text
can be read, trusted, and navigated. Each decision has a testable consequence and a reason.

---

## Modular scale: what the ratio means

A modular scale is not a visual preference. It is a statement about the distance between
information levels — about how urgently the hierarchy needs to declare itself.

**1.2 (minor third)**: a quiet scale. Adjacent sizes feel related rather than distinct.
Use when the content is dense and hierarchy must be maintained without visual agitation —
editorial long-form, legal documents, reference documentation. The eye moves between levels
without a jolt. A quiet library concept uses 1.2.

**1.25 (major third)**: the standard scale for most UI work. Adjacent sizes are distinct
enough to read as different levels without declaring themselves theatrically. Material
Design's type system uses ratios in this range. Appropriate for consumer web products,
dashboards, marketing sites where hierarchy must be clear but not dramatic.

**1.333 (perfect fourth) and above**: expressive. Adjacent sizes feel like a declaration.
Use when the concept demands visual boldness — a landing page where the hero is an
argument, not a summary. At 1.5 and above (golden ratio), the scale is display-only: it
cannot accommodate body copy and heading in the same space without the heading overwhelming
everything below it.

The ratio is not chosen by feel. It is chosen by what the concept demands of the distance
between information levels. A "3am convenience store" concept can justify 1.4. An invoice
tool cannot.

---

## Pairing theory: the axes of contrast

Two typefaces create a relationship, and that relationship has axes. Contrast on too many
axes produces conflict; contrast on too few produces monotony.

**The primary axis — structural contrast**: serif paired with sans-serif is the oldest
typographic pair and the most legible one, because the two forms differ categorically, not
in degree. Bringhurst (*The Elements of Typographic Style*, 2012) calls this the
"harmonious contrast" pair: the forms are different enough to be instantly distinguished,
similar enough to share the same page without fighting. This is the pair to reach for when
you have no better reason for another choice.

**Weight contrast**: a light display paired with a medium or semi-bold body. Use when the
concept is spare and hierarchy should feel like emphasis, not categorical difference. Risk:
if the body weight is too close to the display weight, the hierarchy collapses under
text-size scaling at small viewport widths.

**x-height matching**: typefaces whose lowercase letters reach the same relative height
feel designed for each other. When x-heights conflict, the body text looks wrong at any
weight and size combination. Before pairing, check x-heights visually — a 16px line of
Inter and a 16px line of Georgia have different apparent sizes because their x-heights
differ substantially. The mismatch reads as error, not style.

**What not to pair**: two typefaces from the same formal family — two geometric sans-serifs,
two transitional serifs. They are too close on the primary axis to read as a system; they
read as an inconsistency. If the intent is a single-typeface system, commit to it: use
weight and scale, not a second face.

---

## Type semantics: what the form says before a word is read

A typeface carries meaning before a word is set in it. These associations are empirically
stable across Western audiences (Brumberger, 2003, "The Rhetoric of Typography"):

**Serif typefaces**: authority, tradition, trustworthiness. The presence of serifs reads as
institutional — newspapers, legal documents, universities, luxury brands. Use when the
concept requires inherited trust. A new financial product might choose a serif precisely
to claim heritage it does not yet have; this is a legitimate brand decision.

**Geometric sans-serif** (Futura, Circular, Avenir): neutral, modern, technical. The clean
geometry reads as precision and efficiency. Widely used in developer tools, B2B SaaS,
technology companies. The danger is that "neutral" becomes "anonymous" when the concept
requires personality. Geometric sans does not argue for you; it holds space until something
else does.

**Humanist sans-serif** (Gill Sans, Frutiger, Myriad, Aktiv Grotesk): friendly,
approachable, human. The letterforms retain traces of hand motion — calligraphic axis,
varying stroke width. Use when the concept requires warmth or accessibility. Healthcare,
education, consumer apps. Humanist sans reads as a person speaking; geometric sans reads
as a system communicating.

**Transitional and Old Style serifs** (Times, Palatino, Garamond, Caslon): scholarly,
editorial, earned. These typefaces carry the weight of publishing history. Use for editorial
products, long-form content, academic or legal tools. They do not work in UI-dense screens
where the optical weight becomes clutter.

---

## Line length: the 45–75 character constraint

Optimal line length for body text is 45–75 characters including spaces. Below 45, the
reader makes too many line breaks per paragraph — the eye bounces rather than reads. Above
75, the eye loses its place returning to the start of the next line: a measurable increase
in reading errors, documented by Tinker (1963) and replicated in web reading studies at
Wichita State University (2004).

This is not a design preference. It is a reading physiology fact. At 16px on a 1280px
viewport, a container with `max-width: 65ch` stays inside the optimal range. Wider
containers require multi-column layout or larger type if the content is meant to be read
rather than scanned. A full-bleed paragraph at 1280px wide is not a design choice — it is
an oversight.

Butterick (*Practical Typography*, 2023): "Anything longer than 90 characters per line is
unequivocally too long. Most of the time, shorter is better."

---

## Line height: the leading system

Body text: 1.4–1.6× the type size. Below 1.4, lines crowd and the eye struggles to return
to the start of the next line. Above 1.6, lines feel disconnected — the paragraph loses its
texture as a unit; it reads as a list of separate sentences rather than a composed passage.

Display text: 1.0–1.2×. Large type already has visual separation through scale; adding
generous leading at display sizes makes headlines read as unanchored, floating rather than
placed.

Caption and UI label text: 1.2–1.3×. UI labels are read in single-glance bursts, not
sustained reading — tight leading is appropriate and economical without impeding
comprehension.

The ratio is not uniform. A design system that uses a single `line-height` value for all
text has made a decision by omission, and it will be wrong for at least one category of
text on every page.

---

## Korean typography (한글 타이포그래피)

Korean text operates by different rules than Latin. Applying Latin defaults to Hangul
produces work that is technically readable and visually wrong.

**Font classification in Korean.** The Korean typographic tradition uses its own category
names that map loosely — but not exactly — onto Western classifications:

- **명조 (Myeongjo)**: the serif equivalent. Strokes end in decorative terminations that
  trace back to brush calligraphy, making them analogous to Western serifs. Myeongjo reads
  as formal, editorial, and trustworthy — appropriate for print, long-form reading, official
  documents, and any context that benefits from institutional weight. The brush-derived
  detailing does not reduce well below 14px on screen; avoid Myeongjo for UI labels and
  microcopy.

- **고딕 (Gothic)**: the sans-serif equivalent. Consistent stroke width, no terminal
  decoration. Gothic is the dominant category for digital Korean: approachable, legible at
  small sizes, system-appropriate. Pretendard and Noto Sans KR are both Gothic.

- **손글씨 (Handwriting/Calligraphic)**: warm, personal, informal. Appropriate for
  emotionally expressive contexts — cards, invitations, brand personality elements — and
  actively wrong for dense informational UI.

Condition → choice → reason: the Myeongjo/Gothic divide carries the same semantic weight
as serif/sans in Western typography. Choose based on the concept's register, not by feel.

**Why Hangul needs more line-height than Latin.** Hangul syllables occupy a nearly square
em-box. Each syllable is a tight unit of stacked components — the visual density per
character is higher than Latin, where most lowercase letters use only a portion of the
em-box (ascenders and descenders occupy the rest as white space). The W3C Korean Text
Layout and Typography Requirements (klreq) documents a proportional line-height of 160%
as the commonly cited value for Korean body text — equivalent to `line-height: 1.6`. Latin
body text typically needs only 1.4–1.5. Setting Hangul at the Latin default of 1.4 produces
text that feels cramped; the syllables crowd each other vertically and the eye struggles
to parse the line boundary.

Condition → choice → reason: when the body copy is Korean, set `line-height` to 1.6–1.7.
When the same component holds both Korean and Latin text (as most Korean products do), use
1.6 — which is generous for Latin but correct for Korean.

**Korean-Latin mixed typesetting (국영문 혼용 조판).** The vast majority of Korean digital
products mix Hangul and Latin characters on the same line — product names in English,
numbers, units, technical terms. Two problems appear at the same point size:

1. Latin lowercase letters appear smaller than their nominal size suggests because Latin
   x-heights are typically 40–50% of the em. Korean glyphs, filling nearly the full em,
   look larger. The optical correction is to scale the Latin face up by 5–10% when they
   share a line. Alternatively, choose a Korean Gothic whose own Latin glyphs were designed
   for co-existence (Pretendard's Latin is derived from Inter, which is optimised exactly
   for this).

2. Spacing between Hangul and Latin text requires a thin space — the W3C klreq specifies
   a 1/8-width space between Hangul and adjacent Latin letters or numbers. In practice:
   the non-breaking thin space character (U+202F) or a carefully chosen `letter-spacing`
   adjustment accomplishes this. Without it, Hangul and Latin characters crowd each other
   at the boundary.

**Pretendard vs Noto Sans KR: the choice criterion.** Both are open-source Gothic typefaces
that dominate Korean web typography. The decision is not about quality — both are well-made
— but about priorities:

- **Pretendard** is designed as a UI-first font, modelled on Inter's Latin and built for
  cross-platform consistency. Its Latin glyphs are Inter-derived, meaning the Latin-Korean
  optical matching problem is pre-solved. Available in 9 static weights plus a variable
  font file. The variable version covers the full `wght` axis from 100 to 900. According to
  HTTP Archive's Web Almanac (2024), Pretendard is the most-used Korean web font among
  products prioritising UI consistency.

- **Noto Sans KR** covers the full 11,172 modern Hangul syllables plus the Old Hangul
  repertoire via OpenType features. If the product must render arbitrary user-generated
  Korean text including archaic or unusual syllables, Noto Sans KR is the safer choice.
  Its Latin glyphs are generic and do not optically match Korean glyphs as cleanly as
  Pretendard's.

Condition → choice → reason: choose Pretendard when the font will render known-content
product UI in Korean; choose Noto Sans KR when the product must render arbitrary user text
(input fields, comments, documents) where full syllabary coverage takes priority.

---

## Variable fonts

A variable font is a single font file that encodes the full design space across one or more
axes — weight (wght), width (wdth), optical size (opsz), slant (slnt) — rather than
shipping a separate file for each weight. The performance implication is material: replacing
a four-weight static stack (Regular, Medium, SemiBold, Bold — typically 400–800KB total)
with a single variable font file (typically 100–200KB) reduces both request count and
payload. For products using three or more weights of the same face, the variable option
is strictly better on performance.

The design implication is less obvious but more important. The `opsz` (optical size) axis,
present in typefaces like Inter Variable and Literata, adjusts letter spacing, stroke
contrast, and proportions based on the rendered size — automatically making small text more
open and large display text more refined. This is what a type designer does manually for
display and text cuts; variable fonts make it continuous and automatic. The opsz axis is
the most valuable and least used feature in variable fonts deployed in product UI.

Condition → choice → reason: when the product uses a typeface available as a variable font
and the design calls for three or more weights, use the variable file and set `font-weight`
to any value on the axis — not just the named stops. When the font supports opsz, enable
it with `font-optical-sizing: auto`.

---

## Tabular vs proportional figures

Numbers in body copy and numbers in tables are different typographic problems and require
different glyph choices.

**Proportional figures** have varying widths, like letters. They look better in body text
— the "1" is thinner than the "8", which mirrors natural reading and produces more even
colour in a sentence. They are wrong in tables: a column of prices set in proportional
figures will not align on the decimal point, because each digit occupies a different width.

**Tabular figures** (also called monospaced or fixed-width numerals) give every digit the
same horizontal advance. A column of numbers set in tabular figures aligns perfectly
regardless of value. This is the mandatory choice for financial dashboards, data tables,
transaction histories, and any context where vertical comparison of numbers is the task.

The CSS declaration is `font-variant-numeric: tabular-nums lining-nums`. Lining figures
(as opposed to oldstyle figures) ensure the numbers sit on the baseline rather than
ranging above and below it, which is correct for both tables and UI labels.

The common error is shipping a financial product without specifying tabular-nums and
discovering the issue only when a price column shows "1,234.00" and "10.50" in ragged
misalignment. Check every table, every ticker, every price display, every timer. Default
proportional figures from Inter or Pretendard will misalign your data.

---

## Minimum font size on mobile

The minimum body text size for mobile is 16px. Below this, iOS Safari zooms the viewport
automatically when a text input is focused — a disruptive re-layout that most users
experience as a bug. At 16px and above, iOS does not trigger the auto-zoom.

The minimum for secondary text (captions, labels, helper text) is 12px under ideal
conditions — strong contrast, short strings, ample surrounding space. Below 12px, even
high-contrast text requires the user to actively strain. At 11px and below, a meaningful
portion of users with normal vision cannot read comfortably; users with visual impairment
cannot read at all. Google's Material Design specifies 12sp as the absolute floor for any
text that communicates meaning.

For Korean text specifically, 14px is a more practical minimum for body text. Hangul
syllables contain multiple strokes compressed into a square unit; at 12px the
inter-component spacing within a syllable can become indistinct, particularly for glyphs
with many strokes (e.g., 흙, 닭). At 14px, all modern Korean fonts render cleanly.

---

## Korean line-breaking: word-break: keep-all

Korean text is written without spaces between syllables within a word unit (어절), but with
spaces between word units. The CSS default `word-break: normal` treats each syllable block
as a breakable unit, which produces splits like "동\n시접속" (simultaneous connection) or
"확인했\n어요" (I confirmed) — a break inside a meaningful word unit that no Korean writer
would produce and that any Korean reader registers immediately as a layout error.

`word-break: keep-all` prevents the browser from breaking inside a Korean eojeol. A line
break can occur only at the space boundaries between word units, matching how Korean readers
expect text to wrap. This is not a style preference. It is a readability requirement — the
W3C *Requirements for Hangul Text Layout* (klreq) explicitly defines word-boundary-aware
line breaking as the correct behaviour for Korean text.

**Implementation**: apply at the base layer, not component-by-component:

    * { word-break: keep-all; overflow-wrap: break-word; }
    h1, h2, h3, h4, h5, h6 { text-wrap: balance; }

`overflow-wrap: break-word` handles long URLs and code strings that cannot break at
word boundaries. `text-wrap: balance` on headings distributes line length evenly across
lines, preventing a single orphaned syllable on the last line of a heading — the Korean
equivalent of a typographic widow.

**Verification at narrow viewport**: `word-break: keep-all` changes how text wraps, which
changes the measured height of containers at narrow widths. After applying it, verify the
layout at 375px. A `clamp()`-sized display heading that fitted comfortably at 768px may
overflow its container at 375px after wrap behaviour changes — the last line's descender
can be cut off by `overflow: hidden` on the container. Fixes: reduce the `clamp()` minimum
value, add `padding-bottom` to accommodate the extra line, or set `overflow: visible` with
enough vertical whitespace below. `KO-KEEP-ALL` in `omd check` fires once per page when any
Hangul text node is missing `word-break: keep-all`, measuring the actual computed value from
the live DOM.

---

## Sources

- Bringhurst, *The Elements of Typographic Style* (4th ed., 2012) — modular scale,
  pairing theory, optimal line length, leading
- Butterick, *Practical Typography* (2023 online edition) — line length, practical scale
  guidance, applied typographic judgment
- Brumberger, "The Rhetoric of Typography" (2003) — empirical typeface semantics across
  audiences
- Tinker, *Legibility of Print* (1963) — foundational legibility research, line length
  evidence
- Material Design 3 type system (2023) — scale ratios, role definitions, applied scale,
  minimum font size (12sp)
- IBM Design Language type system (2023) — pairing philosophy, register classification
- W3C, *Requirements for Hangul Text Layout and Typography* (klreq, w3.org/TR/klreq) —
  Korean line-height norms (160% proportional), mixed-script spacing rules
- HTTP Archive, Web Almanac 2024, Fonts chapter — Pretendard as most-used Korean UI font
- Google Fonts Knowledge, "Type in China, Japan, and Korea" — CJK typesetting structure
  and Latin-Korean optical matching
- Orioncactus, Pretendard GitHub (github.com/orioncactus/pretendard) — Inter-derived Latin
  glyphs, 9-weight variable font design rationale
- MDN Web Docs, "Variable fonts guide" — wght axis, opsz axis, browser support
- Google Fonts Knowledge, "Understanding numerals" — tabular vs proportional figures,
  lining vs oldstyle, CSS font-variant-numeric
