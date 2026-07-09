---
name: ultradesign
description: >-
  Design and build an interface the way a designer does — interrogate the brief, commit to
  a point of view, build three genuinely different directions, look at what actually
  rendered, and let what you see rewrite the problem. Produces work with a position, not
  the average of every landing page ever scraped.
  Use when asked to design, build, redesign, or lay out any interface, page, component,
  app, blog, dashboard, or landing page.
  Triggers: ultradesign, 울트라디자인, 디자인해줘, 만들어줘, UI, 화면, 리디자인, 페이지,
  랜딩, 블로그, 대시보드, landing page, redesign, make it look good.
---

# Ultradesign

Generated interfaces are rarely broken. They are worse than broken: they are **correct and
anonymous**. Indigo-to-violet gradient. Three feature cards with identical shadows.
Everything centred. A heading that starts with a rocket emoji. "Unlock the power of."

None of that is a bug. It is what a model produces when it has **no point of view** — the
mean of everything it has seen. Asked for a developer blog it draws the average developer
blog. This skill exists to make that impossible, and it does so by refusing to let you skip
the two things human designers actually do: **interrogate the brief**, and **look at what
you made**.

You will feel pressure to skip both. Skipping is the failure mode.

---

## 0. Open a session

```bash
omd session start --brief "<what the user asked for, verbatim>"
```

This creates `.omd/` and arms the frame gate **for design files in this project only**.
Until a frame is approved, writes to `.css`, `.tsx`, `.html` and friends are blocked. Tests,
READMEs, and every other repository on this machine are untouched.

**Do not run `omd frame approve` yourself.** It will refuse you — you have no terminal — and
routing around it means signing off on a design nobody read.

Close it when you are done: `omd session end`.

---

## 1. FRAME — doubt the brief

> Novice designers solve the problem they were given.
> Expert designers interrogate it first. That is the largest measured gap between them.

Spawn the `omd-framer` subagent. It returns:

- **The given problem**, restated plainly.
- **A reframing**, as a *hypothesis*, never as a correction of the user.
- **Evidence.** A cited review, a support ticket, a datum, an observed pattern in a named
  competitor, or a sentence the user themselves said. "I think" is not evidence, and
  `omd frame propose` refuses to write a frame without it.
- **The trade.** What is thrown away if the reframing is accepted, and what is gained.

```bash
omd frame propose --problem "..." --reframe "..." --why "<citation>"
```

Show it to the user and **stop**. They approve it in their own terminal.

A rejected reframing is a successful frame: the problem was interrogated and survived.

---

## 2. GENERATOR — commit to a point of view

This step is the whole difference between design and decoration. Offer **three metaphors**,
each a different world:

```
A  "믿음직한 회계사"   절제 · 세리프 · 넉넉한 여백 · 모션 없음
B  "새벽 편의점"       고대비 · 즉각 · 형광 · 소음
C  "친구의 추천"       손글씨 · 비대칭 · 따뜻함 · 대화
```

The metaphor is not a mood board. It is an argument, and it decides colour, density,
motion, and copy. A trustworthy accountant does not bounce. A 3am convenience store does
not leave generous whitespace.

```bash
omd frame generator --set "친구의 추천"
```

From here on, every critique asks *"is this what this concept would do"* — never *"is this
good"*.

---

## 3. DIVERGE — three real alternatives, built in parallel

Spawn **three `omd-hand` subagents in one message, in parallel.** They must not see each
other. One context producing "three options" produces one option in three colours; the
anchoring is unavoidable. Separate contexts produce actual alternatives.

Give each a different *structural bet*, all serving the chosen metaphor:

```
c1  a vertical stack, generous whitespace
c2  a fixed three-card deck
c3  conversational, one question at a time
```

Each hand builds something that runs. Real files, real CSS, real components. Tell them to
declare colour, spacing, and radius as CSS custom properties on `:root` — the eye reads
those as the design system, and a hex typed inline is reported as a defect, correctly.

---

## 4. SEE — look at what actually rendered

You did not make what you think you made.

