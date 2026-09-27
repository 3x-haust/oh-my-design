# Korean typography for product interfaces

Korean type is a production system, not a font-name choice. Prove Hangul, Latin, numerals, punctuation, wrapping, fallback, and loading with the copy and containers that will ship. A label that breaks inside a Korean word is a hard failure.

## Choose a family from the task

These stacks are starting points. Confirm the licensed files, available weights, glyph coverage, and actual rendering before shipping.

| Family | CSS `font-family` | Choose it when | Watch for |
| --- | --- | --- | --- |
| Pretendard Variable | `"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif` | A Korean-first product needs broad weights, compact UI rhythm, and balanced mixed-script text. This is the strongest general product starting point. | Variable and static files can differ by release. Test weight interpolation and fallback wraps. |
| Pretendard | `Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif` | Static files or CDN subsets are easier to cache than one variable file, or older browser support matters. | Request only shipped weights. Too many static weights erase the request-count advantage. |
| SUIT Variable | `"SUIT Variable", SUIT, Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif` | Dense dashboards, admin tools, and compact controls need a clean, economical texture. | Its Latin and numerals can feel narrower than the Hangul. Test prices, IDs, and all-caps abbreviations. |
| Noto Sans KR | `"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif` | Coverage, language consistency, and predictable international fallback matter more than a distinctive product texture. | Full files can be heavy. Use official language subsets and inspect the relatively open spacing in dense UI. |
| Spoqa Han Sans Neo | `"Spoqa Han Sans Neo", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif` | A service needs friendly, readable Korean with stable Latin and numeral behavior in transactional copy. | Confirm license and hosting source. Compare its softer texture against the product's authority level. |
| System Korean | `-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif` | Fast first paint and platform familiarity outrank cross-platform visual identity. Good for internal tools and low-bandwidth surfaces. | macOS and Windows results differ materially. Never call this a single visual treatment. |

Don't pair Hangul with a fashionable Latin face by name alone. Compare x-height, stroke weight, width, baseline, punctuation, and numeral texture in mixed strings such as `API 요청 1,234건`, `v2.6 업데이트`, and `2026. 9. 26.`. One family is usually calmer. Add a separate Latin face only when the mixed-script specimen proves a useful distinction and every fallback path remains coherent.

Avoid decorative monospace outside code, logs, fixed-width identifiers, and data that truly benefits from alignment. A monospace eyebrow above every Korean heading is decoration, not hierarchy.

## Load fonts without trapping dynamic content

Prefer WOFF2. A variable WOFF2 can cover the used weight range in one request, but measure it against script-split static files. Preload only a file needed above the fold. Every preload must be used promptly or it wastes bandwidth.

```css
@font-face {
  font-family: "Pretendard Variable";
  src: url("/fonts/PretendardVariable.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
```

Use `font-display: swap` for product UI unless measured brand requirements justify another choice. Compare fallback and final wraps and measure layout shift. `optional` can avoid a late swap on slow links, but users may stay on fallback for that visit. `block` is rarely acceptable for task text.

Dynamic subsetting by `unicode-range` may split Latin, common Hangul, and less common Hangul into cacheable files. The browser fetches ranges as the text appears. Use a maintained publisher's range map or generate ranges from a complete supported corpus.

Never subset to only the glyphs in today's copy deck. User names, addresses, search results, imported records, notifications, and server errors are dynamic. A current-copy subset can pass a static screenshot and fail the first real account. Define the supported scripts and character ranges, then test uncommon syllables, jamo, symbols, and fallback.

## Role ranges

These are rendering ranges, not automatic tokens. Test each at 1280 by 900, 390 by 844, 320 CSS px, and 200 percent zoom.

| Role | Size | Line height | Letter spacing | Notes |
| --- | --- | --- | --- | --- |
| Display | 40 to 64px | 1.08 to 1.2 | -0.035em to -0.015em | Marketing only when the heading is the true anchor. |
| Page heading | 28 to 40px | 1.2 to 1.3 | -0.025em to -0.01em | Keep final Korean line from becoming one syllable. |
| Section heading | 20 to 28px | 1.25 to 1.4 | -0.02em to -0.005em | Use weight before excessive size jumps. |
| Body | 15 to 16px | 1.5 to 1.6 | -0.01em to 0 | Never add positive tracking to Korean body copy. |
| Compact body or control | 14 to 15px | 1.4 to 1.5 | -0.01em to 0 | Keep touch target size independent from type size. |
| Dense table | 13 to 14px | 1.4 to 1.45 | -0.005em to 0 | Use 13px only when density and display conditions support it. |
| Caption or metadata | 12 to 13px | 1.4 to 1.5 | 0 | 12px is the floor, not a target. |

Positive tracking breaks the joined visual rhythm of Hangul body text. Slight negative tracking can settle headings, but clipping, crowded punctuation, or closed counters means it went too far. Don't place labels below 12px.

Use `font-variant-numeric: tabular-nums` for columns of prices, quantities, times, and changing counters. Keep proportional numerals in prose and isolated values. Right-align numeric table cells and align decimal separators when the task calls for comparison.

## Three practical scales

### Dense product

| Role | Size / line height |
| --- | --- |
| Page title | 28px / 36px |
| Section title | 20px / 28px |
| Body | 15px / 23px |
| Control | 14px / 20px |
| Table | 13px / 18px |
| Caption | 12px / 17px |

Use for ERP, operations, analytics, and expert workflows. Density doesn't permit 10px labels or cramped controls.

### Reading product

| Role | Size / line height |
| --- | --- |
| Page title | 36px / 46px |
| Section title | 24px / 34px |
| Lead | 18px / 29px |
| Body | 16px / 26px |
| Secondary | 14px / 22px |
| Caption | 12px / 18px |

