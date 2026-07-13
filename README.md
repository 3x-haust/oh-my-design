<div align="center">

<h1>oh-my-design</h1>

**Design like a person, not like the mean of the training set.**

<p>
<a href="https://github.com/3x-haust/oh-my-design/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/3x-haust/oh-my-design?style=flat-square" /></a>
<a href="https://github.com/3x-haust/oh-my-design/releases"><img alt="Release" src="https://img.shields.io/github/v/release/3x-haust/oh-my-design?style=flat-square" /></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" /></a>
<img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A522.18-brightgreen?style=flat-square" />
</p>

<a href="#-what-is-this">What is this?</a>
·
<a href="#-install">Install</a>
·
<a href="#-skills">Skills</a>
·
<a href="#-the-slop-linter">The slop linter</a>
·
<a href="./README.ko.md">한국어</a>

<br />

</div>

<hr />

> [!NOTE]
> **Every AI-generated landing page since 2023 looks the same: indigo gradient, three identical cards, a rocket emoji in the heading. `omd` turns that into a lint error.**

## 💤 What is this?

In [DesignPref](https://arxiv.org/abs/2511.20513), twenty professional designers made 12,000 pairwise UI judgements. Their agreement came to **Krippendorff's α = 0.248**. There is no universal reward function for "good design," so a model optimised for average taste produces anonymous output *as a logical consequence of its objective*, not as a bug.

`omd` is a design skill for Claude Code and Codex. It does not try to be a better model. It runs the loop a human designer runs, and it turns the parts a model gets wrong into things a machine can measure.

> Think ESLint, but the rule set is "this looks AI-generated," and every rule can be overruled with a written reason.

Five things it does that a raw prompt cannot:

1. **Detect the mean.** Slop is checkable. Deterministic rules fire on correct, anonymous work and stay quiet on work that has a position.
2. **Force a point of view.** A concept metaphor filters every decision — a trustworthy accountant does not bounce; a 3am convenience store does not leave whitespace.
3. **Learn from real things, safely.** Measurements go in, pixels never. A model shown a screenshot reproduces it; a model handed the numbers learns from them.
4. **Look at what actually rendered.** Contrast ratios, hit areas, and motion timings are computed from a headless browser, never estimated.
5. **Ground the work in research.** Colour, type, layout, motion, and UX decisions cite a built-in theory pack before they are made.

## 🚀 Install

`omd` runs on two hosts. One installer covers both — it detects `~/.claude` and `~/.codex`, copies the plugin into each, and patches the config:

```bash
oh-my-design install
```

`oh-my-design uninstall` reverses exactly what it did and never touches your `.omd/` records. Target one host with `--host codex`.

Each host also has its own marketplace, if you prefer that route:

**Claude Code**

```
/plugin marketplace add 3x-haust/oh-my-design
/plugin install omd@oh-my-design
```

Skills arrive with a `/` prefix — `/oh-my-design:ultradesign`, `/oh-my-design:scout`.

**Codex**

```
codex plugin marketplace add 3x-haust/oh-my-design
```

Then open `/plugins` to install `oh-my-design`. Skills arrive with a `$` prefix — `$oh-my-design:ultradesign`, `$oh-my-design:scout` — and the pipeline agents inherit the model selected for the session. (The marketplace manifest ships and matches Codex's plugin spec; the `oh-my-design install` path is the one verified end to end.)

Both hosts need Node ≥ 22.18, and the first `omd render` pulls headless Chromium through Playwright on its own. The `omd` CLI is identical everywhere — `omd check`, `omd render`, `omd pack` do not care which host called them. Confirm a healthy setup with:

```bash
omd doctor
```

One line per check: Node, Playwright, the browser binary, `.omd/` write access, the theory pack. Every `oh-my-design:ultradesign` run does this first, so a broken setup fails in the first second instead of at step five.

## ⚡ Skills

| Skill | Type this | What happens |
| --- | --- | --- |
| `oh-my-design:ultradesign` | "디자인해줘", "redesign this", "landing page, make it stunning" | The whole loop, end to end, with no approval prompts. You get a working site and a written record of every decision and why. |
| `oh-my-design:figma` | paste a figma.com link, "피그마 그대로 구현해줘" | Pulls the file, synthesizes the design system, builds each frame against an iterative pixel-diff loop, matches responsive pairs, and ships with a fidelity report. |
| `oh-my-design:scout` | "레퍼런스 수집해줘", "how do good sites do X" | A measured reference board: whole pages, single components, typography, motion, community threads, and how real products *write*. It designs nothing. |
| `oh-my-design:critique` | "비평해줘", "why does this feel wrong" | Reviews a design without touching it. Runs the linter, groups findings by root cause, and judges against the project's own concept rather than taste. |
| `oh-my-design:humanize` | "AI티 빼줘", "de-robot this copy" | Strips Korean and English AI prose tics — translation-ese, mechanical enumeration, stock phrases, uniform rhythm — without changing a single fact. |
| `oh-my-design:coach` | "내가 뭘 반복해서 틀리지?" | Reads your check history: what keeps recurring, what improved, what to study. It refuses to invent trends from thin data. |

## 🔁 The pipeline

`oh-my-design:ultradesign` runs a human design loop in order. Human checkpoints default to off;
`concept`, `structure`, or both can be opted into per project.

```
 FRAME -> CONCEPT -> RESEARCH -> WRITER -> COPY CHECK -> BLIND COPY EDIT -> COPY CHECK
       -> ISOLATED SKETCHES -> BLIND PICK
       -> BUILD + 2 CRAFT CHECKPOINTS -> SQUINT GLANCE -> SAFE PROBE
       -> BLIND CRITIQUE -> REFRAME -> SHIP
```

Seven agents have narrow boundaries. `oh-my-design:framer` interrogates the brief, `oh-my-design:scout`
builds evidence coverage, `oh-my-design:writer` owns the fact-linked copy deck, an independent eye
edits it before structure, and isolated `oh-my-design:sketch` contexts explore structure with the real
copy deck, `oh-my-design:hand` builds once and records what two intermediate renders changed,
`oh-my-design:glance` sees only blurred grayscale hierarchy, and `oh-my-design:eye` selects or critiques in
a fresh context without rationale. Interactive work follows an explicit local-only probe
plan; it never auto-clicks discovered controls or touches production.

Stack routing is deterministic: an explicit user request wins, otherwise the existing repository
stack and surfaces are preserved, and only a truly blank greenfield defaults to React + Vite +
TypeScript. Plain HTML greenfield requires an explicit request.

Along the way, four things separate the output from a generic build:

- **The scout refuses AI-generated references.** Every capture runs through the same slop linter the build will face. Two or more findings bars a page from the board, and a rejected capture obliges a replacement search, so the board is made of what *passed*, not of what was available. Kinship detection drops reference pairs that score ≥ 0.85 against each other — pages that similar carry the same average.
- **The eye sees motion, not just a screenshot.** `omd render --filmstrip` captures the first seconds as frames, and a live probe reads `document.getAnimations()` during load and scroll, so entrance timing and scroll choreography become numbers. The hand writes a motion spec first, and an animation that is not in the spec does not ship.
- **Motion, composition, and graphics come from a cookbook, not improvisation.** Twelve motion recipes, eight page compositions, six graphics treatments — each with working code, a condition clause, and slots the board's measurements fill. Improvisation converges on the mean; parameterising a vetted recipe does not.
- **Every token has a paper trail.** `.omd/attribution.md` maps each token group to the reference or theory entry it came from, and `omd check` audits it: a colour nobody can source is a finding, not a vibe.

## 🧹 The slop linter

`omd check` computes contrast, hit areas, spacing, and token coverage — and **slop**, the signature of work that converged on the mean. Twenty-one rules, all warnings rather than errors, because each can be wrong about a deliberate choice; overruling one takes a written reason. They fall in two families.

**Colour, surface, and layout** — the machine-default aesthetic, measured:

| Rule | Catches |
| --- | --- |
| `SLOP-GRADIENT` | The indigo→violet gradient, matched by hue band rather than a hex blocklist |
| `SLOP-GRADIENT-TEXT` | Gradient headline text — hierarchy faked with `background-clip` instead of scale |
| `SLOP-RADIUS-MONOCULTURE` | One corner radius everywhere: no material hierarchy |
| `SLOP-NESTED-RADIUS` | Corners that don't nest — inner radius should be outer minus padding |
| `SLOP-SHADOW-MONOCULTURE` | One shadow repeated: if everything floats, nothing floats |
| `SLOP-OVERSIZED-SHADOW` | A 40px+ blur on a small element — elevation as decoration |
| `SLOP-GLASSMORPHISM` | Max radius plus `backdrop-blur` translucency: depth by blur, not structure |
| `SLOP-EVERYTHING-CENTERED` | Centring as a default instead of as emphasis |
| `SLOP-TRIPLE-CARD` | Three identical cards, or an all-caps stat grid: nobody decided what matters most |
| `SLOP-NESTED-CARDS` | Cards inside cards inside cards: one surface per region |
| `SLOP-MONO-SPACING` | One gap everywhere: space by relationship, not by habit |
| `SLOP-FLAT-TYPE` | A whole UI between 14 and 18px: a scale with no contrast |
| `SLOP-BADGE-SPAM` | "Beta / New / Hot" pills in the chrome |
| `SLOP-FAKE-STAT` | The invented stat row, `10k+ / 99.9% / 24/7`, with no source |
| `SLOP-EMOJI-HEADING` | An emoji doing the job typography failed to do — in a heading or a button |

**Copy** — where generated work confesses first:

| Rule | Catches |
| --- | --- |
| `SLOP-COPY` | "Unlock the power of…", "it's not just X, it's Y" — copy that fits any product |
| `SLOP-COPY-KO` | Korean AI-prose tells: the comma after a connective, structural openers, 첫째/둘째 enumeration |
| `SLOP-KO-EMDASH` | The spaced em-dash inside Korean copy, a translation punctuation import |
| `SLOP-KO-REGISTER-MIX` | 해요체 and 합니다체 drifting inside one paragraph |
| `SLOP-KO-SIGNPOST` | Copy that narrates document structure ("아래는 그 기록이에요") |
| `SLOP-PINK-ELEPHANT` | Told "no clutter", a model writes *"No clutter here."* — self-negating meta-copy |
| `SLOP-LEAKED-RATIONALE` | Five consecutive words shared between page copy and the design notes |

Beyond slop, the same engine audits what a prompt alone cannot enforce:

| Family | Catches |
| --- | --- |
| `MOTION-*` | Animation with no `prefers-reduced-motion`, layout-property thrash, the uniform 500ms-ease-in-out signature, a spec that promises motion the render never shows |
| `UX-*` | Two buttons both claiming top billing on one screen; the only interactive control is entirely below the fold at mobile viewport; every interactive element has `tabindex="-1"` (no keyboard path); frame not UX-interrogated (`FRAME-UX-INCOMPLETE`) |
| `DESIGN-*` | A `.omd/design.md` missing required sections; a form with no error-state affordance (class name, text copy, `role=alert`, or `aria-invalid`) |
| `ATTR-*` | Token groups shipped without a source in `.omd/attribution.md` |
| `SITE-*` | Cross-page drift: one page on a 4-step type scale, another on 6 (`omd check --site`) |
| `FOCUS-*` | Tab stops with no visible focus indicator, probed live |

Calibrated against real work: the rules fire on a fixture that is *correct, accessible, and anonymous*, stay silent on the same content with a point of view, and do not flag linear.app. `omd check` exits 1 on findings, so it doubles as a **design linter in CI**.

## 📚 Theory pack

A colour is a claim about the product; the theory pack is where that claim finds its evidence. Nine files ship at `core/theory/`, each written as condition → choice → reason with named sources — Elliot & Maier, Bringhurst, Müller-Brockmann, Nielsen, NN/g, Baymard:

| File | What it answers |
| --- | --- |
| `color.md` | Domain colour conventions and why they exist; harmony schemes; 60-30-10; saturation as a register signal; dark-mode desaturation |
| `typography.md` | Scale ratios and what each says; pairing theory; Korean typography — 한글 line-height, 국·영 혼용, Pretendard vs Noto criteria |
| `layout.md` | Gestalt as UI decisions; hierarchy tool priority; form research; empty, loading, and error states; information density |
| `motion.md` | Duration thresholds from perception research; easing semantics; choreography; skeleton vs spinner evidence |
| `components.md` | Button hierarchy ceilings, validation timing, navigation, tables, modals and their alternatives, toasts, search |
| `craft.md` | What theory books skip: layered shadows, borderless separation, opacity-tier text, optical alignment, 60fps-safe properties |
| `expressive.md` | Award-site anatomy: the Awwwards rubric weights usability over creativity even there; scroll as narrative; the technique catalogue and its restraint clause |
| `ux.md` | Task-first framing; navigation and flow; feedback and the Doherty threshold; cognitive load and progressive disclosure; first-run and empty states; peak-end shaping; Nielsen's heuristics as checkable questions |
| `voice.md` | How human web copy actually reads: sentence-length variance, front-loading, one register, the review-mining move — calibrated against a measured human baseline |

The concept step reads these before committing to a direction. The hand cites them whenever the reference board does not cover a decision — an uncited choice is a finding.

## 📐 The design contract

For anything past a single page, `omd design` writes `.omd/design.md` — a persistent, fourteen-section contract that governs every surface: brand personality, product goals, personas, information architecture, design principles, visual language, component inventory, accessibility targets, responsive breakpoints, **interaction states (loading / empty / error / success / disabled / offline)**, content voice, implementation constraints, and open questions. Evidence already in the repo — `package.json`, token files, `.omd/frame.md`, `.omd/refs/` — is scanned and pre-filled; whatever cannot be answered becomes an explicit open question rather than an invented value.

`omd check` validates the contract when it exists. `DESIGN-INCOMPLETE` fires for missing sections and for an interaction-states section that lists no states, and a form with no error state fires `DESIGN-FORM-NO-ERROR` on its own.

## 🏗 Architecture

```
src/
  agents/                  source of truth: framer, scout, writer, sketch, hand, glance, eye
  skills/                  source of truth: ultradesign, figma, scout, critique, humanize, coach
core/
  theory/                  the 9-file theory pack
  motion/                  12 motion recipes + an easing vocabulary
  composition/             8 page-level composition recipes
  graphics/                6 CSS-only graphics treatments
  craft/                   the finish-pass checklist
  protocol/                phase order, copy schema, evidence, blindness, and probe contract
  config/ craft/ probe/    checkpoint config, craft records, safe interaction runner
  design/                  the design contract + interaction-state rules
  copy/                    pure copy-deck structure and fact-reference validator
  ref/                     reference measurement, blueprints, kinship, signal + slop scoring
  render/                  headless Playwright: render, filmstrip, motion/hover/focus probes
  rules/                   the linter engine + builtin rules (slop, motion, ux, a11y, tokens)
  figma/                   file pull, design-system synthesis, pixel-diff, responsive matching
  target/                  the general visual-target loop (any mockup, screenshot, or URL)
  site/                    cross-page drift comparison
  install/                 host detection + config patching for Claude and Codex
adapters/build.ts          generates agents/, skills/, dist/, and both marketplace manifests from src/
evals/                     plugin eval cases + rubric graders
scripts/bump.ts            one command, every manifest, zero drift
.omd/                      per-project design record
  frame.md                 the problem as currently understood
  copy-deck.md             real copy and representative data before structure
  design.md                the multi-surface design contract
  decisions.md             why there is no green in this product
  attribution.md           which reference each token came from
  motion-spec.md           what moves, when, and on whose authority
  refs/*.json              measured references + written principles
  history.jsonl            every check run — what oh-my-design:coach reads
  probes/*.json            durable non-destructive interaction plans
  .cache/                  disposable renders, sketches, IR, filmstrips, probe results
```

`npm run build` regenerates `agents/`, `skills/`, `dist/`, and both hosts' manifests from `src/`. Never edit the generated directories.

## ⌨️ CLI

```
omd design                                     scan repo evidence, create/refresh .omd/design.md
omd design --check                             validate design.md section coverage
omd copy   --check [--json]                    require a non-empty, traceable copy deck
omd check  <page> [--json] [--viewport WxH]    lint: a11y, tokens, motion, ux, slop. exit 1 on findings
omd check  --site <dir>                         cross-page ladder and token drift
omd render <page> -o shot.png [--filmstrip|--squint] screenshot, motion frames, or hierarchy isolation
omd probe  <page> [--plan path] [--json]         declared safe path; local files/loopback only
omd ir     <page>                               rendered DOM → measured node tree
omd ref    add|list|show|principles|distance    the reference board (slop-scored at capture)
omd frame  set|show|reframe|generator           the problem record — nobody signs it; the loop rewrites it
omd decision "what" --why "why"                 the reasons file your successor will thank you for
omd taste record|profile [--all]                 explicit-user taste by default; agent/legacy excluded
omd config set checkpoint none|concept|structure|both
omd craft checkpoint|status                      real-content reflection-in-action records
omd figma  pull|system|diff                     Figma file → snapshot → design system → pixel-diff loop
omd target set|diff|list                        converge a build toward any mockup, screenshot, or URL
omd pack   dir|list                             where the theory and recipe packs live (host-neutral)
omd doctor                                      environment preflight
omd coach                                       recurring weaknesses, honest trends
```

## 📄 License

MIT