```bash
omd render <page> -o .omd/.cache/c1.png    # then Read the PNG. Actually look at it.
omd check  <page> --json                      # deterministic findings
```

`omd check` computes contrast ratios, hit areas, spacing, token coverage, **and slop**.
Never estimate any of these. If a number appears in your critique that you did not read
from that output, you invented it.

For anything interactive — hover, focus, a menu opening — drive the page through the
`chrome-devtools` MCP tools rather than guessing what a state looks like.

Then spawn `omd-eye`, a *separate* subagent, per candidate. It sees the screenshot and the
findings and nothing about why you built it that way. It cannot defend your reasoning
because it does not have it.

---

## 5. The slop check is not a lint pass. It is the point.

```bash
omd check <page> --category slop
```

Every rule here fires on work that is **correct and generic**:

| | what it means |
|:--|:--|
| `SLOP-GRADIENT` | indigo→violet is not a brand, it is a default |
| `SLOP-RADIUS-MONOCULTURE` | every corner the same radius: no hierarchy, so the eye cannot rank anything |
| `SLOP-SHADOW-MONOCULTURE` | a shadow means elevation; if everything floats, nothing floats |
| `SLOP-EVERYTHING-CENTERED` | centring is emphasis, not a default. Emphasise everything and you emphasise nothing |
| `SLOP-EMOJI-HEADING` | an emoji doing the job typography failed to do |
| `SLOP-COPY` | a sentence that fits any product says nothing about this one |
| `SLOP-TRIPLE-CARD` | three identical feature cards is a confession that nobody decided what matters most |

These are **heuristics, and they warn rather than error**, because each can be wrong about a
deliberate choice. When you overrule one, say why in `omd decision`. "The client's brand
genuinely is violet" is a reason. "It looked fine" is not.

**A clean slop report is not the goal.** The goal is that every remaining choice is one you
can defend by pointing at the metaphor.

---

## 6. CULL — the user chooses, and the choice is data

```bash
omd choose c1 c2 c3
```

Show the three renders. Say which you would pick and why — in terms of the metaphor and the
findings, never in terms of your own taste.

> Professional designers agree with each other on pairwise UI preference at Krippendorff's
> α = 0.248. On more than a quarter of comparisons they split almost completely. There is no
> universal "good". **Your preference is not evidence.** The user's accumulating choices in
> `.omd/taste/` are.

---

## 7. REFRAME — let what you saw rewrite the problem

The step you will most want to skip, because it means admitting the work you just did is
stale. Ask the eye: *what does the winning candidate reveal about the problem that we did not
know when we framed it?*

> c3 works, but it makes it impossible to skim. A returning reader already knows what they
> want. That is not a flaw in c3 — **it is a hole in the frame.**
>
> Before: solve decision paralysis.
> After: new readers have decision paralysis; returning readers have friction. Two modes.

If the frame changed, say so plainly, mark the candidates stale, and return to step 3. Do
not quietly patch the winner to cover the hole. The frame is the artifact; the screens are
downstream of it.

---

## 8. STOP

Stop when the findings are clean, or three iterations bring no real improvement, or the user
says it is done. Diminishing polish makes designs worse.

> Nothing enforces this. There is no `Stop` hook yet, so the discipline is yours.

```bash
omd decision "그린 CTA 기각" --why "핀테크 클리셰. '친구의 추천'과 무관."
omd session end
```

`.omd/` is committed to the repo. Six months from now someone reads `decisions.md` and
understands why there is no green in this product.

---

## Constraints

- **Never estimate a measurable quantity.** Run `omd check`.
- **Never critique in the context that built the thing.** Spawn `omd-eye`.
- **Never call three variations of one idea a divergence.** Different metaphors, different
  structures, separate subagents, one parallel message.
- **Never approve your own frame.**
- **Never cite your taste as a reason.** α = 0.248.
- **Never dismiss a slop finding silently.** Overrule it in writing, or fix it.
- **Never skip step 7** because the work looks finished. Looking finished is precisely when
  the frame is most likely to be wrong.
