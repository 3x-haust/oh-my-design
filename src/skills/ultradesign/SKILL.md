---
name: ultradesign
description: >-
  Design and build an interface the way a designer does — interrogate the brief, commit to
  a point of view, build three genuinely different directions, look at what actually
  rendered, and let what you see rewrite the problem. Produces work with a position, not
  the average of every landing page ever scraped. Runs end to end without asking the user
  to approve anything.
  Use when asked to design, build, redesign, or lay out any interface, page, component,
  app, blog, dashboard, or landing page.
  Triggers: ultradesign, 울트라디자인, 디자인해줘, 만들어줘, UI, 화면, 리디자인, 페이지,
  랜딩, 블로그, 대시보드, landing page, redesign, make it look good.
---

# Ultradesign

Generated interfaces are rarely broken. They are worse than broken: **correct and
anonymous**. Indigo-to-violet gradient. Three feature cards with identical shadows.
Everything centred. A heading that opens with a rocket emoji. "Unlock the power of."

None of that is a bug. It is what a model produces with **no point of view** — the mean of
everything it has seen. Asked for a developer blog, it draws the average developer blog.

Your job is to produce work that could not have been produced for anyone else.

---

## The one rule

**The user asked for a website. Give them a website.**

Do not ask them to approve a framing. Do not ask them to pick a metaphor. Do not stop to
ask which of three candidates they prefer, and never tell them to run a command in their
terminal. They came here because they did not want to do the work. **Run the whole loop,
show them the result, and tell them what you decided and why.**

You make the calls. You record them. They can overrule any of it afterwards, because every
decision is written down with its reason.

---

## 1. FRAME — doubt the brief, silently

> Novice designers solve the problem they were given.
> Expert designers interrogate it first. That is the largest measured gap between them.

Spawn `omd-framer`. It comes back with the given problem, a reframing, and — mandatory —
**evidence**: a cited review, a support ticket, a datum, an observed pattern in a named
competitor, or a sentence the user themselves said. "I think" is not evidence, and
`omd frame set` rejects a reframing without it.

```bash
omd frame set --problem "..." --reframe "..." --why "<citation>"
```

Nobody signs this. It is a record of what you currently believe the problem is, and step 6
may prove it wrong. If the reframing is weak, the brief survives interrogation — that is a
successful frame, not a failed one.

**Mention it to the user in one sentence, in passing.** Not as a question.

> 리뷰를 보니 이건 "글을 쓰는 문제"가 아니라 "아무도 두 번째 글까지 안 읽는 문제"로
> 보입니다. 그 전제로 만들었습니다.

---

## 2. GENERATOR — commit to a point of view

A design without a governing metaphor collapses toward the mean. Consider three worlds,
each with different consequences for colour, density, motion, and copy:

```
"a trustworthy accountant"   restraint · serif · wide margins · no motion
"a 3am convenience store"    high contrast · immediate · fluorescent · loud
"a friend's recommendation"  handwritten · asymmetric · warm · conversational
```

**Pick one yourself.** Choose the one the evidence supports, not the one you find
prettiest. Then record it:

```bash
omd frame generator --set "a friend's recommendation"
```

From here every judgement asks *"is this what this concept would do"* — never *"is this
good"*. A trustworthy accountant does not bounce. A 3am store does not leave whitespace.

---

## 3. SKETCH — diverge cheaply, then converge expensively

A designer does not finish three comps and throw two away. They draw three thumbnails in
minutes, choose one, and finish only that. **Divergence is cheap; convergence is
expensive.** Do the same.

**Sketch:** spawn **three `omd-hand` subagents in one message**, each told to produce
*structure only* — an HTML skeleton, semantic elements, no styling, no polish, no copy.
Twenty lines each. They cannot see one another: one context asked for "three options"
returns one option in three colours, and the anchoring is unavoidable.

Give each a different *structural bet*, all serving the metaphor:

```
c1  a vertical stack, generous whitespace
c2  a fixed three-card deck
c3  conversational, one question at a time
```

**Cull:** choose one against the metaphor and the reference principles, and say why. It
costs almost nothing to discard the other two — that is the point of sketching them.

```bash
omd choose c1 c2 c3 --chose c3 --why "conversational serves the metaphor; c2 contradicts it"
```

**Build:** now spawn **one** `omd-hand` and build the winner properly. Real files, real
CSS, real components. Ninety percent of the tokens belong here, on the one thing that
ships.

Tell it to declare colour, spacing, and radius as CSS custom properties on `:root`: the
eye reads those as the design system, and an inline hex is reported as a defect, correctly.

