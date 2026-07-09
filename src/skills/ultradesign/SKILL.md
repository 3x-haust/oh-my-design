---
name: ultradesign
description: >-
  Design and build a UI the way a designer does — interrogate the brief, commit to a
  point of view, build three genuinely different directions, look at what was actually
  rendered, and let what you see rewrite the problem. Use when asked to design, build,
  redesign, or lay out any interface, page, component, or app.
  Triggers: ultradesign, /ultradesign, 디자인해줘, 만들어줘, UI, 화면, 리디자인, 페이지, 랜딩, 블로그, 대시보드.
---

# Ultradesign

Most AI design output is generic. Not because the model has bad taste — because it has
**no point of view**. Asked for a food app it draws the average of every food app it has
ever seen. This skill exists to stop that, and the way it stops it is by refusing to let
you skip the two things human designers actually do: **interrogate the brief**, and
**look at what you made**.

You will feel pressure to skip both. Skipping is the failure mode. The steps below are
ordered because a real designer's process is ordered, and `omd` enforces the order.

---

## 0. Before anything

```bash
omd frame show          # is there already a frame? if approved, skip to step 2
```

Writes are blocked until a frame is approved. This is on purpose. **Do not run
`omd frame approve` yourself** — it will refuse you anyway (you have no terminal), and
routing around it means signing off on a design nobody read.

---

## 1. FRAME — doubt the brief

> Novice designers solve the problem they were given.
> Expert designers interrogate it first. That is the single largest measured gap
> between them.

Spawn the `omd-framer` subagent. It must come back with:

- **The given problem**, restated plainly.
- **A reframing**, offered as a *hypothesis*, never as a correction of the user.
- **Evidence.** A cited review, a ticket, a datum, an observed pattern in a competitor,
  or something the user themselves said. "I think" is not evidence. Without it,
  `omd frame propose` refuses to write the frame.
- **What gets thrown away** if the reframing is accepted, and **what is gained**.

```bash
omd frame propose --problem "..." --reframe "..." --why "<cited evidence>"
```

Then **stop and show the user**. They approve it in their own terminal. If they reject
the reframing, take the original problem and say so in `frame.md`. A rejected reframing
is a successful frame — the problem was interrogated and survived.

---

## 2. GENERATOR — commit to a point of view

A design without a governing metaphor collapses toward the mean of its training data.
Offer the user **three**, each a different world:

```
A  "믿음직한 회계사"   절제 · 세리프 · 넉넉한 여백 · 모션 없음
B  "새벽 편의점"       고대비 · 즉각 · 형광 · 소음
C  "친구의 추천"       손글씨 · 비대칭 · 따뜻함 · 대화
```

The metaphor is not decoration. It decides colour, density, motion, and copy, and from
now on it is the standard every critique is measured against. Record the choice:

```bash
omd frame generator --set "친구의 추천"
```

---

## 3. DIVERGE — three real alternatives, built in parallel

Spawn **three separate `omd-hand` subagents, in one message, in parallel.** They must not
see each other's work. One context producing "three options" produces one option in three
colours; the anchoring is unavoidable. Separate contexts produce actual alternatives.

Give each hand a different structural bet, all serving the chosen metaphor:

```
c1  a vertical stack, generous whitespace
c2  a fixed three-card deck
c3  conversational, one question at a time
```

Each hand builds something that runs. Real files, real CSS, real component tree.
**Define your colours, spacing, and radii as CSS custom properties on `:root`.** The eye
reads those as design tokens; hardcoded hex values are reported as defects, and they are.

---

## 4. SEE — look at what actually rendered

You did not make what you think you made. Look.

```bash
omd render <page-or-url> -o .design/.cache/c1.png    # then Read the PNG
omd check  <page-or-url> --json                      # deterministic findings
```

`omd check` computes contrast ratios, hit areas, spacing, and token coverage. **Never
estimate any of these yourself.** If a number appears in your critique that you did not
read from that output, you invented it.

Then spawn `omd-eye` — a *separate* subagent — on each candidate. It sees the screenshot
and the findings, and nothing about why you built it that way. It cannot defend your
reasoning because it does not have it. That is the entire point: an agent that critiques
its own draft re-confirms it.

Eye returns, per candidate:

- **Layer 1** — findings from `omd check`, grouped by root cause. Ninety findings from
  one detached component is one finding, not ninety.
- **Layer 2** — contradictions with the metaphor. *"A swipe deck contradicts 'a friend's
  recommendation'. A friend does not ask you to flip through cards. A friend talks to you."*
  A linter can never produce this line. It is the reason a human is in the loop.

---

## 5. CULL — the user chooses, and the choice is data

```bash
omd choose c1 c2 c3
```

Show the three renders. Say which one you'd pick and why — in terms of the metaphor and
Layer 1, never in terms of your own taste.

> Professional designers agree with each other on pairwise UI preference at
> Krippendorff's α = 0.248. On more than a quarter of comparisons they split almost
> completely. There is no universal "good". **Your preference is not evidence.**
> The user's accumulating choices in `.design/taste/` are.

---

## 6. REFRAME — let what you saw rewrite the problem

This is the step that separates this skill from every other design tool, and the one you
will most want to skip, because it means admitting the work you just did is stale.

Ask the eye one more question: *what does the winning candidate reveal about the problem
that we did not know when we framed it?*

> c3 works, but it makes it impossible to skim a list. A returning user already knows
> what they want. That is not a flaw in c3. **It is a hole in the frame.**
>
> Before: solve decision paralysis.
> After: new users have decision paralysis; returning users have friction. Two modes.

If the frame changed, say so plainly, mark the candidates stale, and go back to step 3.
Do not quietly patch the winner to cover the hole. The frame is the artifact; the screens
are downstream of it.

---

## 7. STOP

Stop when Layer 1 and Layer 2 are both clean, or when three iterations produce no
meaningful improvement, or when the user says it's done. Diminishing polish makes designs
worse, not better.

> Nothing enforces this yet — there is no `Stop` hook, so the discipline is yours. An
> agent left to iterate freely will polish a design past the point where it was good.

Record what you decided and why:

```bash
omd decision "그린 CTA 기각" --why "핀테크 클리셰. '친구의 추천'과 무관."
```

`.design/` is committed to the repo. Six months from now someone will read
`decisions.md` and understand why there is no green in this product.

---

## Constraints

- **Never estimate a measurable quantity.** Run `omd check`.
- **Never critique in the context that built the thing.** Spawn `omd-eye`.
- **Never call three variations of one idea a divergence.** Different metaphors,
  different structures, separate subagents, one parallel message.
- **Never approve your own frame.**
- **Never cite your taste as a reason.** α = 0.248.
- **Never skip step 6** because the work looks finished. It looking finished is exactly
  when the frame is most likely to be wrong.
