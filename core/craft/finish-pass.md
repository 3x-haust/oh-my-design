# Finish pass — the last 5%

Done is when the build passes checks and the eye approves it. Cared for is when the cursor selects text and the highlight colour is yours, when focus rings look designed rather than browser-default, when the favicon tab reads as the brand in a row of twenty other tabs. Nobody schedules these items because none of them ships features. All of them ship the difference between a page a developer handed off and a page a designer finished.

This checklist runs after `omd check` returns clean and before handback. Walk it top to bottom. Each item is either implemented or skipped with a written reason. A page without a favicon and `::selection` colour reads as unfinished regardless of everything else.

---

## ::selection

The browser's default selection highlight is a system blue. On a page that committed to a considered colour system, the default highlight announces that somebody stopped caring at the boundary of their CSS.

Derive the selection colour from the accent token already declared in `:root`. The background should be a mid-opacity or tinted variant of the accent — not a hardcoded blue, not a generic highlight. The text colour must maintain 4.5:1 contrast against the selection background.

```css
/* Derive from the accent token already declared in :root.
   Use a transparent or tinted variant so the selected text remains readable.
   WCAG minimum: 4.5:1 between --color-selection-text and --color-selection-bg. */
::selection {
  background-color: var(--color-selection-bg, oklch(from var(--color-accent) l c h / 0.25));
  color: var(--color-selection-text, inherit);
}

/* Declare the tokens in :root alongside the rest of the colour system. */
:root {
  --color-selection-bg: oklch(from var(--color-accent) l c h / 0.2);
  --color-selection-text: var(--color-text-primary);
}
```

For browsers without `oklch()` color relative syntax support, declare an explicit fallback:

```css
:root {
  --color-selection-bg: color-mix(in oklch, var(--color-accent) 20%, transparent);
}
```

Condition for skipping: the brief specifies a monochrome print stylesheet as the only output. Otherwise, this ships.

---

## Focus ring

Suppressing outlines — `outline: none` without a replacement — is an accessibility defect. The FOCUS rule in `omd check` (`A11Y-FOCUS-SUPPRESSED`) fires on any selector that removes the outline without providing a visible `:focus-visible` alternative. Do not suppress; design it.

`:focus-visible` is the correct pseudo-class. `:focus` fires on mouse clicks too, which produces a ring on button-press that most designs do not intend. `:focus-visible` fires only when the keyboard (or a pointing device in sequential-focus mode) is the active input — the ring appears when it is needed and disappears when it is not.

```css
/* Remove the default only where you are replacing it. Never remove without replacing. */
:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 2px var(--color-bg-primary, #fff),
    0 0 0 4px var(--color-focus-ring, var(--color-accent));
}

/* Declare the focus ring token in :root. */
:root {
  --color-focus-ring: var(--color-accent);
}
```

The two-layer shadow creates a ring with a gap between the element edge and the visible ring — the gap is the inner shadow matching the page background. This technique works on any background colour as long as the inner shadow is updated. For dark-background sections, override locally:

```css
.section--inverted :focus-visible {
  box-shadow:
    0 0 0 2px var(--color-bg-inverted),
    0 0 0 4px var(--color-focus-ring-on-dark, #fff);
}
```

Minimum ring visibility: 3:1 contrast between the ring colour and the adjacent background (WCAG 2.2 §2.4.11). Run `omd check --category a11y` after setting these values — the checker measures contrast, not intent.

---

## Scrollbar

The browser default scrollbar is a grey rectangle. It is legible and functional; it is not designed. On a page that committed to a colour system, the scrollbar is the one surface the browser owns that does not match.

Use the standards-track properties first. `scrollbar-color` and `scrollbar-width` are in the CSS Scrollbars Specification (Candidate Recommendation) and are supported in Firefox and Chrome 121+.

