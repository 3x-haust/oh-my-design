---
name: ultradesign
description: >-
  Design and build an interface the way a designer does — interrogate the brief, commit to
  a concept, study real references and extract why they work, sketch cheaply, build once,
  look at what actually rendered, and let what you see rewrite the problem. Produces work
  with a position, not the average of every landing page ever scraped. Runs end to end
  without asking the user to approve anything.
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

Do not ask them to approve a framing. Do not ask them to pick a concept. Do not stop to ask
which sketch they prefer, and **never tell them to run a command in their terminal.** They
came here because they did not want to do this work.

Run the whole loop. Show them the result. Tell them what you decided and why. Every decision
is written down with its reason, so they can overrule any of it afterwards.

---

## 1. FRAME — doubt the brief, quietly

> Novice designers solve the problem they were given.
> Expert designers interrogate it first. That is the largest measured gap between them.

Spawn `omd-framer`. It returns the given problem, a reframing, and — mandatory — **evidence**:
a cited review, a support ticket, a datum, an observed pattern in a named competitor, or a
sentence the user themselves said. "I think" is not evidence, and `omd frame set` rejects a
reframing without it.

```bash
omd frame set --problem "..." --reframe "..." --why "<citation>"
```

Nobody signs this. It records what you currently believe the problem is; step 7 may prove it
wrong. If the reframing is weak, the brief survives interrogation — that is a successful
frame, not a failed one.

Mention it to the user in **one sentence, in passing.** Not as a question.

> 리뷰를 보니 이건 "글을 쓰는 문제"가 아니라 "아무도 두 번째 글까지 안 읽는 문제"로
> 보입니다. 그 전제로 만들었습니다.

---

## 2. CONCEPT — commit to a point of view

A design without a governing metaphor collapses toward the mean. Consider three worlds, each
with different consequences for colour, density, corners, motion, and copy:

```
"a trustworthy accountant"   restraint · serif · wide margins · no motion
"a 3am convenience store"    high contrast · immediate · fluorescent · loud
"a quiet library"            muted · generous · unhurried · nothing shouts
```

**Choose one yourself.** Take the one the evidence supports, not the one you find prettiest.

```bash
omd frame generator --set "a quiet library"
```

From here every judgement asks *"is this what this concept would do"* — never *"is this
good"*. A trustworthy accountant does not bounce. A 3am store does not leave whitespace.

---

## 3. REFERENCE — study real things, take the reasoning, leave the pixels

**This is the step that separates design from decoration, and the one you will be most
tempted to skip.** A designer with a concept goes and looks at what already exists.

Spawn `omd-scout` with the concept and the component. It picks two to four references that
solved *this* problem, measures them, and writes down **why** they are the way they are.

```bash
omd ref add https://linear.app --as search-bar   # renders it, extracts the invariants
omd ref list                                     # what we have learned from
```

What comes back is not a screenshot. It is a spacing ladder, a radius ladder, how many real
elevation levels exist, how much text is centred — plus principles like:

> *"Radii split into seven rungs, so an input, a card and an avatar are made of different
> materials. Nothing reads as the same object."*

> **Never ask for a screenshot of a reference, and never describe how one looks.** Shown an
> example, designers reproduce its features even after those features are pointed out as
> flaws — Jansson & Smith, 1991, replicated across four tasks. A model is worse: reproducing
> what it has seen is the objective it was trained on. "Make it like Linear" produces a
> Linear knockoff, and a knockoff is anonymity wearing a different coat.

**The concept is the filter.** You do not use everything you found:

```
Linear    seven radius rungs   → take. A library's objects are made of different things.
Raycast   instant, snappy      → leave. A library does not hurry.
Stripe    generous margins     → take. Space is what quiet sounds like.
Notion    dense lists          → leave. Contradicts Stripe; the concept picks Stripe.
```

Record what you left behind, and why:

```bash
omd decision "Rejected Raycast's motion" --why "A quiet library does not hurry."
```

Assembly is not collage. Collage takes everything that looks good. **Design discards most of
it against a single standard.**

---

## 4. SKETCH — diverge cheaply

A designer does not finish three comps and bin two. They draw three thumbnails in minutes,
pick one, and finish only that. **Divergence is cheap; convergence is expensive.**

Spawn **three `omd-sketch` subagents in one message.** They cannot see one another: a single
context asked for "three options" returns one option in three colours, and the anchoring is
unavoidable.

Each gets a different *structural bet*, all serving the concept and the principles:

```
c1  a vertical stack, generous whitespace
c2  a fixed three-card deck
c3  conversational, one question at a time
```

Structure only. Semantic HTML, no CSS, no polish. Each sketch must **expose the awkward
consequence of its own bet** — c3 cannot be skimmed, c2 breaks at eleven items. A sketch
that hides its cost wins the cull for the wrong reason.

> **Do not skip the sketches to save tokens.** The first structure that occurs to you is the
> mean of the training distribution — precisely the thing this skill exists to avoid.

