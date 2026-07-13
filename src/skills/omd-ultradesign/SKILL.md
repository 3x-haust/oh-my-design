---
name: omd-ultradesign
description: >-
  Design and build an interface the way a designer does — interrogate the brief, commit to
  a concept, study real references and extract why they work, commit to one structure,
  look at what actually rendered, and let what you see rewrite the problem. Produces work
  with a position, not the average of every landing page ever scraped. Runs end to end
  without asking the user to approve anything. Reference URLs included in the brief are
  captured first and treated as first-class user-provided references.
  Use when asked to design, build, redesign, or lay out any interface, page, component,
  app, blog, dashboard, or landing page.
  Triggers: ultradesign, 울트라디자인, 디자인해줘, 만들어줘, UI, 화면, 리디자인, 페이지,
  랜딩, 블로그, 대시보드, landing page, redesign, make it look good.
---

# Ultradesign

> **Figma routing**: when the brief contains a figma.com link, hand off to `omd-figma`
> instead of running this loop. The design decisions — concept, colour, type, layout —
> were already made in Figma; the frame/concept/reference steps here are not needed.

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

**The records are English; the surface is the user's.** Everything written under
`.omd/` — frame, decisions, attribution, principles — is in English regardless of the
brief's language, because later runs and later tools read those files. The page copy and
every sentence shown to the user stay in the user's language. Neither ever quotes the
other.

**The design lives where the user asked for it.** Pin the working directory before
anything else: the directory the skill was invoked in, stated as an absolute path in
every subagent prompt. Every `omd` command — yours and every agent's — runs from there,
because the CLI writes `.omd/` at its own cwd. Do not drift to the git root; a repo's
top level is where agents habitually wander, and an `.omd/` that lands one directory
above the design belongs to nothing.

---

## 1. FRAME — doubt the brief, quietly

> Novice designers solve the problem they were given.
> Expert designers interrogate it first. That is the largest measured gap between them.

Before anything else, run `omd doctor` quietly from the working directory. If any check
fails, surface the failure lines to the user in one sentence and stop — a missing Playwright
installation or an unwritable `.omd/` will break every subsequent step, and discovering
that mid-loop wastes everything before it.

```bash
omd doctor
```

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

If the framer's reply comes back empty — an agent whose last act was a tool call has
nothing left to say — do not re-spawn it or interrogate the transcript. The frame is
already on disk: read `.omd/frame.md` and move on.

Mention it to the user in **one sentence, in passing.** Not as a question.

And that sentence sets the register for every status line you write: the user hears
outcomes, never the machinery. "레퍼런스 보드를 만듭니다" — not "(18장 이상)", not a
quota, not a rule ID, not a capture count you owe a contract. The numbers live in the
skill and in `.omd/`; quoting them at the user is the pipeline narrating its own
instructions, which is the same tell as copy that quotes the frame.

> 리뷰를 보니 이건 "글을 쓰는 문제"가 아니라 "아무도 두 번째 글까지 안 읽는 문제"로
> 보입니다. 그 전제로 만들었습니다.

---

## 2. CONCEPT — commit to a point of view

A design without a governing metaphor collapses toward the mean. Before committing to one,
do two things that take the decision out of preference and into evidence.

### Read the theory pack

Read `theory/color.md`, `theory/typography.md`, `theory/layout.md`, and `theory/ux.md`
from the directory `omd pack dir` prints (in this repo: `core/theory/`) before choosing
a direction. These files are not background reading — they are decision tables.
`color.md` maps domain conventions to their psychological reasons; `typography.md` maps
scale ratios to their register; `ux.md` maps the task the user arrived with to structural
constraints: primary action count, exit paths, feedback thresholds, defaults for the
frequent case. Pull the entries that apply to this domain and this concept, and use them
as constraints.

If the brief signals a showpiece register (see below), also read
`theory/expressive.md` under the directory `omd pack dir` prints (in this repo:
`core/theory/expressive.md`) before committing. It is the decision table for expressive
technique: what earns its place, what does not, and the restraint clause that keeps
showpiece work from becoming an effects catalogue.

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
- **Expressive register** — quiet / confident / showpiece, chosen from the brief signal
  (see below), with the reason
- **One memorable thing** — the single element this page will be remembered for