```css
/* Standards-track. Thumb colour, then track colour. */
:root {
  scrollbar-color: var(--color-scrollbar-thumb) var(--color-scrollbar-track);
  scrollbar-width: thin;

  --color-scrollbar-thumb: color-mix(in oklch, var(--color-text-primary) 30%, transparent);
  --color-scrollbar-track: transparent;
}
```

Follow with the `-webkit-` prefixed properties as the noted fallback for Safari and older browsers. These properties do not compose with `inherit` correctly — set explicit values:

```css
/* -webkit- fallback (Safari, older Chromium). Note: these are not in any standard.
   They are widely supported but their future is not guaranteed; the standards-track
   properties above take precedence wherever both are supported. */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: var(--color-scrollbar-track, transparent);
}
::-webkit-scrollbar-thumb {
  background: var(--color-scrollbar-thumb);
  border-radius: 999px;
}
::-webkit-scrollbar-thumb:hover {
  background: color-mix(in oklch, var(--color-scrollbar-thumb) 140%, transparent);
}
```

Condition for skipping: the page is a web application that deliberately defers to the OS scrollbar for platform-native feel. Record the reason.

---

## Optical alignment

Pixel-perfect alignment is not optical alignment. A 16px icon inside a 16px × 16px bounding box sits 1px high relative to adjacent text — its visual weight lands above the centre. A button whose padding is `12px 16px` produces more apparent top weight than bottom because the ascender height of the glyph does not fill the cap-height. These are the corrections that make the difference between type that looks placed and type that looks set.

**Icon baseline nudge.** Icons whose bounding box touches the cap line rather than the baseline need a fractional downward shift. The correction is 1–2px for most icon sets at 16–20px; the correct value is measured, not assumed.

```css
/* Inline icons adjacent to text: nudge down by half the difference between
   the icon's optical centre and the text baseline. Start with 1px; adjust by eye. */
.icon-inline {
  vertical-align: -0.125em; /* ≈ 2px at 16px font-size — tune to match the type */
}
```

**Button padding asymmetry.** Most typefaces have a slightly higher optical midpoint than the mathematical midpoint. Equal vertical padding reads as too much bottom space on most Latin type. Subtract 1–2px from the bottom padding to correct.

```css
/* Start with equal padding, then reduce bottom by 1–2px until the label reads centred.
   The correction varies by typeface — Inter and Geist need less, older serif faces more. */
.button {
  padding: 11px 20px 9px; /* or: padding-top: 11px; padding-bottom: 9px */
}
```

**Number alignment in tables.** Tabular figures (`font-variant-numeric: tabular-nums`) align decimal points. Without this, proportional numerals produce ragged columns.

```css
.data-cell {
  font-variant-numeric: tabular-nums;
  text-align: right;
}
```

These corrections are small and cumulative. None of them will survive a linter check; they pass `omd check` before and after. They register when a human looks at the finished page and notices it is not quite right — or when they look and notice it is exactly right, without being able to say why.

---

## Favicon

A favicon delivered as a separate asset file creates a dependency and an HTTP request. The inline SVG data-URI pattern delivers the icon with the HTML, requires no build step, and works across every browser that renders the page.

**SVG data-URI (recommended):** Build the icon as an SVG element, then encode it as a data URI. For a typographic favicon, this means a single `<text>` element with a carefully chosen character and fill colour.

```html
<!-- Inline SVG favicon: no asset file, no HTTP request, works in every browser.
     The SVG viewBox is 32×32; the font-size and y offset must be tuned to keep
     the glyph centred — exact values depend on the typeface. -->
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23111'/><text x='16' y='22' font-size='18' text-anchor='middle' fill='%23fff' font-family='system-ui,sans-serif' font-weight='700'>M</text></svg>">
```

Replace `%23111` with the URL-encoded hex of the brand background colour and `%23fff` with the glyph colour. The `rx='6'` rounds the favicon square — most platform launchers clip to this shape anyway; making it explicit ensures the corner doesn't read as a sharp artefact.