Use for help centers, reports, education, and content-heavy services. Keep Korean body measure near 35 to 55 full-width characters, then judge with real paragraphs.

### Marketing

| Role | Size / line height |
| --- | --- |
| Hero | 56px / 64px desktop, 36px / 44px mobile |
| Section title | 36px / 46px desktop, 28px / 36px mobile |
| Lead | 20px / 32px |
| Body | 16px / 26px |
| Action | 15px / 22px |
| Caption | 12px / 18px |

Use only when the page needs expressive hierarchy. Don't turn every product screen into a 56px slogan with tiny supporting text.

## Wrap by surface

`word-break: keep-all` keeps Korean words together. It suits display lines and readable prose when containers can accommodate real words. `word-break: normal` permits Korean character-based breaks under browser and language rules. It can be better for narrow data cells or long dynamic content where overflow is worse than a character break.

```css
.display-ko {
  word-break: keep-all;
  overflow-wrap: normal;
  text-wrap: balance;
}

.body-ko {
  word-break: keep-all;
  overflow-wrap: break-word;
  text-wrap: pretty;
}

.data-cell-ko {
  word-break: normal;
  overflow-wrap: anywhere;
}
```

Don't use `overflow-wrap: anywhere` on normal prose. It can split a familiar word into `결제완` and `료`, slowing recognition. Don't treat `keep-all` as a cure for narrow controls either.

Bad button at 88px: `배송지 변경` wraps as two lines and makes one action taller than its peers. Better: give the control a measured `min-width`, use `white-space: nowrap`, and shorten the label only if meaning survives. If space still fails, recompose the actions.

Bad navigation: `정기결제 관리` wraps while adjacent items stay on one line. Better: keep primary navigation on one line, set a width budget, and move lower-priority items into an explicit overflow menu. Truncate only when the full label is available by accessible name or nearby context and competing items remain distinguishable. Never truncate destructive actions or two labels that share the same visible prefix.

Use `text-wrap: balance` for short headings of two or three lines. Use `pretty` for supported browsers when it improves paragraph endings without hiding overflow. Neither property replaces testing at intermediate widths. A one-syllable final heading line is a failure even when CSS says `balance`.

## Punctuation, units, dates, and money

Use Korean punctuation consistently with the chosen voice and content type.

* Use `·` as a 가운뎃점 for compact peer items, such as `디자인·개발`, only when the relationship is truly coordinate. Don't use a keyboard period or a decorative row of dots.
* Keep question and exclamation marks rare in transactional UI. `삭제할까요?` is enough. `정말 삭제하시겠습니까?!` adds anxiety, not clarity.
* Use parentheses for necessary qualifiers, not to hide the main condition: `월 9,900원(부가세 포함)` is clear when tax status is secondary.
* Keep Latin product names and versions unbroken when possible: `Android 16`, `API v2`.

Money uses a thousands separator and no space before `원`: `1,234원`, `월 29,000원`. State tax and billing period where they change the decision. In tables, don't mix `1.2만 원`, `12,000원`, and `0.012백만원` in one column.

Use `만` and `억` abbreviations for scanning only when precision loss is acceptable: `조회 1.2만 회`, `매출 3.4억 원`. Give the exact value in details, export, or an accessible label when the decision needs it. Don't abbreviate invoices, transfers, or settlement amounts.

Numeric dates suit logs, tables, and official records: `2026. 9. 26.`. Korean month forms suit conversational reminders and marketing: `9월 26일`. Include the year when ambiguity matters. For time-sensitive actions, add the timezone or relative context: `2026. 9. 26. 오후 3:00 KST`. Don't mix date formats within one list.

Units take a consistent project rule. Compact product values commonly use `12GB`, `24px`, and `3분`. Keep a nonbreaking relationship where wrapping would separate the number from its unit. Spell out unfamiliar units in help copy.

## Do and don't

| Don't | Do | Why |
| --- | --- | --- |
| `처리가 완료되었습니다.` | `신청서를 보냈어요.` | Names the object and verified transition. |
| `₩ 1,234` beside `2만원` | `1,234원` beside `20,000원` | One format supports comparison. |
| 11px gray metadata | 12 to 13px with tested contrast | Small Korean counters close quickly. |
| `letter-spacing: .08em` on body | `letter-spacing: 0` | Positive tracking fragments Hangul rhythm. |
| Current-copy-only font subset | Script and range subsets for dynamic input | Real data contains unseen glyphs. |
| `keep-all` on an 80px button and hope | No-wrap label, measured minimum width, then recompose | Container policy owns control wrapping. |

## Pre-ship checklist

* The selected family, source, license, files, axes, and weights are recorded.
* Hangul, Latin, numerals, currency, dates, punctuation, jamo, and product symbols render without tofu or style jumps.
* Fallback and loaded font wraps are compared at 1280, 390, and 320 CSS px and at 200 percent zoom.
* Font loading doesn't hide task text, and measured layout shift is acceptable.
* Dynamic subset ranges cover user-generated and server-provided text. They aren't limited to current copy glyphs.
* Body is 15 to 16px unless a rendered task-specific reason supports another value. Captions and labels are at least 12px.
* Korean body text has no positive tracking.
* Tables and prices use tabular numerals where alignment helps comparison.
* Headings have no clipping, accidental orphan, or one-syllable final line.
* Buttons and navigation have an explicit no-wrap, width, overflow, and truncation policy.
* No label breaks inside a Korean word. This is a hard failure.
* Dates, money, units, and abbreviations follow one documented format per surface.
* The final production container, not only a neutral specimen, passes the same checks.
