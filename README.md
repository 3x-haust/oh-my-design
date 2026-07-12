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
> **Every AI-generated landing page since 2023 looks the same: indigo gradient, three identical cards, a rocket emoji in the heading. `omd` makes that a lint error.**
>
> ```
> /plugin marketplace add 3x-haust/oh-my-design
> /plugin install omd@oh-my-design
> ```

## 🚀 Install

In Claude Code:

```
/plugin marketplace add 3x-haust/oh-my-design
/plugin install omd@oh-my-design
```

Skills appear namespaced as `omd:ultradesign`, `omd:scout`, and so on. Requires Node ≥ 22.18; the first `omd render` installs headless Chromium via Playwright on its own.

### Verify it worked

```bash
omd doctor
```

One line per check — Node version, Playwright, browser binary, `.omd/` writability, theory pack. `omd:ultradesign` runs this quietly before every loop, so a broken environment fails in second one, not step five.

### Uninstall

```
/plugin uninstall omd@oh-my-design
```

## ⚡ Skills

| Skill | Type this | What happens |
| --- | --- | --- |
| `omd:ultradesign` | "디자인해줘", "redesign this", "landing page, make it stunning" | The whole loop, end to end, zero approval prompts. You get a working site plus a written record of every decision and why. |
| `omd:figma` | paste a figma.com link, "피그마 그대로 구현해줘" | Pulls the file, synthesizes the design system, builds each frame with an iterative pixel-diff loop, matches responsive pairs, ships with a fidelity report table. |
| `omd:scout` | "레퍼런스 수집해줘", "how do good sites do X" | A measured reference board — whole pages, single components, typography, motion, community threads, and how real products *write* — without designing anything. |
| `omd:critique` | "비평해줘", "why does this feel wrong" | Reviews a design without touching it. Runs the linter, groups findings by root cause, judges against the project's own concept — not against taste. |
| `omd:humanize` | "AI티 빼줘", "de-robot this copy" | Strips Korean and English AI prose tics — translation-ese, mechanical enumeration, stock phrases, uniform rhythm — without changing a single fact. |
| `omd:coach` | "내가 뭘 반복해서 틀리지?" | Reads your check history: what keeps recurring, what improved, what to study. Refuses to invent trends from thin data. |

## Use the loop

### 1. "디자인해줘" runs the entire loop

Frame → concept → references → build → look → reframe. No approval gates, no "shall I proceed?". The skill interrogates your brief first — the largest measured gap between novice and expert designers is that experts doubt the problem before solving it — then commits to one concept metaphor and builds toward it. Everything lands in `.omd/`: the frame, the decisions, the reasons.

### 2. The scout measures real sites — and refuses AI-generated ones

References are captured as **measurements, never screenshots**: spacing ladders, type scales, motion durations, easing vocabularies. Shown a picture, a model reproduces it (Jansson & Smith, 1991); fed the numbers, it learns from it.

And because a growing share of the web is itself AI-generated, every capture passes through the same slop linter the build will face. Two or more findings bars a page from the board — a rejected capture obliges a replacement search, so the board is made of what *passed*, not of what was available. Kinship detection flags reference pairs that score ≥ 0.85 against each other: pages that similar carry the same average.

### 3. The eye sees motion, not just a screenshot

A static PNG cannot tell a dead page from a choreographed one. `omd render --filmstrip` captures the first seconds as a frame strip; a live probe reads `document.getAnimations()` during load and scroll, so entrance timing and scroll choreography become numbers. The hand writes a motion spec before building — an animation that is not in the spec does not ship.

### 4. Every token has a paper trail

`.omd/attribution.md` maps each design token group to the reference or theory entry it came from, and `omd check` audits it: a colour that nobody can source is a finding (`ATTR-MISSING`), not a vibe.

<hr />

## 💤 What is this?

