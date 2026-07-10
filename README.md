# oh-my-design

**English** | [한국어](./README.ko.md)

[![GitHub Stars](https://img.shields.io/github/stars/3x-haust/oh-my-design?style=flat-square)](https://github.com/3x-haust/oh-my-design/stargazers)

**Design like a person, not like the mean of the training set.**

AI-generated interfaces are rarely broken. They are worse than broken: *correct and
anonymous*. The indigo-to-violet gradient. Three feature cards with identical shadows.
Everything centred. A heading that opens with a rocket emoji. "Unlock the power of."

None of that is a bug. It is what a model produces when it has no point of view — the
average of everything it has ever seen. `omd` makes that failure **measurable**, then runs
the loop a human designer actually runs: doubt the brief, commit to a concept, study real
references, build once, look at what rendered, and let what you see rewrite the problem.

---

## 🚀 Install

As a Claude Code plugin (skills appear as `omd:ultradesign`, `omd:scout`, …):

```
/plugin marketplace add 3x-haust/oh-my-design
/plugin install omd@oh-my-design
```

Requirements: Node ≥ 22.18. The first `omd render` installs headless Chromium via
Playwright automatically.

---

## 🛠 Skills

| Skill | Trigger examples | What it does |
|:--|:--|:--|
| `omd:ultradesign` | "디자인해줘", "redesign this", "make it look good", "landing page" | The whole loop, end to end, with zero approval prompts. A blog produces a blog — plus a written record of every decision and why. |
| `omd:scout` | "레퍼런스 수집해줘", "build a reference board", "study comparable sites" | Build a measured reference board — whole pages, single components, typography studies, motion studies, community threads — without designing anything. |
| `omd:critique` | "비평해줘", "review this design", "what's wrong with this" | Review a design without touching it. Runs the linter, groups findings by root cause, judges against the project's own concept. |
| `omd:humanize` | "AI티 빼줘", "this reads like it was generated", "de-robot this copy" | Strip Korean and English AI prose tics — translation-ese, mechanical enumeration, stock phrases, uniform rhythm, hedging stacks — without changing a single fact. |
| `omd:coach` | "뭘 반복해서 틀리지?", "what am I getting wrong", "review my check history" | Read your check history: what you keep getting wrong, what is improving, what to study next. Refuses to invent trends from thin data. |

---

## 🤔 What is this

In [DesignPref](https://arxiv.org/abs/2511.20513), twenty professional designers made
12,000 pairwise UI judgements. Their agreement: **Krippendorff's α = 0.248.** On more
than a quarter of comparisons they split almost completely. There is no universal reward
function for "good design" — so a model optimised for average taste produces exactly the
anonymous output above, *as a logical consequence of its objective*.

Asking for a better model misses this. The anonymity is not a bug in the weights; it is
the weights working correctly toward average taste. What is buildable instead:

1. **Detect the mean.** Slop is checkable. Seven deterministic rules that fire on correct,
   anonymous work and stay silent on work with a position.
2. **Force a point of view.** A concept metaphor filters every decision: a trustworthy
   accountant does not bounce; a 3am convenience store does not leave whitespace.
3. **Learn from real things, safely.** Measured references — spacing ladders, type scales,
   motion durations — not screenshots. A model that sees a reference reproduces it
   (Jansson & Smith, 1991); a model that reads its measurements learns from it.
4. **Look.** Render headlessly, compute the numbers, never let the model estimate a
   contrast ratio or a padding value.
5. **Ground colour and type in theory.** Before committing to a direction, the concept
   step reads from a built-in theory pack — domain colour conventions, typography scale
   semantics, layout principles — and runs domain research. The decision carries a reason,
   not a vibe.

---

## 🔁 The pipeline

```
                         ┌──────────────────────────────────────────────┐
                         │                                              ▼
  ① FRAME ──▶ ② CONCEPT ──▶ ③ REFERENCE ──▶ ④ COMMIT ──▶ ⑤ BUILD ──▶ ⑥ SEE ──▶ ⑦ REFRAME
   doubt        read theory   omd-scout        one            omd-hand    render      what
   the brief    + domain      measures         structure,                 + measure   you saw
                research      real things      cost named                             rewrites
                                                                                      the frame
```

`omd-framer` interrogates the brief. `omd-scout` builds the reference board — never copies,
always measures. `omd-hand` builds the one committed structure. `omd-eye` critiques in a
fresh context: it never sees the reasoning that produced the work, so it cannot defend it.

---

## 🧹 The slop linter

`omd check` computes contrast, hit areas, spacing, token coverage — and **slop**: the
signature of work that converged on the mean. All heuristic warnings, because each can be
wrong about a deliberate choice; overruling one requires a written reason.

| Rule | Catches |
|:--|:--|
| `SLOP-GRADIENT` | The indigo→violet gradient (matched by hue band, not a hex blocklist) |
| `SLOP-RADIUS-MONOCULTURE` | One corner radius everywhere — no material hierarchy |
| `SLOP-SHADOW-MONOCULTURE` | One shadow repeated — if everything floats, nothing floats |
| `SLOP-EVERYTHING-CENTERED` | Centring as a default instead of as emphasis |
| `SLOP-EMOJI-HEADING` | An emoji doing the job typography failed to do |
| `SLOP-COPY` | "Unlock the power of…", "no fluff here", and Korean AI-prose tics |
| `SLOP-TRIPLE-CARD` | Three identical feature cards — nobody decided what matters most |
| `SLOP-LEAKED-RATIONALE` | Design rationale quoted verbatim into shipped copy |

The last one is the pink-elephant failure: told *"no clutter"*, a model writes *"No
clutter here."* `omd check` flags any five consecutive words shared between page text and
the project's design notes — deterministically.

Calibrated against real work: the rules fire on a fixture that is *correct, accessible,
and anonymous*, stay silent on the same content with a point of view, and do not flag
linear.app.

`omd check` exits 1 on findings, so it doubles as a **design linter in CI**.

---

## 📚 Theory pack

Concept decisions — especially colour direction and type register — used to be made by
vibe. The theory pack makes them made by evidence.

Four files ship with the plugin at `core/theory/`:

| File | What it answers |
|:--|:--|
| `color.md` | Domain colour conventions and why they exist (fintech, healthcare, education, food, developer tools, luxury); harmony schemes and when to use each; 60-30-10 distribution; saturation as a register signal; background temperature |
| `typography.md` | Modular scale ratios and what each says about information distance; pairing theory and the axes of contrast; type semantics (what the form says before a word is read); optimal line length; leading system |
| `layout.md` | Gestalt principles translated to UI decisions; visual hierarchy tool priority; F and Z scan patterns; grid and rhythm; von Restorff and the one memorable thing |
| `motion.md` | Duration thresholds from Nielsen's 1993 research; easing semantics (what ease-out vs ease-in-out communicates); choreography rules; the motion budget |

Each entry is written as a condition→choice→reason triple, not as general theory. Sources
are cited by name — Elliot & Maier, Bringhurst, Müller-Brockmann, Nielsen, NN/g. The
concept step reads from these before committing to a direction; the hand reads from them
when the board does not cover a decision.

---

## 🏗 Architecture

```
src/
  agents/                       source of truth for all agents
    framer.agent.yaml
    scout.agent.yaml
    hand.agent.yaml
    eye.agent.yaml
  skills/                       source of truth for all skills
    omd-ultradesign/SKILL.md
    omd-scout/SKILL.md
    omd-critique/SKILL.md
    omd-humanize/SKILL.md
    omd-coach/SKILL.md
core/
  theory/                       design theory pack (shipped into dist/)
    color.md
    typography.md
    layout.md
    motion.md
  ref/                          reference measurement and storage
  render/                       headless Playwright renderer
  rules/                        slop linter engine
adapters/
  build.ts                      generates agents/, skills/, dist/, .mcp.json
dist/
  claude/                       Claude Code direct install (generated)
  codex/                        Codex CLI install (generated)
agents/                         generated — do not edit
skills/                         generated — do not edit
.omd/                           per-project design record
  frame.md                      the problem as currently understood
  decisions.md                  why there is no green in this product
  refs/*.json                   measured references + written principles
  history.jsonl                 every check run — what omd:coach reads
```

`npm run build` regenerates `agents/`, `skills/`, `dist/`, and root `.mcp.json` from
`src/`. Never edit the generated directories directly.

---

## CLI

```
omd check  <page> [--json] [--category slop]   lint: a11y, consistency, slop. exit 1 on findings
omd render <page> -o shot.png                  headless screenshot (then actually look at it)
omd ir     <page>                              rendered DOM → measured node tree
omd ref    add|list|show|principles|distance   the reference board
omd frame  set|show|reframe|generator          the problem record (nobody signs it; the loop rewrites it)
omd decision "what" --why "why"                the reasons file your successor will thank you for
omd coach                                      recurring weaknesses, honest trends
```

---

## Honest limitations

- The loop's discipline is prompt-enforced; the *measurements* are code-enforced. A model
  can still ignore advice — it cannot fake a contrast ratio.
- Slop rules are heuristics. A brand really can be violet. That is why they warn, and why
  overruling requires a written reason.
- Reference capture reads public pages in a real browser and stores **measurements and
  reasoning, never assets**. Respect the sites you study.
- Codex CLI support exists in-tree (bare install) but is less battle-tested than the
  Claude Code path.

---

## License

MIT
