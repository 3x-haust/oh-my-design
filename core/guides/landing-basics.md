# Basics a designer keeps without being asked

Conventions professional web designers apply before anyone reviews the page. Their absence is what makes a
generated landing look amateur even when every section is "nice". Counts come from 30 current landings
observed on 2026-10-23 (20 international, 10 Korean, 1440×900): a purposive reference sample, not a
conversion study. **Fail** items are defects; **default** items are strong conventions you break only for a
stated reason; **choice** items vary across finished sites and are never a rule.

## Header and navigation

- **Default — keep the header in reach on a long page.** Sticky or fixed, compact, with its own background
  (opaque, or blur plus a hairline once content passes under it) so text never reads through it. 25 of 26
  conventional headers stay in view. Short pages, immersive story pages and sidebar products are exceptions.
  [NN/g, Sticky Headers](https://www.nngroup.com/articles/sticky-headers/)
- **Fail — in-page links land their heading below the fixed header.** `scroll-margin-top` on targets or
  `scroll-padding-top` on the page, equal to the header height.
  [MDN scroll-padding-top](https://developer.mozilla.org/en-US/docs/Web/CSS/scroll-padding-top)
- **Default — navigation is plain words.** 28 of 28 word-navs are text-led. No arrow, `↗`, or icon after a
  nav word: only 2 of 28 put an external-link arrow on a nav link, and USWDS found visitors do not reliably
  read it. A chevron on a menu that actually opens is the exception.
  [USWDS links](https://designsystem.digital.gov/components/link/)
- **Default — one strong header action at most, the rest quiet.** 20 of 26 headers carry one or two
  actions; they never compete as equal filled buttons.
- **Default — the logo sits where reading starts and links home.** On desktop, primary destinations are
  visible, not hidden behind a hamburger.

## Hero and sections

- **Default — the first viewport says what this is, for whom, and the next step** in one proposition, with
  one visually primary action; a secondary action steps down (outline or text). 24 of 30 heroes have one or
  two actions; exactly two is only 14 of 30, so it is not a rule.
- **Default — action labels predict the commitment** ("무료로 시작하기", "설치 명령 복사"), not "Get started"
  or "자세히" by habit.
- **Default — the hero visual explains the product or its result**, not a blob, glow or generic gradient.
- **Fail — the proposition and actions stay readable when animation fails or is reduced.**
- **Default — sections follow the visitor's questions** (what is it, why believe it, how to start); length
  follows the content (3–12 sections observed, median 8), never a hero → logos → 3 cards → bento → CTA recipe.
- **Choice — kickers and eyebrows.** 14 of 30 sites use some, 16 use none. A small label above *every*
  section, numbered sections, tag rows and captions that restate the heading are the generated-page tell.
- **Fail — no invented proof.** Testimonials, logos and numbers are real and attributable, or absent.

## Type and reading

- **Default — page width and reading width are separate.** Paragraphs keep a readable measure (about 45–80
  characters; Korean roughly 30–45 eojeol-width) while media spans wide.
- **Default — hierarchy from size, weight, colour and spacing together**, built on the real copy.
- **Default — inline links look like links before hover** (underline or a non-colour cue).
- **Default — headings break by meaning**: no one-word last line; `text-wrap: balance` or a copy edit.
- **Korean — body text starts around 16–17px**, long-form line-height looser than labels; `word-break:
  keep-all` with `overflow-wrap: anywhere` as the safety net; negative tracking only where a display face
  needs it; choose 해요체 or 합니다체 per surface and keep it consistent.

## Colour and background

- **Choice — the ground.** Observed: 13 dark, 6 white, 6 off-white, 4 mixed, 1 brand colour. Cream with an
  editorial serif and sage accent is the current generated default ("보라를 피한 선택이 또 하나의 기본값",
  DDD); off-white belongs where the brand's material is paper or craft, said in the report.
- **Default — colour by role** (text, surface, border, accent, status) with few one-offs; gradients and glow
  only where they carry the brand or a meaning.
- **Fail — text and controls keep contrast on the actual pixels behind them**, including over images.
  [WCAG contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

## Icons, controls and states

- **Default — an icon adds meaning or saves space; it never decorates every link.** Chevron = disclosure,
  arrow = direction, external icon = leaving the site; do not mix them. Icons match the adjacent type's size
  and stroke. [Carbon buttons](https://carbondesignsystem.com/components/button/usage/)
- **Fail — every interactive element has hover, active, focus-visible and, where relevant, disabled,
  loading and error states**; nothing that looks clickable is inert.
- **Fail — targets at least 24×24 CSS px** (44 for the main actions on touch).
  [WCAG target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- **Default — one radius and shadow scale tied to roles**, not a new value per card.

## Motion

- **Default — motion explains a change, a relation or a direction**; not a fade-up on every block or a
  wiggling arrow. A long landing stages what its sections explain as the visitor scrolls.
- **Fail — reduced motion removes non-essential motion and keeps all content and actions.**

## Footer, metadata and shipping

- **Default — a footer with secondary navigation and the legal/policy links** (27 of 30); Korean commerce
  shows the business registration details the law requires.
- **Fail — every page ships a real `<title>` and description, the viewport meta, a favicon, a social
  preview image and `<html lang>`.** [web.dev](https://web.dev/learn/html/metadata)
- **Fail — no dead links** (`href="#"`, anchors to sections that do not exist).
- **Fail — images reserve their size (width/height or aspect-ratio); no page-level horizontal scroll; the
  layout survives 200% zoom and 320px reflow.**

## Never rules

Do not treat as defects: having no sticky header on a short page, any particular ground colour, not exactly
two hero buttons, eyebrows present or absent, not using an 8px grid, not using Pretendard or negative
tracking, no custom selection colour, no CTA arrow, no scroll reveal on a page that does not need it.