> **Do not skip the sketches to save time.** The first structure that occurs to you is the
> mean of the training distribution — that is precisely the thing this skill exists to
> avoid. And the two you discarded are the raw material for step 7: "the reason I rejected
> c2 was actually a hole in the frame" is a sentence you can only write if you drew c2.

---

## 4. SEE — look at what actually rendered

You did not make what you think you made.

```bash
omd render <page> -o .omd/.cache/c1.png    # then Read the PNG. Actually look at it.
omd check  <page> --json                   # deterministic findings
```

`omd check` computes contrast ratios, hit areas, spacing, token coverage, **and slop**.
Never estimate any of them. **If a number appears in your reasoning that you did not read
from that output, you invented it.**

For interactive states — hover, focus, a menu opening — drive the page with the
`chrome-devtools` MCP tools rather than imagining what they look like.

Then spawn `omd-eye` on the built page. It sees the screenshot and the findings and nothing
about why you built it that way. It cannot defend your reasoning because it does not have
it. That is the point: an agent that critiques its own draft re-confirms it.

You are looking at one page, not three. The other two were culled at sketch stage, before
anyone spent a token polishing them.

---

## 5. The slop check is the product

```bash
omd check <page> --category slop
```

Every rule here fires on work that is **correct and generic**:

| | what it means |
|:--|:--|
| `SLOP-GRADIENT` | indigo→violet is not a brand, it is a default |
| `SLOP-RADIUS-MONOCULTURE` | one radius everywhere: no hierarchy, so the eye cannot rank anything |
| `SLOP-SHADOW-MONOCULTURE` | a shadow means elevation; if everything floats, nothing floats |
| `SLOP-EVERYTHING-CENTERED` | centring is emphasis. Emphasise everything and you emphasise nothing |
| `SLOP-EMOJI-HEADING` | an emoji doing the job typography failed to do |
| `SLOP-COPY` | a sentence that fits any product says nothing about this one |
| `SLOP-TRIPLE-CARD` | three identical cards: a confession that nobody decided what matters most |

**Fix them.** They are heuristics and each can be wrong about a deliberate choice — a
client's brand really might be violet. If you overrule one, record the reason:

```bash
omd decision "Kept the violet gradient" --why "The brand's primary is #7C3AED."
```

"It looked fine" is not a reason. **A clean slop report is not the goal**; the goal is that
every remaining choice is one you can defend by pointing at the metaphor.

---

## 6. REFRAME

You already chose, back at step 3, and recorded why.

> Professional designers agree on pairwise UI preference at Krippendorff's α = 0.248. On
> more than a quarter of comparisons they split almost completely. There is no universal
> "good", so **your preference is not evidence** — the metaphor and the findings are, and
> the user's accumulating choices are.

Now ask the eye the question you least want to ask: *what does the winner reveal about the
problem that we did not know when we framed it?*

> c3 works, but it cannot be skimmed. A returning reader already knows what they want.
> That is not a flaw in c3 — **it is a hole in the frame.**

If the frame moved, record it and **loop back to step 3.**

```bash
omd frame reframe --to "new readers face paralysis; returning readers face friction" \
                  --because "c3 cannot be skimmed, and most traffic is returning"
```

The old framing is kept, not overwritten. Do not quietly patch the winner to cover the
hole: the frame is the artifact, the screens are downstream of it.

**Iterate at most three times.** Diminishing polish makes designs worse.

---

## 7. Ship, then explain

Deliver the working site. Then, in a short paragraph — not a report — tell the user:

- what you decided the problem actually was, and what evidence pointed there
- which metaphor you chose, and what it ruled out
- what the eye caught that you would otherwise have shipped
- if the frame changed mid-loop, say so plainly. That is the most interesting sentence
  you will write.

Everything is in `.omd/`, committed with the repo. Six months from now someone reads
`decisions.md` and understands why there is no green in this product.

---

## Constraints

- **Never ask the user to run a command.** Not once.
- **Never ask for approval.** Decide, record the reason, move on.
- **Never estimate a measurable quantity.** Run `omd check`.
- **Never critique in the context that built the thing.** Spawn `omd-eye`.
- **Never call three variations of one idea a divergence.** Different structures, separate
  subagents, one parallel message.
- **Never cite your taste as a reason.** α = 0.248.
- **Never dismiss a slop finding silently.** Fix it, or overrule it in writing.
- **Never skip step 6** because the work looks finished. Looking finished is exactly when
  the frame is most likely to be wrong.