---

## 5. CULL and BUILD

Choose one, against the concept and the reference principles. Never against your own taste.

```bash
omd choose c1 c2 c3 --chose c3 --why "conversational serves the concept; c2 contradicts it"
```

> Professional designers agree on pairwise UI preference at Krippendorff's α = 0.248. On more
> than a quarter of comparisons they split almost completely. There is no universal "good",
> so **your preference is not evidence** — the concept, the principles, and the findings are.

Now spawn **one** `omd-hand` and build the winner properly. Real files, real CSS, real
components. Ninety percent of the tokens belong here, on the one thing that ships.

Declare colour, spacing, and radius as CSS custom properties on `:root`. The eye reads those
as the design system; an inline hex is reported as a defect, correctly.

---

## 6. SEE — look at what actually rendered

You did not make what you think you made.

```bash
omd render <page> -o .omd/.cache/build.png    # then Read the PNG. Actually look at it.
omd check  <page> --json                      # deterministic findings
omd check  <page> --category slop             # the ones that matter most
```

`omd check` computes contrast ratios, hit areas, spacing, token coverage, **and slop**. Never
estimate any of them. **If a number appears in your reasoning that you did not read from that
output, you invented it.**

Every slop rule fires on work that is correct and generic:

| | what it means |
|:--|:--|
| `SLOP-GRADIENT` | indigo→violet is not a brand, it is a default |
| `SLOP-RADIUS-MONOCULTURE` | one radius everywhere: no hierarchy, so the eye cannot rank anything |
| `SLOP-SHADOW-MONOCULTURE` | a shadow means elevation; if everything floats, nothing floats |
| `SLOP-EVERYTHING-CENTERED` | centring is emphasis. Emphasise everything and you emphasise nothing |
| `SLOP-EMOJI-HEADING` | an emoji doing the job typography failed to do |
| `SLOP-COPY` | a sentence that fits any product says nothing about this one |
| `SLOP-TRIPLE-CARD` | three identical cards: a confession that nobody decided what matters most |

**Fix them.** Each can be wrong about a deliberate choice — a client's brand really might be
violet. If you overrule one, record why:

```bash
omd decision "Kept the violet gradient" --why "The brand's primary is #7C3AED."
```

"It looked fine" is not a reason.

Then check you did not simply copy what you studied:

```bash
omd ref distance <page>
```

If the page sits within 0.6 of any single reference, **you assembled nothing — you cloned.**
Work built from several references should resemble none of them. Change the thing the report
names as the driver, and run it again.

Finally spawn `omd-eye` on the built page. It sees the screenshot and the findings and nothing
about why you built it that way. It cannot defend your reasoning because it does not have it.

---

## 7. REFRAME — let what you saw rewrite the problem

The step you will most want to skip, because it means admitting the work is stale.

Ask the eye: *what does the winner reveal about the problem that we did not know when we
framed it?* The sketches you discarded are the material for this — "the reason I rejected c2
was actually a hole in the frame" is a sentence you can only write because you drew c2.

> c3 works, but it cannot be skimmed. A returning reader already knows what they want.
> That is not a flaw in c3 — **it is a hole in the frame.**

```bash
omd frame reframe --to "new readers face paralysis; returning readers face friction" \
                  --because "c3 cannot be skimmed, and most traffic is returning"
```

The old framing is kept, not overwritten. Do not quietly patch the winner to cover the hole:
the frame is the artifact, the screens are downstream of it. **If the frame moved, go back to
step 4.**

**Iterate at most three times.** Diminishing polish makes designs worse.

---

## 8. Ship, then explain

Deliver the working site. Then, in a short paragraph — not a report — tell the user:

- what you decided the problem actually was, and what evidence pointed there
- which concept you chose, and what it ruled out
- what you learned from which references, and what you deliberately left behind
- what the eye caught that you would otherwise have shipped
- if the frame changed mid-loop, say so plainly. It is the most interesting sentence you will
  write.

Everything is in `.omd/`, committed with the repo. Six months from now someone reads
`decisions.md` and understands why there is no green in this product.

---

## Constraints

- **Never ask the user to run a command.** Not once.
- **Never ask for approval.** Decide, record the reason, move on.
- **Never estimate a measurable quantity.** Run `omd check`.
- **Never look at a reference's pixels, or describe how it looks.** Take the principle.
- **Never let `omd ref distance` come back over 0.6 and ship anyway.** That is a clone.
- **Never critique in the context that built the thing.** Spawn `omd-eye`.
- **Never call three variations of one idea a divergence.** Different structures, separate
  subagents, one parallel message.
- **Never cite your taste as a reason.** α = 0.248.
- **Never dismiss a slop finding silently.** Fix it, or overrule it in writing.
- **Never skip step 7** because the work looks finished. Looking finished is exactly when the
  frame is most likely to be wrong.