```bash
omd decision "Committed concept: quiet library" --why "colour: muted green-grey, low \
saturation (healthcare convention + Elliot & Maier anxiety finding); type: humanist sans \
at 1.2 scale (quiet scale, Bringhurst minor third); register: confident (informational \
site, not a campaign); memorable: the intake form collapses to three questions on first \
visit, expands only when the user asks"
```

### Expressive register: quiet / confident / showpiece

Read the brief for signals before deciding:

**showpiece signals**: 멋지게, 쩔게, 어워드, 포트폴리오, 브랜드 캠페인, 마이크로사이트,
"award-worthy", "make it impressive", agency site, product launch with single CTA,
experiential brand page. The interface is part of the experience; the user came partly to
be here.

**quiet signals**: 대시보드, 문서, 도구, 관리 화면, "clean and simple", SaaS product UI,
data-heavy, reading-first. The interface recedes; the user's work is the event.

**confident** is the default when neither extreme is indicated — a position is visible but
the interface does not perform for its own sake.

> **Do not make dashboards, documentation, or tools showpiece.** Awwwards Usability is
> 30% of the score. A dashboard with split-text entrances and sticky scroll stages does
> not lose on creativity — it loses on usability, which is worth more. Restraint in a
> tool context is not timidity; it is the correct reading of what the user came to do.

When the register is **showpiece**:

1. Read `theory/expressive.md` under the directory `omd pack dir` prints (in this repo:
   `core/theory/expressive.md`) before proceeding.
2. The scout must source from award galleries (see step 3 for the list).
3. **The one memorable thing must be defined as an orchestrated moment**, not a technique
   name. "split-text hero" is a technique. "The moment mid-scroll where the entire page
   inverts colour and the background becomes the foreground" is an orchestrated moment — it
   names what the user experiences, not what the implementation is called.

Before moving to references, name **the one memorable thing** as a sentence, written now,
that commits the concept to something distinct:

> "The headline types itself in, one word at a time, in the user's own handwriting font."
> "The pricing table collapses to a single slider that re-prices everything live."
> "Every scroll-triggered transition moves content up, never down — the page breathes."
> "Mid-scroll, the entire page inverts — the white ground becomes black and every heading
>  glows, marking the turn in the narrative."

If you cannot name it, the concept has no position yet. Name it before you open a browser.

---

## 2.5 DESIGN CONTRACT — establish before the scout, when this is a product

**When the build spans more than one surface, OR when the brief describes a product or
service rather than a one-off page, establish `.omd/design.md` before the scout runs.**
The design contract is the upstream authority for every decision the hand makes across
all surfaces. Without it, multi-surface builds drift: the landing page and the dashboard
disagree on radius, voice, and which components are reusable.

Single one-off pages (a single landing, an email template, a static document) may skip
this step — say so explicitly in your handback if you do.

```bash
omd design
```

`omd design` scans the project for evidence (package.json, existing components, token
files, `.omd/frame.md`, `.omd/refs/`) and generates `.omd/design.md` with fourteen
sections, pre-filled from evidence and marked with open questions where evidence is absent.
The generated file passes `omd design --check` immediately; the open questions are for the
hand to fill before the build starts.

Fill in the open questions in the generated file — especially:
- **Brand**: personality, trust signals, and what to avoid.
- **Interaction states**: confirm which states each surface needs.
- **Content voice**: cite the voice study capture from the board.

After filling, run `omd design --check` to verify all sections are complete. The hand cites
design.md sections for every decision; `omd check` will report `DESIGN-INCOMPLETE` for any
section left blank.

---

## 3. REFERENCE — study real things, take the reasoning, leave the pixels

**This is the step that separates design from decoration, and the one you will be most
tempted to skip.** A designer with a concept goes and looks at what already exists.

