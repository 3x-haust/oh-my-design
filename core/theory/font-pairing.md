# Font pairing for Korean + Latin pages

Typography reads as machine-default less because of the font names than because of how they are
used: one neutral sans at one density in every role, habitual numbers (64 / 16 / 14) applied without
looking, a fixed negative tracking on every Korean heading, weights the font does not have, and a
Latin fallback that owns the punctuation and the won sign by accident. A designer picks one or two
families with clear roles, proves the Korean–Latin mix on the real copy, uses only faces that exist,
and ships the files inside the project. This pack gives verified starting points for that; it does not
replace looking at the rendered page.

Only fonts free of licence restrictions are used: SIL Open Font License 1.1, which allows commercial
use, web embedding and shipping the files inside a project at no cost. Its only duties are to keep the
licence text beside the files and not to sell the font files on their own. A font with extra clauses,
"free for personal use" terms, an unconfirmed licence or a licence that limits redistribution or
subsetting is not used, however good it looks or however freely a CDN serves it.

Researched 2026-10-20 from the fonts' own licences, registries and files, the KRDS, Wanted Montage and
Karrot SEED typography tokens, and live computed styles of eight Korean services. Re-check the licence
file of the exact version you ship.

## Bundle-ready fonts

| Font | Licence | Install / self-host | Weights | Hangul coverage | Role |
| --- | --- | --- | --- | --- | --- |
| Pretendard | OFL-1.1 | `pretendard` (npm) → `dist/web/variable/woff2/PretendardVariable.woff2` or static faces | 100–900, variable | 11,172 | General product UI and body; Latin is Inter-derived |
| SUIT | OFL-1.1 | `@sun-typeface/suit` | 100–900, variable | **2,668** | Light UI and dashboards; always add a full-Hangul fallback for user text |
| Spoqa Han Sans Neo | OFL-1.1 | `spoqa-han-sans` (use the package's local CSS) | 100/300/400/500/700 | 11,172 (original set) | Number-heavy SaaS |
| NanumSquare Neo | OFL-1.1 | official ZIP/WOFF2 | 350–900, variable | 11,172 | Product headings and cards |
| IBM Plex Sans KR | OFL-1.1 | `@ibm/plex-sans-kr` | 100–700 | 11,172 | Technical products, documentation |
| Noto Sans KR / Noto Serif KR | OFL-1.1 | `@fontsource-variable/noto-sans-kr`, `…/noto-serif-kr` | 100–900 / 200–900 | 11,172 | Multilingual body; serif for editorial (large payload) |
| MaruBuri | OFL-1.1 | official 2023 WOFF2 from hangeul.naver.com (not the older static web files, which miss syllables) | 400/700 used | 11,172 | Long-form reading on screen |
| Gowun Batang | OFL-1.1 | `@fontsource/gowun-batang` | 400/700 | 11,172 | Warm body text and quiet headings |
| Hahmlet | OFL-1.1 | upstream webfonts or `@fontsource/hahmlet` | 100–900, variable | **2,788** | Expressive display only, with a full-Hangul fallback |
| Black Han Sans | OFL-1.1 | `@fontsource/black-han-sans` | 400 only | **2,581** | One- or two-line campaign titles only |
| Inter | OFL-1.1 | `inter-ui` | 100–900, `opsz` | Latin | Explicit Latin and figures beside a Korean face |
| Geist | OFL-1.1 | `geist` | 100–900 | Latin | Product names and English headings in developer tools |
| Instrument Serif | OFL-1.1 | `@fontsource/instrument-serif` | 400 + italic | Latin | Large English display and quotes; never body, never faux bold |
| Fraunces | OFL-1.1 | upstream 4-axis variable file | `wght`, `opsz`, `SOFT`, `WONK` | Latin | Expressive English display |

Excluded, do not use: Toss Product Sans (no external licence), Satoshi and General Sans (licence limits
redistribution and subsetting), Gmarket Sans and Paperlogy (clauses beyond OFL), Wanted Sans (its
reserved-name notices disagree between files). A public CDN or a "free" label is not a licence. A font
outside this table may be used only after confirming its shipped licence file is OFL-1.1.

## Pairings

| Pairing | Use it for | Start | Avoid when |
| --- | --- | --- | --- |
| Pretendard alone | Most product UI and general landings | display 700 / 48–72 / lh 1.2 / tracking 0 → compare −0.01…−0.03em; body 400 / 16 / 1.6 | You need a voice the copy cannot carry; then add one display face, not a second sans |
| Pretendard + Inter | Korean extension of an existing Inter product; Inter owns Latin and figures | KO H 700/48/−.02em/1.25; EN H 600/52/−.02em/1.15 | Only to have "two fonts" — Pretendard's Latin is already Inter-based |
| SUIT + Geist | Developer tools; SUIT Korean body and forms, Geist product names and English headings | SUIT H 700/44/−.015em; Geist H 600/48/−.025em; UI 500/14 | User-entered text set in SUIT alone |
| Pretendard + Noto Serif KR | Brand or education pages with real explanation; Pretendard headings and UI | H 700/48/−.02em/1.25; serif body 400/18/1.75 | Dense admin screens |
| Noto Serif KR + Noto Sans KR | Culture, publishing, multilingual information | serif H 600/44/−.01em/1.3; sans body 400/16/1.625 | Preloading every slice and weight |
| MaruBuri + Pretendard | Articles, interviews, brand stories; Pretendard for headings and UI | Maru body 400/18/1.8; Pretendard H 700/40/−.02em | Small UI in MaruBuri; the old incomplete web files |
| Hahmlet + SUIT | Culture and creative services; Hahmlet display, SUIT body | Hahmlet H 600/48/−.01em; SUIT body 400/16 | Arbitrary names or user text in Hahmlet |
| Gowun Batang + Pretendard | Warm education or community brands; Pretendard for calls to action and prices | Gowun H 700/36/0/1.4; body 400/18/1.8 | Requesting Gowun 500/600 |
| Black Han Sans + Spoqa Han Sans Neo | Short, loud events and promotions | Black H 400/56/−.01em/1.2 | Long headlines; copy not checked against its glyph set |
| Instrument Serif + Pretendard | Studios and portfolios; English display and italic accents | EN H 400/72/−.01em/1.05; KO H 600/40/1.3 | Small English body; faux 700 |
| Fraunces + SUIT | Consumer and creative products; English display | Fraunces 600/64/1.1, `opsz` auto, compare `WONK` 0/1 | Requesting axes the shipped file lacks |

Pairings to avoid: rotating Pretendard, SUIT and Spoqa Han Sans Neo across one role (only adds metric
noise); pairing a Korean serif and a Latin serif by name alone; habitual −0.04em on SUIT body;
squeezing a mobile heading onto one line with extreme negative tracking; leaving ₩, brackets and the
middle dot to whichever family happens to be first.

## Roles and starting values

Korean services do not share one scale: marketing heroes run 54–90px (Toss, Kakao, Channel Talk) while
commerce and job homes set their first working title at 20–22px; tracking is normal, negative and small
positive across them. Start from the role and the real copy, then judge the screenshot.

| Role | Start | Check |
| --- | --- | --- |
| Korean display | desktop 48–72, mobile 30–40; 600–750; lh 1.15–1.3; tracking 0, then compare −0.01…−0.03em | Real two- and three-line copy, mobile breaks (`word-break: keep-all`) |
| Section heading | desktop 28–40, mobile 24–30; 600–700; lh 1.25–1.45 | Separated from body by space and density, not size alone |
| Product body | 16–18; 400; lh 1.5–1.7; tracking 0 | Real mixed line length, 200% zoom |
| Serif long form | 17–19; 400; lh 1.65–1.85 | Thin strokes on long paragraphs and dark grounds |
| Buttons, fields, UI | 14–16; 500–600; lh 1.4–1.6 | Long Korean labels, weights that exist |

## Mixing Korean, Latin and figures

1. Fix the Korean body size and line height first.
2. Render `가나다 ABC xyz 0123 ₩19,800 (VAT 포함)` on one line and compare x-height, cap and figure
   height, average density and baseline.
3. Adjust the Latin face's size and weight slightly; correct the baseline last, if at all.
4. Decide which family owns brackets, quotes, the middle dot, colon, %, ₩ and backslash.
5. For prices and tables, confirm the shipped file supports `tnum`, then use
   `font-variant-numeric: tabular-nums`.

A family list like `Inter, Pretendard` only falls back per character; it is not a role contract. Give
roles explicitly with classes, `lang`, or a verified Latin `unicode-range` on the Latin face.

## Ship the files, not a CDN link

Install the font package or download the official file, copy the WOFF2 into the project (for example
`public/fonts/<font>/<version>/`), keep its licence file beside it, and declare `@font-face` with local
URLs. Pages are verified offline, and a runtime CDN request fails the first-render check.

```css
@font-face {
  font-family: "Product KO";
  src: url("/fonts/pretendard/1.3.9/PretendardVariable.woff2") format("woff2");
  font-weight: 45 920;
  font-display: swap;
}
@font-face {
  font-family: "Product Latin";
  src: url("/fonts/inter-ui/4.1.1/InterVariable.woff2") format("woff2");
  font-weight: 100 900;
  font-display: swap;
  unicode-range: U+0000-024F, U+0300-036F, U+1E00-1EFF, U+2000-206F, U+20A0-20CF;
}
:root { font-family: "Product Latin", "Product KO", system-ui, sans-serif; font-synthesis: none; }
.numeric { font-variant-numeric: tabular-nums; }
```

- Request only weights and styles the files contain, and set `font-synthesis: none` so a missing face
  is visible rather than faked.
- A variable file is not automatically smaller: Pretendard Regular + Bold (≈1.56 MB) is lighter than the
  variable file (≈2.06 MB) when only two weights are used.
- `unicode-range: U+AC00-D7A3` on a 2,350-syllable file does not make it complete; pair partial-coverage
  display faces with a full-Hangul fallback and check the actual headline copy before building.
- Preload at most the one face the first screen needs.

## Machine-default versus designed

| Machine-default | Designed |
| --- | --- |
| One neutral sans in every role at one density | Display, body and UI separated by size, weight and space before adding a family |
| 64 / 16 / 14 everywhere | Role tokens chosen for the copy and surface, judged in the screenshot |
| −0.04em on every Korean heading | Tracking starts at 0 and is compared on the real font and size |
| Same px and weight for Korean and Latin, called "aligned" | The mixed line compared for x-height, density, figures and symbols |
| Faux 600 or italic from the browser | Shipped weights only, `font-synthesis: none` |
| A CDN link treated as a licence | Files, licence and version inside the project |
| Beautiful headline, default buttons and tables | Headline, body, controls and figures checked as one system |

A good type proof does not make the page hierarchy good: the focal hierarchy and composition are
reviewed separately.
