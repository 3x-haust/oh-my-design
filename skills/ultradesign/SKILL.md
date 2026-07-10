---
name: ultradesign
description: >-
  Design and build an interface the way a designer does — interrogate the brief, commit to
  a concept, study real references and extract why they work, commit to one structure,
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

Do not ask them to approve a framing. Do not ask them to pick a concept or a structure,
and **never tell them to run a command in their terminal.** They
came here because they did not want to do this work.

Run the whole loop. Show them the result. Tell them what you decided and why. Every decision
is written down with its reason, so they can overrule any of it afterwards.

---

## 1. FRAME — doubt the brief, quietly

> Novice designers solve the problem they were given.
> Expert designers interrogate it first. That is the largest measured gap between them.

Spawn `omd:framer`. It returns the given problem, a reframing, and — mandatory — **evidence**:
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

A design without a governing metaphor collapses toward the mean. Before committing to one,
do two things that take the decision out of preference and into evidence.

### Read the theory pack

Read `${CLAUDE_PLUGIN_ROOT}/core/theory/color.md`,
`${CLAUDE_PLUGIN_ROOT}/core/theory/typography.md`, and
`${CLAUDE_PLUGIN_ROOT}/core/theory/layout.md` before choosing a direction. If running
outside the plugin, the files are at `core/theory/` in the repo root. These files are not
background reading — they are decision tables. `color.md` maps domain conventions to their
psychological reasons; `typography.md` maps scale ratios to their register. Pull the
entries that apply to this domain and this concept, and use them as constraints.

### Run domain research

Run 2–3 WebSearch queries before committing:

- `"{domain} brand color conventions why"` — what the industry reached for, and whether
  any explanation is given
- `"{domain} competitor visual identity"` — what the field looks like, so you know what
  you are joining or rejecting
- `"{domain} user trust color"` or `"{domain} UX color psychology"` — any research on
  what this audience responds to

From the results, extract the dominant visual convention and make an explicit choice: follow
it or break it, with a reason. Following a convention because everyone else does it is not
a reason. Breaking it because you noticed it is the right kind of reason. Record the choice:

```bash
omd decision "Muted green-grey, low saturation" --why "healthcare: Elliot & Maier \
color-in-context — high-saturation red triggers anxiety; three competitors use blue → \
differentiate with green, reduce saturation to stay calm"
```

This search is not a substitute for the scout's reference board. It is a hypothesis
the board will refine — the scout measures real things; this step decides what to look for.

### Commit

Consider three worlds, each with different consequences for colour, density, corners,
motion, and copy:

```
"a trustworthy accountant"   restraint · serif · wide margins · no motion
"a 3am convenience store"    high contrast · immediate · fluorescent · loud
"a quiet library"            muted · generous · unhurried · nothing shouts
```

**Choose one yourself.** Take the one the evidence — the theory, the domain research, the
frame — supports, not the one you find prettiest.

```bash
omd frame generator --set "a quiet library"
```

From here every judgement asks *"is this what this concept would do"* — never *"is this
good"*. A trustworthy accountant does not bounce. A 3am store does not leave whitespace.

The commit output must include:

- **Concept metaphor** — the governing world in one phrase
- **Colour direction** — primary hue family, saturation level (high / mid / muted), and
  temperature (warm / cool / neutral), with the reason drawn from theory or domain research
- **Type register** — serif/sans direction and scale ratio, with the reason
- **One memorable thing** — the single element this page will be remembered for

```bash
omd decision "Committed concept: quiet library" --why "colour: muted green-grey, low \
saturation (healthcare convention + Elliot & Maier anxiety finding); type: humanist sans \
at 1.2 scale (quiet scale, Bringhurst minor third); memorable: the intake form collapses \
to three questions on first visit, expands only when the user asks"
```

Before moving to references, name **the one memorable thing** as a sentence, written now,
that commits the concept to something distinct:

> "The headline types itself in, one word at a time, in the user's own handwriting font."
> "The pricing table collapses to a single slider that re-prices everything live."
> "Every scroll-triggered transition moves content up, never down — the page breathes."

If you cannot name it, the concept has no position yet. Name it before you open a browser.

---

## 3. REFERENCE — study real things, take the reasoning, leave the pixels

**This is the step that separates design from decoration, and the one you will be most
tempted to skip.** A designer with a concept goes and looks at what already exists.

Spawn `omd:scout` with the concept and the thing being designed. It starts with a
component inventory — every nav, card, form field, and footer the build will need, listed
before the first browser opens — then fills a board of **at least eighteen captures,
targeting twenty-five**:

```bash
omd ref add https://linear.app --as landing                      # whole page, for feel (3–4 total)
omd ref add https://linear.app --as search --selector ".search"  # one component's anatomy (one per inventory item)
omd ref add https://rsms.me --as type-study-1                    # chosen for its typography — minimum 2
omd ref add https://practicaltypography.com --as type-study-2    # different register, different pairing
omd ref add https://stripe.com --as motion-study-1               # chosen for its motion — minimum 2
omd ref add <site> --as motion-study-2                           # minimum 4 if brief mentions animation
omd ref add https://pinterest.com/pin/... --as mood --image      # unrenderable: reasoning only
omd ref add <reddit-thread-url> --as sidebar-debate --image      # community: what people FELT (minimum 2)
omd ref list
```