**Before the scout runs**, check whether the brief contains any image file paths or image
URLs (file extensions `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, or any direct image URL).
If it does, register them as visual targets immediately:

```bash
omd target set <image-path-or-url> --as mockup
# Multiple targets are allowed: register desktop and mobile mockups separately.
omd target list
```

This does nothing to the reference board. It stores the image as a pixel target the build
will converge toward in step 5. The convergence loop replaces eyeballing: an LLM judges
spatial layout poorly by eye, so `omd target diff` measures the gap with a score and a
6×6 cell grid that names the worst-mismatch regions — no estimation required.

If the registered target itself fires slop findings (≥2 violations), report it plainly:
> "The mockup you provided shows N slop signals (IDs) — I'll build toward the layout but
> flag the patterns so you can decide whether to keep them."
Do not silently "improve" beyond the linter output; the user's mockup is the specification.

Before spawning the scout, extract every URL the user included in the brief. Pass them to
the scout verbatim — the scout captures them first, with `--from-user`, before running any
of its own searches. User-provided URLs are exempt from the famous-site quota; the user
chose them, which is already a selection. The slop gate still runs: if a user-provided URL
fires 2 or more slop findings, the scout reports it — "the reference you provided shows N
slop signals — using it as a stated anti-reference" — and the orchestrator surfaces that
sentence to the user before the build begins. Pixel-copying rules are unchanged: measurements
and reasoning only, never "make it look like this one."

Spawn `omd-scout` with the concept, the thing being designed, and any user-provided URLs.
It starts with a component inventory — every nav, card, form field, and footer the build
will need, listed before the first browser opens — then fills a board of **at least eighteen
captures, targeting twenty-five**:

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

**Blueprint capture for user-pointed components.** When the user says "use something like
this nav" or points at a specific component, instruct the scout to add `--blueprint` to that
capture. A blueprint records the component's full node tree with the skin abstracted to color
roles — it is not pixels. The hand can transplant the structure nearly verbatim, remapping
roles to the project's own tokens and re-fitting type sizes to the project's scale. Max 3
blueprints per board: a board of blueprints is a collage.

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

**Name the composition recipe the structure uses.** The composition cookbook lives at
`composition/` under the directory `omd pack dir` prints (in this repo: `core/composition/`) — eight page-level layout recipes (typographic
hero, bento grid, split-screen hero, section inversion, asymmetric grid, editorial index
labels, sidebar margin annotation, sticky sidebar). The committed structure must cite at
least one recipe by file name, or record the reason none applies. This is how the
structure commit moves from intent to implementation contract: the recipe names the
layout, the recipe's conditions confirm it was chosen correctly, and the recipe's
responsive behaviour requirements become the build's responsive checklist.

```bash
omd decision "Hero: typographic-hero.md + section-inversion.md at the proof turn" \
  --why "concept has no photographic identity; the narrative pivot at feature 3 earns one inversion"
```

> An earlier version of this skill generated three candidates — first as parallel subagent
> builds, then as prose sketches — and picked one. Both were theatre: the alternatives were
> invented in one context and judged in the same one, so nothing was actually diverged.
> Three candidates cost three times the tokens and bought a ritual. The real defence
> against the mean is `omd check --category slop`, which *measures* it, and the reframe
> step, which rebuilds when the structure was wrong. Trust those.

---

## 5. BUILD — one thing, properly

Spawn **one** `omd-hand` and build the committed structure. Real files, real CSS, real components.
All the tokens belong here, on the one thing that ships.

`omd render` and `omd check` accept a dev-server URL just as readily as a static file path —
pass `http://localhost:3000` (or whichever port the framework uses) wherever a page
argument is required. For a framework project, start the dev server before running either
command; for a static build, pass the file path directly.

Declare colour, spacing, radius, **type, and motion** as custom properties on `:root`. The
eye reads those as the design system; an inline hex is reported as a defect, correctly.
Typography comes from the reference type studies — a chosen scale and faces with a reason —
never from defaults; motion durations and easing come from the motion study.

**Blueprint transplantation.** When the board includes a blueprint for a component the spec
calls for, pass it to `omd-hand` and instruct it to transplant: rebuild the node tree and
metrics nearly verbatim, map each colorRole to the project's own design tokens (never the
reference's hex values), re-fit type sizes to the project's scale keeping hierarchy ratios,
and write fresh copy in the project's voice. The attribution row must read "transplanted from
`<capture>` (blueprint)" and appear in `.omd/attribution.md`. The page-distance guard still
applies after the build — a transplanted component does not exempt the page from `omd ref
distance`.

The motion cookbook is at `motion/` under the directory `omd pack dir` prints (in this
repo: `core/motion/`) — easing vocabulary in `easing.md`, twelve implementation recipes in `recipes/`. The hand implements motion FROM
the cookbook: each scene in `.omd/motion-spec.md` cites the recipe file it uses and
documents which board-measured values fill the parameter slots. A motion pattern outside
the cookbook requires a written reason in the spec. The hand never fills parameter slots
from a recipe's illustrative defaults — those are examples; the board's motion studies
are the measurements.

**Before writing any animation code**, `omd-hand` writes `.omd/motion-spec.md` — a scene
inventory that documents every animation the build will contain: trigger (load/scroll/hover),
target selector, animated properties, duration and easing with a motion-study citation, and
stagger. The build implements the spec and nothing else. An animation that does not appear
in the spec does not ship. This is how "멋있는 애니메이션 넣어줘" resolves to a specific
set of cited numbers rather than to 500ms ease-in-out from habit.

Every image zone and background section that lacks final photography must ship as a
deliberate alternative — never a grey placeholder box. The graphics cookbook lives at
`graphics/` under the directory `omd pack dir` prints (in this repo: `core/graphics/`) — six recipes (gradient mesh, noise grain,
SVG geometric patterns, CSS illustration primitives, duotone image presets, placeholder
policy). `omd-hand` cites the graphics recipe covering each background treatment in
`.omd/attribution.md`. A custom background not from the cookbook requires a written
reason and must avoid the SLOP-GRADIENT hue bands without a brand citation.

The words are part of the build, and they are where generated work confesses first. The
hand writes copy under two absolute rules: **the frame's language never appears on the
page** (`omd check` measures this — five consecutive words shared with `.omd/` is
SLOP-LEAKED-RATIONALE), and **copy never states what the thing is not** — told "no
clutter", a model writes "No clutter here"; a person writes what is actually there.

If the build reveals the structure was wrong — and sometimes it will — that is what the
reframe step is for. Rebuilding once is cheaper than generating alternatives every time on
the chance it might be.

**Before handing off to the eye, the build is only done when the finish pass is done.**
The finish-pass checklist lives at `craft/finish-pass.md` under the directory `omd pack dir`
prints (in this repo: `core/craft/finish-pass.md`). `omd-hand` walks it after `omd check` returns
clean: `::selection` colour derived from the accent token, focus ring via `:focus-visible`
(not outline suppression — `A11Y-FOCUS-SUPPRESSED` fires on bare suppression), scrollbar
styling with `scrollbar-color`/`scrollbar-width` first and `-webkit-` as the noted fallback,
optical alignment corrections (icon baseline nudge, button padding asymmetry), inline SVG
favicon (no asset file required — the emoji-favicon trick is the minimal variant), and OG
meta tags whose copy passes the same SLOP-COPY rules as the page body. Each item is
implemented or skipped with a written reason in `.omd/decisions.md`. A page without a
favicon and `::selection` colour reads as unfinished regardless of everything else.

**Interaction states are part of the finish pass, not an afterthought.** The finish-pass
checklist (§ Interaction states) requires that every interactive surface has implemented or
explicitly skipped each of the six states: loading, empty, error, success, disabled, offline.
`omd check` reports `DESIGN-FORM-NO-ERROR` when form inputs exist with no error affordance —
this is a `system` violation, not a `slop` warning, and it fails the check the same way a
contrast defect does. If `.omd/design.md` was established in step 2.5, run `omd design
--check` as part of the pre-handoff verification to confirm the design contract is complete.

---

## 6. SEE — look at what actually rendered

You did not make what you think you made.

Render at both viewports, then hand **both** screenshots to the eye. A clamp that works at
1280px can collapse to nothing at 375px; a margin-note that floats correctly on desktop can
cover body text on mobile. One render is a blind spot.

**If visual targets were registered in step 3**, run the target diff loop before rendering
for the eye. This loop converges the build toward the user's mockup using pixel-level
measurement — ceiling 4 iterations:

```bash
omd target diff <page> --json          # uses first target; --target <name> if multiple
# If pass: false — read cells[], fix the worst-mismatch region, build again, re-diff.
# If pass: true — proceed. Maximum 4 iterations total.
```

The diff exits 0 on pass, 1 on fail. The `--json` output names the worst cells by
row/column and pixel coordinate so each iteration has a specific region to improve, not a
vague "make it look more like the mockup" instruction. After 4 iterations, proceed
regardless and include the final score in the eye's brief.

```bash
omd render <page> -o .omd/.cache/build-desktop.png --viewport 1280x800
omd render <page> -o .omd/.cache/build-mobile.png  --viewport 375x812
# Read both PNGs. Actually look at them.

omd render <page> --filmstrip -o .omd/.cache/filmstrip.html --viewport 1280x800
# Read the filmstrip HTML. Four to six frames at 300ms intervals: this is what the user
# sees during load. The eye receives this alongside the static screenshots and can tell
# what appeared when — something a static render cannot show.

omd check  <page> --json           --viewport 1280x800   # deterministic findings, desktop
omd check  <page> --json           --viewport 375x812    # deterministic findings, mobile
omd check  <page> --category slop  --viewport 1280x800   # slop, desktop
omd check  <page> --category slop  --viewport 375x812    # slop, mobile (hit-area fires here)
omd check  <page> --category motion --viewport 1280x800  # motion: MOTION-NO-REDUCED, MOTION-LAYOUT-THRASH, MOTION-UNIFORM
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

The positive standard for what the copy should move toward — not just what it removes —
is `theory/voice.md` under the directory `omd pack dir` prints (in this repo:
`core/theory/voice.md`). The key checks before handing off: sentence-length variance present (short after
long, not uniform rhythm); information front-loaded in each paragraph; no Latinate
nominalisations where a verb would serve; for Korean copy, one speech level held throughout
and vocabulary temperature committed to 고유어 where precision allows.

```bash
# inspect copy, then:
omd check <page> --category slop   # SLOP-PINK-ELEPHANT and SLOP-COPY must come back clean
```

Only when the copy is clean does the eye see the page.

Finally spawn `omd-eye` on the built page. Hand it:
- The desktop screenshot and the mobile screenshot.
- The filmstrip HTML (`.omd/.cache/filmstrip.html`).
- If `.omd/motion-spec.md` exists, its content — the eye reads it as a checklist of
  intended scenes to locate in the frames, never as reasoning to defend. The spec is a
  build artifact: it was written by omd-hand before the code, and the eye was not in
  the room when that decision was made. That boundary is the point — the eye judges the
  gap between spec and frames without access to why the spec says what it says.
- The combined findings from all viewport runs (including motion).
- The primary task from `.omd/frame.md` — the eye runs a task-first UX pass before
  judging aesthetics: entry clarity, feedback on interaction, recovery paths, and mobile
  primary-action reachability. The eye is not defending the frame; it is using it as the
  lens through which to measure whether the build serves the task it was built for.

The filmstrip tells the eye what appeared when during load — information that a static
render cannot carry. When a filmstrip exists, the eye must not judge motion quality from
the static screenshot alone. It sees the renders, the filmstrip, the spec checklist, and
the findings. It does not see the frame, the concept, the reference board, or any other
reasoning. It cannot defend what it was never shown.

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

**When the build produced more than one page**, run `omd check --site <dir>` on the
output directory before shipping. A blog and its index, a landing page and its docs page,
a dashboard and its empty state — pages built together should read as one design system.
`SITE-LADDER-DRIFT` fires when one page carries a 4-step type scale and another a 6-step
one; `SITE-TOKEN-DRIFT` fires when one page uses design tokens throughout and another
falls back to inline values. Either finding means the pages were not built from the same
set of decisions, and the user will feel that drift before they can name it.

```bash
omd check --site ./dist   # or pass the pages explicitly: omd check index.html post.html
```

If violations appear, fix the drifting page before shipping.

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
- **Never critique in the context that built the thing.** Spawn `omd-eye`.
- **Never cite your taste as a reason.** α = 0.248.
- **Never dismiss a slop finding silently.** Fix it, or overrule it in writing.
- **Never let the frame speak on the page.** Rationale lives in `.omd/`; copy sells the
  thing, not the thinking.
- **Never write copy about what the page is not.** State the positive fact instead.
- **Never ship a font the board did not argue for.** If no type study cited it, it is a
  default, not a decision.
- **Never skip step 7** because the work looks finished. Looking finished is exactly when the
  frame is most likely to be wrong.