In [DesignPref](https://arxiv.org/abs/2511.20513), twenty professional designers made 12,000 pairwise UI judgements. Their agreement: **Krippendorff's α = 0.248**. There is no universal reward function for "good design" — so a model optimised for average taste produces anonymous output *as a logical consequence of its objective*, not as a bug.

> Think ESLint, but the rule set is "this looks AI-generated" — and every rule can be overruled with a written reason.

Asking for a better model misses the point. What is buildable instead:

1. **Detect the mean.** Slop is checkable — deterministic rules that fire on correct, anonymous work and stay silent on work with a position.
2. **Force a point of view.** A concept metaphor filters every decision: a trustworthy accountant does not bounce; a 3am convenience store does not leave whitespace.
3. **Learn from real things, safely.** Measurements in, pixels never.
4. **Look at what actually rendered.** Contrast ratios, hit areas, and motion timings are computed, never estimated.
5. **Ground colour and type in theory.** The concept step reads a built-in theory pack and runs domain research before committing — the decision carries a citation, not a preference.

## 🔁 The pipeline

```
                         ┌──────────────────────────────────────────────┐
                         │                                              ▼
  ① FRAME ──▶ ② CONCEPT ──▶ ③ REFERENCE ──▶ ④ COMMIT ──▶ ⑤ BUILD ──▶ ⑥ SEE ──▶ ⑦ REFRAME
   doubt        read theory   omd-scout        one            omd-hand    render      what
   the brief    + domain      measures         structure,     + motion    filmstrip   you saw
                research      real things      cost named     spec        + measure   rewrites
                                                                                      the frame
```

Four agents, deliberately firewalled: `omd-framer` interrogates the brief, `omd-scout` measures references, `omd-hand` builds the one committed structure, and `omd-eye` critiques in a fresh context — it never sees the reasoning that produced the work, so it cannot defend it.

## 🧹 The slop linter

`omd check` computes contrast, hit areas, spacing, token coverage — and **slop**, the signature of work that converged on the mean. Every slop rule warns rather than errors, because each can be wrong about a deliberate choice; overruling one requires a written reason.

| Rule | Catches |
| --- | --- |
| `SLOP-GRADIENT` | The indigo→violet gradient — matched by hue band, not a hex blocklist |
| `SLOP-RADIUS-MONOCULTURE` | One corner radius everywhere: no material hierarchy |
| `SLOP-SHADOW-MONOCULTURE` | One shadow repeated — if everything floats, nothing floats |
| `SLOP-EVERYTHING-CENTERED` | Centring as a default instead of as emphasis |
| `SLOP-EMOJI-HEADING` | An emoji doing the job typography failed to do |
| `SLOP-TRIPLE-CARD` | Three identical feature cards: nobody decided what matters most |
| `SLOP-COPY` | "Unlock the power of…" — copy that fits any product says nothing about this one |
| `SLOP-COPY-KO` | Korean AI-prose tells: the comma after a connective, structural openers, 첫째/둘째 enumeration |
| `SLOP-PINK-ELEPHANT` | Told "no clutter", a model writes *"No clutter here."* — self-negating meta-copy |
| `SLOP-LEAKED-RATIONALE` | Five consecutive words shared between page copy and the design notes |

Beyond slop, the same engine audits what prompts alone cannot enforce:

| Family | Catches |
| --- | --- |
| `MOTION-*` | Animations with no `prefers-reduced-motion`, layout-property thrash, the uniform 500ms-ease-in-out signature |
| `ATTR-*` | Token groups shipped without a source in `.omd/attribution.md` |
| `SITE-*` | Cross-page drift: one page on a 4-step type scale, another on 6 (`omd check --site`) |
| `FOCUS-*` | Tab stops with no visible focus indicator, probed live |

Calibrated against real work: the rules fire on a fixture that is *correct, accessible, and anonymous*, stay silent on the same content with a point of view, and do not flag linear.app. `omd check` exits 1 on findings, so it doubles as a **design linter in CI**.

## 📚 Theory pack

A colour is a claim about the product; the theory pack is where that claim finds its evidence. Seven files ship at `core/theory/`, each written as condition → choice → reason with named sources — Elliot & Maier, Bringhurst, Müller-Brockmann, Nielsen, NN/g:

| File | What it answers |
| --- | --- |
| `color.md` | Domain colour conventions and why they exist; harmony schemes; 60-30-10; saturation as a register signal; dark-mode desaturation |
| `typography.md` | Scale ratios and what each says; pairing theory; Korean typography — 한글 line-height, 국·영 혼용, Pretendard vs Noto criteria |
| `layout.md` | Gestalt as UI decisions; hierarchy tool priority; form research; empty/loading/error states; information density |
| `motion.md` | Duration thresholds from perception research; easing semantics; choreography; skeleton vs spinner evidence |
| `components.md` | Button hierarchy ceilings, validation timing, navigation, tables, modals and their alternatives, toasts, search |
| `craft.md` | What theory books skip: layered shadows, borderless separation, opacity-tier text, optical alignment, 60fps-safe properties |
| `expressive.md` | Award-site anatomy — the Awwwards rubric weights usability over creativity even there; scroll as narrative; the technique catalogue with its restraint clause |

The concept step reads these before committing to a direction. The hand cites them whenever the reference board does not cover a decision — an uncited choice is a finding.

## 🏗 Architecture

```
src/
  agents/                  source of truth: framer, scout, hand, eye
  skills/                  source of truth: ultradesign, scout, critique, humanize, coach
core/
  theory/                  the 7-file theory pack (shipped into dist/)
  ref/                     reference measurement, kinship, signal + slop scoring
  render/                  headless Playwright: render, filmstrip, motion/hover/focus probes
  rules/                   the linter engine + builtin rules (slop, motion, a11y, tokens)
  site/                    cross-page drift comparison
adapters/build.ts          generates agents/, skills/, dist/, .mcp.json from src/
evals/                     plugin eval cases + rubric graders
scripts/bump.ts            one command, three manifests, zero drift
.omd/                      per-project design record
  frame.md                 the problem as currently understood
  decisions.md             why there is no green in this product
  attribution.md           which reference each token came from
  motion-spec.md           what moves, when, and on whose authority
  refs/*.json              measured references + written principles
  history.jsonl            every check run — what omd:coach reads
```

`npm run build` regenerates `agents/`, `skills/`, `dist/`, and `.mcp.json` from `src/`. Never edit the generated directories.

## ⌨️ CLI

```
omd check  <page> [--json] [--category slop] [--viewport WxH]   lint: a11y, tokens, motion, slop. exit 1 on findings
omd check  --site <dir>                                         cross-page ladder and token drift
omd render <page> -o shot.png [--filmstrip]                     headless screenshot, or the first seconds as frames
omd ir     <page>                                               rendered DOM → measured node tree
omd ref    add|list|show|principles|distance                    the reference board (slop-scored at capture)
omd frame  set|show|reframe|generator                           the problem record — nobody signs it; the loop rewrites it
omd decision "what" --why "why"                                 the reasons file your successor will thank you for
omd figma  pull <figma-url>                                     fetch + normalize a Figma file → .omd/figma/snapshot.json + responsive pairs
omd figma  system                                               extract design tokens + component inventory from snapshot
omd figma  diff <frame-id> <page> [--json]                      pixel-diff Figma export vs. build render; worst cells listed
omd doctor                                                      environment preflight (FIGMA_TOKEN checked when figma commands are used)
omd coach                                                       recurring weaknesses, honest trends
```

## 🪨 Honest limitations

- The loop's discipline is prompt-enforced; the *measurements* are code-enforced. A model can ignore advice — it cannot fake a contrast ratio.
- Slop rules are heuristics. A brand really can be violet. That is why they warn, and why overruling requires a written reason.
- The motion probe sees CSS and Web Animations; rAF-driven libraries (GSAP) are invisible to it, and the docs say so where it matters.
- Reference capture reads public pages in a real browser and stores **measurements and reasoning, never assets**. Respect the sites you study.
- Codex CLI support exists in-tree but is less battle-tested than the Claude Code path.

## 📄 License

MIT