Two or three famous pages is not a board; it is a reflex. The scout runs at least six
WebSearch queries — problem domain, craft, community, typography, motion, and competitor
— before the first capture, and logs them on the board. Famous sites may not exceed one
third of the total. The scout searches for who actually solved this problem in this
concept's register, captures every component the build will need, and always brings back
**at least two typography studies and — whenever the brief implies any life — at least two
motion studies (four if animation is explicitly requested).** Type and motion are measured
invariants now (typeScale, fontFamilies, weightLadder, motionDurations, easingVocab), so
"멋있는 애니메이션 넣어줘" resolves to numbers someone actually read, not to 500ms
ease-in-out from habit.

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

## 4. COMMIT — one structure, its cost named

The first structure that occurs to you is the mean of the training distribution. So take
one breath before building: name the structure you are committing to, and **name what it
costs.** One sentence each, in prose. No alternatives, no candidates, no picking.

> Structure: conversational, one question at a time.
> Cost: it cannot be skimmed — a returning reader already knows what they want.

A structure whose cost you cannot name is one you have not understood, and the cost you
write down here is exactly what step 6 will probe. Record it:

```bash
omd decision "Committed to a conversational structure" --why "serves the concept; cost: cannot be skimmed"
```

> An earlier version of this skill generated three candidates — first as parallel subagent
> builds, then as prose sketches — and picked one. Both were theatre: the alternatives were
> invented in one context and judged in the same one, so nothing was actually diverged.
> Three candidates cost three times the tokens and bought a ritual. The real defence
> against the mean is `omd check --category slop`, which *measures* it, and the reframe
> step, which rebuilds when the structure was wrong. Trust those.

---

## 5. BUILD — one thing, properly

Spawn **one** `omd:hand` and build the committed structure. Real files, real CSS, real components.
All the tokens belong here, on the one thing that ships.

Declare colour, spacing, radius, **type, and motion** as custom properties on `:root`. The
eye reads those as the design system; an inline hex is reported as a defect, correctly.
Typography comes from the reference type studies — a chosen scale and faces with a reason —
never from defaults; motion durations and easing come from the motion study.

The words are part of the build, and they are where generated work confesses first. The
hand writes copy under two absolute rules: **the frame's language never appears on the
page** (`omd check` measures this — five consecutive words shared with `.omd/` is
SLOP-LEAKED-RATIONALE), and **copy never states what the thing is not** — told "no
clutter", a model writes "No clutter here"; a person writes what is actually there.

If the build reveals the structure was wrong — and sometimes it will — that is what the
reframe step is for. Rebuilding once is cheaper than generating alternatives every time on
the chance it might be.

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

Before the eye sees anything, run every visible string on the page through the humanize
checklist. S1 violations — connective commas (C-11), mechanical pronoun substitutions
(A-16), self-negating copy (pink elephant) — must read zero. A single "하지만," or a
"you won't find clutter here" is the same class of defect as a contrast failure: it
announces the work was generated. Humanize does not change what the copy says; it changes
whether a person could have said it.

```bash
# inspect copy, then:
omd check <page> --category slop   # SLOP-PINK-ELEPHANT and SLOP-COPY must come back clean
```

Only when the copy is clean does the eye see the page.

Finally spawn `omd:eye` on the built page. It sees the screenshot and the findings and nothing
about why you built it that way. It cannot defend your reasoning because it does not have it.

---

## 7. REFRAME — let what you saw rewrite the problem

The step you will most want to skip, because it means admitting the work is stale.

Ask the eye: *what does the built page reveal about the problem that we did not know when we
framed it?* The cost you named in step 4 is the first place to look — if it turned out to be
the cost that matters, that is not a flaw in the build. It is a hole in the frame.

> The conversational structure works, but it cannot be skimmed. A returning reader already
> knows what they want. That is not a flaw in the build — **it is a hole in the frame.**

```bash
omd frame reframe --to "new readers face paralysis; returning readers face friction" \
                  --because "the build cannot be skimmed, and most traffic is returning"
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

Include the attribution map. The hand wrote `.omd/attribution.md` during the build; render
it here as a table so the user can see — at a glance — which reference or theory file each
token decision came from, and what was left behind. This is not a decoration; it is the
answer to "where did this come from?"

> | Decision | Source | Reason |
> |---|---|---|
> | Type scale 1.25 / 4 sizes | type-study-2 (rsms.me) | 4 sizes; weight carries hierarchy |
> | --duration-fast 140ms | motion-study-1 (stripe.com) | measured 120–160ms range |
> | Primary hue muted green-grey | theory/color.md + domain search | healthcare convention, Elliot & Maier |
> | Rejected: Raycast's snap motion | concept filter | a quiet library does not hurry |

Everything is in `.omd/`, committed with the repo. Six months from now someone reads
`decisions.md` and `attribution.md` and understands not just why there is no green in this
product, but exactly which reference argued for what is there instead.

---

## Constraints

- **Never ask the user to run a command.** Not once.
- **Never ask for approval.** Decide, record the reason, move on.
- **Never estimate a measurable quantity.** Run `omd check`.
- **Never look at a reference's pixels, or describe how it looks.** Take the principle.
- **Never let `omd ref distance` come back over 0.6 and ship anyway.** That is a clone.
- **Never critique in the context that built the thing.** Spawn `omd:eye`.
- **Never cite your taste as a reason.** α = 0.248.
- **Never dismiss a slop finding silently.** Fix it, or overrule it in writing.
- **Never let the frame speak on the page.** Rationale lives in `.omd/`; copy sells the
  thing, not the thinking.
- **Never write copy about what the page is not.** State the positive fact instead.
- **Never ship a font the board did not argue for.** If no type study cited it, it is a
  default, not a decision.
- **Never skip step 7** because the work looks finished. Looking finished is exactly when the
  frame is most likely to be wrong.