**Emoji favicon (minimal variant):** When the brand has no monogram but an associated emoji is genuinely appropriate, the single-character SVG is the minimal implementation:

```html
<!-- Emoji favicon: one character, no colour management needed.
     The emoji renders in its platform colour — no fill attribute required.
     Use only when the emoji is a deliberate brand choice, not a fallback decoration. -->
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌱</text></svg>">
```

Both variants require no external asset. The inline SVG approach gives more control over the appearance at 16×16 and 32×32 display sizes; the emoji variant is correct only when the emoji reads well at small sizes (simple pictograms work; detailed emoji do not).

Provide a `<title>` with the brand name — the favicon without a page title still reads as generic in the tab.

---

## OG and meta

Open Graph and meta tags are copy. They are read by every person who sees the link shared in a chat, a feed, or a notification. They are the page's first impression in contexts where the design cannot speak — and they are where the same model that wrote "Unlock the power of" will try again, unchecked, if nobody explicitly closes that door.

The copy rules that apply to the page apply here without exception.

**Required tags:**

```html
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <!-- Page title: brand name + one-line position, not a tagline.
       "Moa — 목표를 위한 저축" not "Moa | Save smarter. Live better." -->
  <title>Brand — specific position</title>

  <!-- Description: one or two concrete sentences. What does it do, for whom.
       No "powerful", "seamless", "next-level". No pink-elephant negations.
       omd check --category slop applies to this string exactly as it applies to body copy. -->
  <meta name="description" content="Specific, concrete description. One thing the product does.">

  <!-- OG title: same rule as <title>. Match or slightly adapt — do not write a new tagline. -->
  <meta property="og:title" content="Brand — specific position">
  <meta property="og:description" content="Same concrete description.">

  <!-- og:image policy: if a designed card image exists, use it.
       If one does not exist, omit og:image rather than setting a broken path —
       platforms render the URL card without an image more gracefully than they render
       a 404. Do not set og:image to a screenshot of the page unless it was designed
       as a social card at 1200×630. -->
  <meta property="og:image" content="https://example.com/og-card.png"> <!-- only if the file exists -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://example.com/">

  <!-- Twitter/X card — summary_large_image if og:image is designed, summary if not -->
  <meta name="twitter:card" content="summary_large_image">
</head>
```

**OG copy rules:**
1. The OG title must pass SLOP-COPY: it must say something specific about this product, not any product. "모아 — 목표까지 함께하는 저축" is specific; "모아 | 더 스마트하게 저축하세요" is a placeholder with the brand name prepended.
2. The description must not be the tagline repeated. If the title already communicates the position, the description adds a second concrete fact — who it is for, what it costs, what the first action is.
3. SLOP-PINK-ELEPHANT and SLOP-COPY rules apply. Run `omd check <page> --category slop` — the checker reads meta tags. A description that passes the page body but fails the OG string is the same failure.
4. If the brief was in Korean, the OG strings should be in Korean.

---

## Applying the checklist

Walk each item in order. For each one, write the decision into `.omd/decisions.md`:

```bash
omd decision "::selection bg: oklch from --color-accent at 20%" \
  --why "accent-derived highlight; 4.5:1 verified by omd check"

omd decision "Scrollbar: standards-track scrollbar-color/scrollbar-width with webkit fallback" \
  --why "thin scrollbar matches quiet register; track transparent"

omd decision "Favicon: inline SVG data-URI, monogram M on brand-dark background" \
  --why "no asset file dependency; legible at 16x16"

omd decision "OG title: '모아 — 목표까지 함께하는 저축'" \
  --why "specific claim, passes SLOP-COPY; mirrors page hero"
```

An item that is genuinely not applicable — `::selection` on a non-interactive data terminal, scrollbar styling on a page that disables scrolling by design — still gets a decision entry with the reason. The absence of a record is not the same as a decision not to implement.
