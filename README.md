# oh-my-design (omd)

**English** | [한국어](./README.ko.md)

**Make a coding agent design like a person — not like the mean of its training set.**

AI-generated interfaces are rarely broken. They are worse than broken: *correct and
anonymous*. The indigo-to-violet gradient. Three feature cards with identical shadows.
Everything centred. A heading that opens with a rocket emoji. "Unlock the power of."

None of that is a bug. It is what a model produces when it has no point of view — the
average of everything it has ever seen. `omd` exists to make that failure **measurable**,
and then to run the loop a human designer actually runs: doubt the brief, commit to a
concept, study real references, build once, look at what rendered, and let what you see
rewrite the problem.

```
① FRAME ─▶ ② CONCEPT ─▶ ③ REFERENCE ─▶ ④ COMMIT ─▶ ⑤ BUILD ─▶ ⑥ SEE ─▶ ⑦ REFRAME ─┐
   doubt      pick a       measure real    one          build      render &    what you saw │
   the brief  metaphor     things          structure,   it         measure     rewrites the │
      ▲                                    cost named                          problem      │
      └──────────────────────────────────────────────────────────────────────────────────┘
```

## Why "good design AI" is the wrong goal

In [DesignPref](https://arxiv.org/abs/2511.20513), twenty professional designers made
12,000 pairwise UI judgements. Their agreement: **Krippendorff's α = 0.248.** On more
than a quarter of comparisons they split almost completely. There is no universal reward
function for "good design" — so a model optimised for average taste produces exactly the
anonymous output above, *as a logical consequence of its objective*.

What is buildable instead:

1. **Detect the mean.** Slop is checkable. Seven deterministic rules.
2. **Force a point of view.** A concept metaphor filters every decision.
3. **Learn from real things, safely.** Measured references, not screenshots.
4. **Look.** Render headlessly, compute the numbers, never let the model guess.

## Install

As a Claude Code plugin (skills appear as `omd:ultradesign`, `omd:humanize`, …):

```
/plugin marketplace add 3x-haust/oh-my-design
/plugin install omd@oh-my-design
```

Requirements: Node ≥ 22.18. The first `omd render` installs headless Chromium via
Playwright.

## Skills

| Skill | What it does |
|---|---|
| `omd:ultradesign` | The whole loop, end to end, with zero approval prompts. Ask for a blog, get a blog — plus a written record of every decision and why. |
| `omd:humanize` | De-AI any text. Strips Korean and English AI prose tics (translation-ese, mechanical enumeration, stock phrases, uniform rhythm, hedging stacks) without changing a single fact. |
| `omd:critique` | Review a design without touching it. Runs the linter, groups findings by root cause, judges against the project's own concept. |
| `omd:scout` | Build a measured reference board — whole pages, single components, typography studies, motion studies, community threads — without designing anything. |
| `omd:coach` | Read your check history: what you keep getting wrong, what is improving, what to study next. Refuses to invent trends from thin data. |

## The slop linter

`omd check` computes contrast, hit areas, spacing, token coverage — and **slop**: the
signature of work that converged on the mean. All heuristic warnings, because each can be
wrong about a deliberate choice; overruling one requires a written reason.

| Rule | Catches |
|---|---|
| `SLOP-GRADIENT` | The indigo→violet gradient (matched by hue band, not a hex blocklist) |
| `SLOP-RADIUS-MONOCULTURE` | One corner radius everywhere — no material hierarchy |
| `SLOP-SHADOW-MONOCULTURE` | One shadow repeated — if everything floats, nothing floats |
| `SLOP-EVERYTHING-CENTERED` | Centring as a default instead of as emphasis |
| `SLOP-EMOJI-HEADING` | An emoji doing the job typography failed to do |
| `SLOP-COPY` | "Unlock the power of…", "no fluff here", and Korean AI-prose tics |
| `SLOP-TRIPLE-CARD` | Three identical feature cards — nobody decided what matters most |
| `SLOP-LEAKED-RATIONALE` | Design rationale quoted verbatim into shipped copy |

The last one is the pink-elephant failure: told *"no clutter"*, a model writes *"No
clutter here."* onto the page. `omd check` flags any five consecutive words shared
between page text and the project's design notes — deterministically.

Calibrated against real work: the rules fire on a fixture that is *correct, accessible,
and anonymous*, stay silent on the same content with a point of view, and do not flag
linear.app.

## References without the knockoff

[Jansson & Smith (1991)](https://www.designsociety.org/download-publication/25504/Design+Fixation:+a+Cognitive+Model)
showed designers reproduce an example's features even after those features are pointed
out as flaws. A model is worse — reproducing what it has seen is its training objective.
"Make it like Linear" produces a Linear knockoff, which is anonymity in a different coat.

So the model never sees a reference's pixels. `omd ref add` renders the page headlessly
and extracts **invariants** — the measurements that carry a design:

```jsonc
{
  "spacingLadder":   [4, 6, 8, 12, 16, 20, 24],
  "radiusLadder":    [4, 6, 8, 12, 16],        // five materials, not one
  "typeScale":       [13, 14, 16, 21],          // four sizes; weight does the hierarchy
  "fontFamilies":    ["inter"],
  "motionDurations": [100, 160],                // what "snappy" actually measures as
  "easingVocab":     ["ease", "ease-out"],
  "elevationLevels": 3                          // hairline borders don't count as height
}
```

…plus principles a model wrote after looking: *why* it works, in sentences usable without
ever seeing the original. Capture whole pages, single components (`--selector ".search"`),
typography studies, motion studies, or unrenderable things (`--image`, reasoning only) —
including **community sources**: a Reddit thread where designers argue about exactly this
component, a Hacker News post-mortem of a failed redesign, a Pinterest board's mood.
Pages tell you *what was built*; communities tell you *what people felt about it*, which
is evidence no measurement produces.

Then the checkable part:

```
$ omd ref distance ./my-page.html
  0.32  https://linear.app
  0.28  https://stripe.com
```

Work assembled from several references should resemble **none of them**. Score ≥ 0.6
against any single reference and the build fails: that is a clone, not a design.

## CLI

Everything a model would otherwise guess is a command instead:

```
omd check  <page> [--json] [--category slop]   lint: a11y, consistency, slop. exit 1 on findings
omd render <page> -o shot.png                  headless screenshot (then actually look at it)
omd ir     <page>                              rendered DOM → measured node tree
omd ref    add|list|show|principles|distance   the reference board
omd frame  set|show|reframe|generator          the problem record (nobody signs it; the loop rewrites it)
omd decision "what" --why "why"                the reasons file your successor will thank you for
omd coach                                      recurring weaknesses, honest trends
```

`omd check` exits 1 on findings, so it doubles as a **design linter in CI**.

## What accumulates in your repo

```
.omd/
  frame.md          what the problem is believed to be — appended on reframe, never overwritten
  decisions.md      why there is no green in this product
  refs/*.json       measured references + written principles
  history.jsonl     every check run — what omd coach reads
```

Six months later, someone reads `decisions.md` and understands.

## Honest limitations

- The loop's discipline is prompt-enforced; the *measurements* are code-enforced. A model
  can still ignore advice — it cannot fake a contrast ratio.
- Slop rules are heuristics. A brand really can be violet. That is why they warn, and why
  overruling requires a written reason.
- Reference capture reads public pages in a real browser and stores **measurements and
  reasoning, never assets**. Respect the sites you study.
- Codex CLI support exists in-tree (bare install) but is less battle-tested than the
  Claude Code path.

## Research this stands on

- Dorst & Cross, [*Creativity in the design process: co-evolution of problem–solution*](https://www.sciencedirect.com/science/article/pii/S0142694X01000096) — experts don't solve the given problem; they let partial solutions re-teach it
- Schön, *The Reflective Practitioner* — see–move–see: designers think by looking at what they made
- Darke, the primary generator — a governing metaphor precedes full understanding
- [DesignPref](https://arxiv.org/abs/2511.20513) — α = 0.248; there is no universal "good"
- [Jansson & Smith](https://www.designsociety.org/download-publication/25504/Design+Fixation:+a+Cognitive+Model) — design fixation; why references are measured, not shown
- [im-not-ai](https://github.com/epoko77-ai/im-not-ai) — the Korean AI-prose taxonomy behind `omd:humanize`

## License

MIT
