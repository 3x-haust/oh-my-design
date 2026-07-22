---
name: omd-ultradesign
description: >-
  Design and build an interface through a human design loop: interrogate the brief,
  research evidence, write real copy first, compose deliberately, compare isolated structural sketches, build
  reflectively, test hierarchy and interaction, critique blind, reframe, and ship.
  Use for UI, page, app, dashboard, blog, landing-page, and redesign requests.
---

# Ultradesign

> **Figma structural-bypass route**: a figma.com link selects one partial graph, not a terminal handoff:
> retain preflight, framing/task coverage, copy, typography proof, production build, craft
> checkpoints, safe probes, glance, sharp critique/refinement, and ship; use `omd-figma` for supplied
> structure and skip only concept hypothesis, scout/reference synthesis, composition authoring, and
> independent sketch divergence/blind selection. Record the retained/skipped phases and the supplied
> structure evidence. Do not run the normal structural graph as a second path.

Give the user the working interface they asked for. Do not expose internal quotas or ask
them to operate the harness. Run host-native agents in fresh contexts; do not create a
workflow engine, queue, model router, or session runtime.

Read `protocol/human-design-loop.md` from `omd pack dir` first. Then read
`protocol/reference-assembly.md`. The reference protocol owns the exact chat-first LEGO stage
order, single owners, artifact boundaries, browser fallback, and final reporting; the human-design
loop owns the remaining phase order, state, evidence precedence, blindness, isolation,
checkpoints, and probe safety. Use the relevant
theory/cookbook files (`theory/`, `composition/`, `graphics/`, `motion/`, `craft/`) instead
of duplicating their rules here. `.omd/` records are English; the interface and handback use
the user's language.

## 0. Preflight and routing

Run `omd doctor`. Stop on a failed prerequisite. For interactive visual research or user-directed
region capture, initialize `browser-rs` first. Only an observed initialization/capability failure
permits headless, reduced-motion `omd render` or `omd probe` as the deterministic Playwright
fallback; record the failure and do not add or try another provider. Pin the absolute working directory first. A Figma
frame or exact visual target uses the single Figma structural-bypass route declared above; it retains
content, craft, glance, probe, critique, and all UX evidence rather than handing the run off or
terminating this loop.

There is exactly one structural-skip route: the Figma structural-bypass above. A full multi-feature
app, an ERP/dashboard/console/CRUD/admin/editor, a data-dense internal tool, or a quiet/product
register is NOT a skip route — a data tool, ERP, dashboard, or console (a tool's operating UI, not its
landing page) is a `product` surface that runs the entire loop: framing with a
task coverage matrix, scout, copy, compose, isolated sketches, hand, glance, blind eye, and the
mandatory RED/GREEN refinement loop. A register selects how "distinctive" is judged — a functional
advantage on a quiet surface — never whether the loop runs. "It is real engineering, a data tool, or
too big for the loop, so build it directly" is a routing defect, not a lawful shortcut.

Stack routing defaults to plain HTML/CSS/JS. A landing, marketing, or content surface is a static
page and needs no framework, so a blank greenfield resolves to plain HTML/CSS/JS. Reach for a
framework (React + Vite + TypeScript, or another) only when the user explicitly asks for one or the
surface is a genuinely stateful application (dashboard, console, CRUD, editor). Always build in an
existing project's stack — a package manifest, a framework/build config (`vite.config`, `next.config`,
`package.json`), or files the user points at — instead of replacing it. A bare
`index.html`/`.css`/`.js` with no manifest, sitting next to an `.omd/` directory from a prior OMD run,
is OMD's own leftover output — not a user stack, and it never pins the stack. The hand runs `omd stack`
before its first production write, records the choice and evidence with `omd decision`, and builds
accordingly. Framework scaffold dependencies (when a framework is chosen) are allowed; existing
projects receive no unnecessary dependencies.
**Deciding the stack is not permission to build it.** No production write happens before the frame
is set and the scout's research is gathered. Creating `package.json`, `tsconfig`, `vite.config`, or
any framework skeleton is a production write owned by the hand phase, never a setup step you run
first. An explicit stack request — even a precise one like `React + Vite + TypeScript` — only records
the `omd stack`/`omd decision` choice; it never licenses scaffolding or building ahead of framing and
research. The framer and the scout always run first: interrogate the brief and gather evidence before
a single file is written. "The stack is already decided, so let me scaffold the project now" is a
routing defect, not a lawful shortcut.

Run `omd config show`. `checkpoint: none` is the default and means no approval waits.
Only `concept`, `structure`, or `both` opt into a human pause at that named point.
Speed comes only from output-neutral structure, never from degrading the result. Two levers, both
of which leave the full-fidelity output unchanged: reuse a coverage-complete `.omd/refs/` inventory when
this working directory already has one for the concept (scout only the missing categories rather
than rebuilding it), and let the scout capture references in parallel with `omd ref add-batch` — one
browser instead of one per reference. The first run in a fresh directory is the slowest because it
builds the inventory; later runs in the same directory are much faster and still full-fidelity. There is
no reduced-quality mode: every run is the real result.

Run `omd taste profile` and pass only that explicit-user profile to the framer. Never use
`--all` for design decisions. Current brief beats current explicit feedback, which beats
prior explicit taste, which beats agent choices. Record conflicts.
  The coordinator owns the complete art-direction sequence and does not delegate direction to
  the writer: (1) receive any host-authorized current-user intent, including either no Beat
  exception or an explicit typed `current-user-beat-exception` event; (2) obtain the evaluator's
  exact-three register assessments; (3) run the host-authorized evaluator-to-art-direction
  check and resolve the selected register/motion; (4) settle every motion obligation and write
  the selected-reference or approved-recipe handoffs; (5) create the immutable
  `art-direction-v1` record; then (6) hand only that finalized record to writer, composer, and
  hand. Writer never compares alternatives or chooses direction. A null Beat-exception receipt
  is the explicit no-exception state; an over-budget Beat set is permitted only when the record
  carries the exact hash of a host-authorized typed exception event. The selected register and
  `motionDecision: none|one` control the macro visual system; quiet or restraint never
  authorizes a generic template or skipped visual work.

## 1. Frame and concept hypothesis

Spawn `omd-framer` with the brief, explicit-user taste profile, and working directory. It
records the primary task, frequent action, costliest error/recovery, the surface
classification (`marketing` | `product` | `editorial` | `mixed`, per `theory/ux.md`
§Surface types), evidence, hypothesis, and trade in `.omd/frame.md`. The surface
classification routes every later stage's grammar: pass it explicitly to the composer,
sketches, hand, and eyes. A brief that asks for a tool (dashboard, console, CRUD/admin,
editor, settings, onboarding, search) is a `product` surface even when phrased like a
site request — do not let the marketing grammar be the silent default.

Read the frame and relevant theory. Explore several distinct candidate concept directions, not a
single guess — each a named generator/metaphor, colour direction, typography register,
surface/material stance, density posture, quiet/confident/showpiece register, and one memorable
moment. Ground them in the brief and evidence, and after the scout's design-gallery visual research
(§2, per `protocol/human-design-loop.md` §Visual reference gallery and concept exploration)
blind-select the strongest main-screen direction and record it — with its rejected alternatives —
using `omd frame generator` plus `omd decision`. The number of directions scales with ambition and
uncertainty. This visual-direction choice is a direction signal only and never replaces the
structural sketch divergence or any UX, copy, type, or critique gate; a generic default visual
system (unstyled controls, flat fields, weak hierarchy, arbitrary whitespace, no distinctive
surface/colour system) fails the visual acceptance gate even when every task passes. Pause only when
config explicitly includes the concept checkpoint.
When the brief explicitly signals visual ambition — 개쩔게, 죽여주게, 미쳤다, 어워드/awards-level,
killer, wow, showpiece — treat it as an explicit user request for the showpiece register and at
least one genuinely novel signature moment, and record it as such. Do not reframe an explicit
ambition brief down into restraint: substance-over-spectacle is the default only when the brief is
silent on ambition; the current brief beats the agent's own taste for restraint. Restraint still
governs *how many* techniques ship (one signature moment, never a catalogue), never *whether* the
explicitly requested showpiece ambition is honored at all.
Silence about ambition is not symmetric across surfaces. A `marketing` surface exists to persuade and be experienced, so a silent brief defaults to at least the `confident` register — one committed signature moment and a deliberate departure from the named generic template, reached by default even from a rough brief — never a quiet document. The silent `quiet`/restraint default is reserved for a `product`/tool-operating surface, where the correct risk is functional (density, scanning, fewer errors). A near-monochrome, evenly-stacked, single-column marketing page whose only carrier is a functional element — a copy button, a nav, a status line — is the silent-default failure, not a lawful restraint choice: the composer records `confident` or higher, and the eye holds its signature-moment floor as reached-by-default, not an aspiration a silent brief may waive.

## 2. Research and copy before structure
  Every research or gathering role fans out its independent source, artifact, and evidence work in
  parallel before joining its findings into the canonical sanitized handoff. A role may not serialize
  independent collection merely to inherit another role's interpretation; join only after each
  applicable branch has produced its own bounded evidence.

Spawn `omd-scout` with the concept, explicit functions or product goal, surface classification,
user references first, and working directory; also pass the component inventory. Require the canonical branch decision before research.
`protocol/reference-assembly.md` requires the scout to complete its fragment inventory, brick
analysis, and candidate assemblies before the coordinator continues. `protocol/composition-contract.md` exclusively
  owns the strict `## Reference synthesis` Markdown ABI; require scout to emit sanitized records
  that use its exact axis keys, dispositions, reasons, and selector rules without a role-local
  schema. Scout preserves explicit user-reference coverage, stable source keys/labels, trust,
  uncertainty, and only applicable axes; it never passes raw source material downstream. Treat
  the scout return as a sanitized summary, never raw transcripts or screenshots. Downstream
  receives sanitized criteria, never raw URLs, screenshots, pixels, or source-page descriptions.
  Resolve conflicts through product task, accessibility/mobile constraints, and one coherent
  design system.
  Require the scout to cover curated design-gallery visual references (Pinterest, Dribbble, Mobbin,
  Behance, Land-book, and equivalents) as a first-class category per
  `protocol/human-design-loop.md` §Visual reference gallery and concept exploration, sanitized into
  the canonical multi-axis synthesis; no gallery image, URL, or pixel travels downstream.
  **List-detail branch:** only for a requested or task-completely inferred list→detail workspace,
  apply the canonical non-primary work-object selection requirement in
  `protocol/human-design-loop.md`; it never creates a default task for other surfaces.
  **Support-chat branch:** only for an explicitly requested or task-completely inferred
  support-ticket conversation, apply the canonical temporal-window merge/split and visible-last-bubble
  regressions in `protocol/human-design-loop.md`; it never applies conversation behavior elsewhere.

After `omd ref check` passes, paste the exact `omd ref candidates` Markdown table directly into
the Codex/Claude chat. It is the sole candidate presentation: never direct the user to a board UI,
HTML, PNG, showcase, or `omd-board`. The coordinator selects the strongest candidate itself and records
it with `omd ref select`, then runs `omd ref check` again, disclosing its choice and reason in
`.omd/decisions.md`; it does not pause to ask the user to pick a candidate, and a candidate the user
explicitly named still wins. Do not invoke composer, eye, or hand yet. Once each applicable
project-owned brief/copy/type/register/palette/material input has its normal clean check, the
coordinator/host derives the two-to-three independent image-first art-direction directions directly
from the selected assembly, the selected references, any project rough, and permitted project-owned
inputs. It does not read `.omd/composition.md` or ask composer for a prompt. With image capability,
generate the drafts concurrently and select one. Without capability, take the CSS/SVG path. Only then
invoke composer: pass its selected sanitized assembly plus the chosen draft, or the selected assembly
plus the CSS/SVG evidence path on the fallback. Never pass raw records, source URLs, screenshots,
pixels, or source-page prose.


  The coordinator does not author copy. The scout's voice/audience evidence is the writer's only dependency;
  remaining fragment capture is independent. Before writer receives an art-direction contract, the coordinator
  completes the host-authorized evaluator → art-direction check → motion settlement →
  selected-reference/recipe handoffs sequence and creates the immutable record. Then spawn `omd-writer`
  concurrently with remaining independent fragment capture, with the brief, cited voice/audience evidence,
  working directory, `protocol/copy-deck.md`, `theory/voice.md`, and the finalized record. It writes only
  `.omd/copy-deck.md`, copying rather than selecting its Register, motionDecision, Beat IDs, and
  Beat-exception receipt. The writer's `Current-user exception` is exactly `N/A — no
  host-authorized Beat exception` for the canonical no-exception marker, or exactly
  `current-user: host-authorized Beat exception` for the exact host receipt; it cannot quote,
  infer, or mint an exception. Quiet permits five Beats and confident/showpiece seven unless that
  exact receipt authorizes more. Run `omd copy --check`; on failure return deterministic findings
  to the writer for autonomous repair. The writer additionally runs `omd text-slop
  .omd/copy-deck.md` as an advisory self-scan; it is non-gating and never replaces the blind copy
  review, but a kept candidate carries a recorded reason. Use affirmative product language; never
  put internal negative instructions into visible copy (for example, “not a hypothetical demo”).

After the first clean check, spawn a fresh `omd-eye` in copy-editor mode with only the
sanitized brief, copy deck/fact ledger, and cited voice/audience evidence. Do not pass renders,
layout, code, build rationale, frame, decisions, or authorship. Before sending its findings
to the writer, preserve and validate the report as specified below. Then send the cleanly
preserved findings to the writer for deck-first revision, rerun `omd copy --check`, and start
sketches only after it passes again. Every shipped claim traces to a verified fact ID;
fixture/open facts never ship. Status/error/empty/recovery copy exists only where applicable.

Before returning the report to the writer, preserve the fresh eye's report verbatim at
`.omd/.cache/copy-eye.md`. The exact copy-eye report format is owned only by
`protocol/human-design-loop.md`; do not restate or alter it. Compute the
reviewed hash before writer revision, then immediately run `omd copy --review-check`. A failure
stops writer revision and divergence until the report format is repaired. The command validates
report structure only; it does not prove blindness or semantic quality and must not compare the
reviewed hash with the current deck. The writer's changed deck and final `omd copy --check` are
separate evidence; never overwrite the report with the final deck hash or claim that the eye
reviewed the revised bytes.

For a `product` or `mixed` surface, and for any multi-surface output, run `omd design`
and complete the durable design contract — its Information architecture and Interaction
states sections are the state discipline (loading, empty, error, success, disabled,
offline: implemented or explicitly skipped with a reason) that keeps a work surface from
shipping happy-path-only. Only a single-surface `marketing`/`editorial` run may skip this
artifact with a recorded reason; that skip never changes stack routing.
For every `product` surface and product screen of a `mixed` surface, the first viewport is owned by the work object at representative working density; never replace it with a marketing hero or decoration.
  For `product` or `mixed` surfaces, the frame owns the `Task coverage matrix` and the composer
  maps every applicable frame `T#` into `UX task coverage` using the canonical schema in
  `protocol/human-design-loop.md`; do not restate or alter that protocol-owned schema.
  The same protocol exclusively owns task-evidence fields, cardinality, cache locations,
  applicability, and validation. The hand binds each existing production-reachable task
  to its production locator and work-object identity, runs declared applicable probes and
  required-viewport renders, then publishes actual evidence with `omd evidence tasks --input
  .omd/.cache/task-evidence-manifest.json` followed by `omd evidence tasks-check --json`.
  Invalid submit remains attemptable and proves an actionable error with the entered value
  preserved; transient evidence is captured only after settlement or reduced motion. Never
  create task rows because a state is reachable or hand-write `.omd/task-evidence.json`. Do not
  invent product task/state/probe evidence or a task-evidence manifest for `marketing`,
  `editorial`, or `static` runs.


## 3. Typography proof before structure

After the second clean copy check, spawn `omd-typesetter` with the copy deck, scout's cited
typography evidence, `protocol/human-design-loop.md`, and `theory/typography.md`. It creates
layout-neutral actual-copy specimens in `.omd/.cache/type-proof/`, renders 1280x900 and
390x844, and writes `.omd/type-proof.md`. It does not design composition, colour, graphics,
or motion and does not rewrite copy.

Spawn a fresh `omd-eye` in typography-proof mode with only the two specimens plus sanitized
copy and requirements. Do not pass authorship, reference rationale, page structure, colour,
or code. Return the blind findings to the typesetter, require revision and both renders
again, and start sketches only after the proof passes. Large type may pass when concept-
bearing and proof-clean; size alone is neither success nor failure.

The proof fingerprint is invalid after any copy, font family/file, requested weight/axis, or
proof container-width change. Rerun the proof instead of carrying an obsolete approval.

## 4. Composition contract before divergence

  Before spawning composer, the coordinator generates and chooses its image-first draft (when a draft
  is available) or takes the CSS/SVG path. Give composer the coordinator-chosen draft, or the selected
  assembly plus the CSS/SVG evidence path. The
  coordinator has already derived prompts and selected/recorded the draft from permitted inputs;
  composer must not supply or revise those upstream directions. Then spawn a fresh `omd-composer`
  with the sanitized frame/concept (including surface classification), clean copy deck, approved
  type proof, scout transfer records,
  `protocol/composition-contract.md`, and `theory/layout.md`. The composition protocol alone
  owns the strict `## Reference synthesis` Markdown ABI: the composer serializes the scout's
  sanitized records exactly in that section, with no duplicate schema, heading, axis, or selector.
  It applies the canonical Branch A/B and clean-room rules in `protocol/human-design-loop.md`
  without creating task rows. The composer writes only `.omd/composition.md`, records required
  fingerprints, and runs `omd composition --check`; validator failure, including missing or
  duplicate canonical axes or selectors, stops divergence. When no durable scout summary exists,
  it records `N/A — reason` rather than inventing evidence.


Require one first-viewport dominant anchor, its visual-mass budget and relationship to
value/proof/visible CTA, plus a visible rejection condition. A visible CTA and predictable
completion path satisfy task reach; the terminal form/control surface need not be above fold
and is not rewarded merely for appearing there. The anchor may use lawful product/evidence
media, explanatory graphics, real interaction/data, or concept-bearing typography—never a
mandatory photo or invented fact/asset. When mechanism/material/workflow is central, Media
roles assigns a lawful carrier or an explicit alternate non-media mental-model carrier with
its limitation; `none because no approved photo` is insufficient.
For the selected art-direction contract, the host/coordinator derives 2–3 independent image-first
directions from the committed palette/type/material, sanitized measured principles, the selected
references, any project rough, and other permitted project-owned inputs before composer starts.
The host/coordinator owns concurrent draft generation, cache management, and blind selection. The
composer may consume only the coordinator-chosen draft as art-direction input. Composer neither
generates nor supplies/revises prompts, inspects raw source material, manages the cache, or selects
a draft. Drafts are design references, never shipped page assets; `omd ref distance` still reports
fidelity as an advisory signal. When image capability is unavailable, use the selected sanitized
assembly and CSS/SVG graphics recipes while still implementing the selected macro visual system.

Run `omd composition --check`. Missing sections, malformed fingerprints, or stale inputs
stop divergence and return to the composer. A later change to frame, copy, type proof, or
scout summary invalidates all dependent sketches and the production build until the contract
is recomposed and passes again.
The composer also runs `omd visual-richness .omd/composition.md` as an advisory carrier read;
`CARRIER-ADVISORY` findings are non-gating prompts to name a purposeful carrier for a content
section; the selected art-direction contract determines the carrier and static/motion treatment.

## 5. Independent structural divergence and blind selection

Gate divergence by structural uncertainty and impact:

- default: two independent `omd-sketch` contexts;
- showpiece or high uncertainty/impact: three;
- skip only when structure is supplied (Figma/target/explicit layout), recording why.

On the normal graph, skipping the composer or sketch divergence is a protocol violation: an
`.omd/composition.md` that passes `omd composition --check` and the blind sketch-selection record are
mandatory ship evidence. The Figma structural-bypass route is the sole exception and records its
explicitly retained/skipped phases; do not run a terminal handoff or a second competing graph.

Give every sketch the same sanitized frame/concept, copy deck, sanitized approved typography
contract, and sanitized composition contract, plus a different anonymous candidate id and
one axis from the contract's Candidate axes section. Include approved dependencies, grid and
alignment behavior, density, focal hierarchy, form grammar, media or approved alternate
mental-model carrier, responsive recomposition, type
roles, family, weight, size/measure, and wrapping constraints; omit source rationale,
rejected alternatives, URLs, and authorship. Sketches preserve both contracts and vary only
their assigned axis. They cannot invent a new type scale, see one another, or read the full
proof, and write only under
`.omd/.cache/sketches/<id>/`. Their real-content low-fi renders contain structure, type
scale, and enough grayscale carrier structure to judge its functional relation—never colour,
motion, polished/decorative graphics, production edits, or sales prose.

Every candidate renders exactly four proofs: fixed desktop 1280x900, fixed mobile 390x844,
full-page desktop continuity, and full-page mobile continuity. Full-page captures use
`--full-page` and are supplemental evidence for narrative dependency and composition rhythm
only; fixed renders remain authoritative for every acceptance dimension.

Spawn a fresh `omd-eye` in sketch-selector mode with anonymous renders, sanitized frame,
copy deck, and the same sanitized typography and composition contracts only. Score exactly:
task/CTA clarity, narrative dependency, composition rhythm, concept-specific form,
responsive hierarchy, type/copy accommodation, interaction/form usability risk, and
accessibility/implementation cost. Do not substitute a generic visual-taste score or expose
candidate, source, typography, or composition rationale.
Use the frozen scale exactly: 0 absent/broken; 1 weak with major failures dominant; 2
adequate and functional with generic or consequential weakness; 3 strong, deliberate, and
robust with only minor weakness; 4 exceptional, unusually coherent/specific with no material
desktop/mobile contradiction. Require eight integer scores, eight one-sentence visible-
evidence rationales, and the arithmetic mean. Reject any contract violation or any dimension
below 2; do not average away a floor failure. Do not equate a form above fold with CTA reach,
and award concept-specific form only when the motif/anchor/carrier has a functional relation
to the domain mechanism, material, workflow, evidence, or action.

Use these frozen dimension-specific anchors. Scores 1 and 3 interpolate only between adjacent
0/2/4 anchors; they are not generic visual-taste scores:

- **Task/CTA clarity** — 0: no immediate primary CTA or completion path; entry or next action
  is ambiguous or blocked. 2: the CTA is visible and usable with an understandable next step,
  but feedback or the path is generic or weak. 4: an immediate primary CTA, predictable
  completion path, and state feedback are unmistakable on desktop and mobile; a terminal form
  is not required above the fold.
- **Narrative dependency** — 0: sections are interchangeable or out of order, or prerequisite
  information is missing or follows the decision that needs it. 2: the sequence is
  understandable, but some sections remain weakly dependent or generic. 4: every section
  answers an entering question and creates a prerequisite for the next; removal or reordering
  visibly weakens the narrative.
- **Composition rhythm** — 0: alignment, visual mass, negative space, span, and density are
  arbitrary or monotonous and obscure hierarchy or sequence. 2: those five properties form a
  workable hierarchy with generic or uneven transitions. 4: alignment, visual mass, negative
  space, span, and density vary deliberately to stage the sequence and dominant anchor across
  desktop and mobile, without an arbitrary break.
- **Concept-specific form** — 0: the result is a generic template or its motif/carrier is
  decorative and unrelated to the domain. 2: a domain relationship is recognizable, but some
  anatomy remains generic or ornamental. 4: motif, anchor, and carrier arise from the domain
  mechanism, material, workflow, evidence, or action and govern functional relationships
  rather than decoration.
- **Responsive hierarchy** — 0: mobile is a shrunken/stacked desktop with lost or cropped
  content, a broken task path, or a broken anchor dependency. 2: usable reflow preserves
  content and task reach, but priority or anchor recomposition is conventional or uneven.
  4: deliberate mobile recomposition preserves semantic order, dominant-anchor morphology,
  priority, and an uninterrupted CTA/task path with no desktop-only dependency.
- **Type/copy accommodation** — 0: real copy truncates, overlaps, becomes placeholder content,
  or breaks Korean wrapping, hierarchy, or CTA labels. 2: real copy fits and hierarchy remains
  understandable, with minor awkward wraps, repetition, or density. 4: real Korean copy,
  repeated data, and CTA labels are fully integrated; measure, wrapping, hierarchy, and
  concept-bearing type remain robust on desktop and mobile.
- **Interaction/form usability risk** — 0: the primary task cannot succeed, or controls,
  focus path, feedback, error/recovery, or a required reachable state is broken. 2: the primary
  task works with adequate controls and states, but feedback, recovery, or an edge state has a
  consequential non-blocking weakness. 4: task success, immediate feedback, focus path,
  duplicate prevention, value preservation, and every applicable recovery/exit are robust in
  supplied probes; inapplicable states are not invented.
- **Accessibility/implementation cost** — 0: contrast, focus/order, reflow, or target reach
  fails, or the structure is impractical and visibly unfinished. 2: the implementation path is
  credible and basic access works, but costly complexity or incomplete finish remains. 4:
  contrast, keyboard focus/order, reflow, target reach, reduced motion, maintainable structure,
  and applicable finish details form a credible, accessible, finished implementation.

When every candidate violates a contract or has any dimension below 2, record **no winner**.
Never lower the floor, select the closest candidate, or hide the failure in the mean. Have the
fresh selector classify the shared failure from visible evidence only as contract-level when
a supplied contract requirement creates the shared contradiction, or execution-level when
the contracts permit success but candidates fail to execute it.

Run at most one bounded recovery round. For a contract-level failure, spawn a fresh composer
with only the sanitized shared visible contract conflict—no candidate renders, scores,
identities, or rationale. Require a revised `.omd/composition.md`, a clean
`omd composition --check`, and a new hash; invalidate every old candidate. Then spawn fresh
sketch contexts for replacements under the revised contract and assigned axes. For an
execution-level failure, preserve the approved contracts and run exactly one bounded
replacement round in fresh sketch contexts, one per candidate. Each replacement receives
the same approved contracts and axis plus
only its own sanitized visible failure and acceptance criteria. Do not pass numeric scores,
the prior render/source, other candidates/renders, or candidate/selector rationale.

Spawn a fresh selector for the replacement set. If none passes, do not retry again: reframe
and stop with visible evidence, or pause only when the configured structure checkpoint
requires a human decision. Never create an execution engine or unbounded retry loop. Record
the winner and rejected tradeoffs only when a candidate actually passes.

## 6. Production build with reflective craft

On the normal graph, spawn `omd-hand` once with the selected structure, sanitized build brief,
copy deck, `.omd/type-proof.md`, `.omd/composition.md`, accepted sanitized transfer criteria, and
the selected lawful local capture projections plus handoff receipts resolved from the current
reference selection. On the normal graph, require `omd composition --check` before its first production write.
The hand must run it and a failure blocks production. The hand must inspect those selected artifacts and implement their selected
macro visual system at the named destination; it never receives raw URLs or unselected source
material. The Figma structural-bypass route is the sole structural-bypass exception: supply
`.omd/figma/snapshot.json`, `.omd/figma/design-system.md`, `.omd/attribution.md`, and the selected
frame inventory instead of composition/transfer inputs; require those artifacts to exist and match the
supplied frame before the first production write. Transfer records never create tasks or probes.
The hand builds semantic
real-content layout first,
then the visual system, then motion. It must record two concrete reflection-in-action loops:

```bash
omd craft checkpoint semantic --render <path> --observed "..." --changed "..."
omd craft checkpoint visual --render <path> --observed "..." --changed "..."
```

The semantic checkpoint occurs after desktop/mobile real-content layout. Then the hand
re-proves typography inside the selected production container at desktop and mobile after
OMD render/IR waits for `document.fonts.ready`. It compares requested versus computed
family/weight, actual Korean/Latin/numerals, wraps, clips, orphans, and hierarchy. The visual
checkpoint occurs only after that reproof and after type/colour/spacing/components, before
motion. Both checkpoints require a change; a gray-box or "no change" ritual does not count.
  Immediately after scaffold/dependency resolution, resolve every newly introduced import/export
  against the exact installed versions, parse generated configuration with its owning tool, and run
  focused typecheck, build, and test-discovery. Repeat this smoke verification after every
  dependency, dependency API, or build-config change; retain the full final verification. For
  dialogs, toasts, and other transient UI, collect evidence only after fonts and
  animations/transitions settle, or under reduced motion, and require visible pixels rather than
  DOM presence alone.

The build acceptance contract verifies the primary task, most frequent action,
costliest-error recovery, an exit from every reachable state, immediate visible feedback,
and mobile reach. It also verifies the focal anchor's morphology, visual-mass budget, and
value/proof/CTA relationship plus the lawful media/alternate carrier's functional relation
and limitation in fixed desktop/mobile renders. It records visible acceptance evidence or a
deviation for the sharp eye. A full form need not occupy the first viewport. The hand uses native semantics, preserves form values on error, blocks
duplicate submits, implements only applicable states, and honors reduced motion.

## 7. Squint before sharp, then safe interaction

Render desktop and mobile squint images before any sharp render is exposed to a critic:

```bash
omd render <page> --viewport 1280x900 --squint -o .omd/.cache/squint-desktop.png
omd render <page> --viewport 390x844 --squint -o .omd/.cache/squint-mobile.png
```

These commands capture the exact viewport by default. `--full-page` is supplementary
continuity evidence only and never replaces fixed-viewport desktop/mobile acceptance renders.

Spawn `omd-glance` with only those images. Preserve its four-line report. Squint isolates
hierarchy; never call it a colour-blind simulation or literal 50ms test.

Production source now exists. Read `protocol/slop-review.md`, run `omd slop scan <root>
--json`, and keep the raw report under `.omd/.cache/`. Triage each candidate as `confirmed`,
`dismissed`, or `needs-render`; candidate presence is not a failed gate, while an untriaged
candidate is. Treat `needs-render` as transitional: obtain sharp evidence and resolve it
before ship. Final untriaged and needs-render counts are both zero. Record durable
repair/dismissal evidence in `.omd/decisions.md`. Do not merge
source candidates with rendered IR warnings or send them to check history/coach; rendered IR
is authoritative where they overlap.

  Use the copy deck's Interaction scope. `stateful` requires explicit non-destructive
  `.omd/probes/primary.json` and `.omd/probes/recovery.json`, with both run through `omd probe`;
  these are baseline probes, not a ceiling on the `Task coverage matrix`. `navigation-only`
  requires and runs only the primary probe; recovery is N/A with a reason. `static` records
  both probes N/A with reasons. Never invent recovery/error/empty UI or product task/state/probe
  evidence for an inapplicable `marketing`, `editorial`, or `static` surface. Probe only local
  files/localhost, declared click/fill/press actions, declared expectations, and optional
  expected tab order. Never auto-discover and click controls; never probe remote production or
  authenticated flows.

## 8. Blind critique, repair, and reframe

Now render sharp desktop/mobile (and filmstrip when motion matters), run deterministic checks, and
spawn an isolated fresh `omd-eye` with only bounded opaque production payload, never references or
source identity. For reference fidelity, separately spawn a fidelity eye with only canonical
selected projections, handoff receipts, the named landing criteria, and sharp/probe evidence. The
fidelity eye verifies the selected macro system at its named destination; neither eye receives raw
source material. Both treat a failed `omd composition --check`, missing/duplicate canonical axes,
or wrong landing as a blocker; validator pass never replaces visual/probe review.
The sharp production review is conjunctive: `signature-fit`, `narrative-fit`, `motion-fit`, and
`decision-fit` must all pass, and every critical 0–4 score (task/CTA clarity, narrative dependency,
composition rhythm, responsive hierarchy) must be at least 3. Neither a mean nor a
high score can average away a binary or floor failure. `motionDecision: one` is exactly one
load-triggered scene observed from page load through its 1500ms settlement window; `none` is no
temporal scene plus a designed static template break. The sharp eye
judges focal hierarchy and the lawful media/alternate mental-model carrier across desktop/mobile,
without demanding a photo, invented asset, or form above fold.

For showpiece only, spawn one additional fresh eye with exactly one dominant-technique lens
chosen from typography, motion, or graphics. It reviews that technique only. Do not create
a permanent specialist or multi-lens panel.

Send prioritized findings back to the hand for the smallest repair, then rerun affected
checks/renders/probe and `omd slop scan`. Confirmed source candidates are repaired; dismissed
ones have evidence; confirmed current candidates are rescanned; final untriaged and
needs-render counts are zero. If rendered evidence changes the problem, run `omd frame reframe --to
... --because ...`; otherwise record why the frame survived.
If a finding requests copy repair, update the deck through omd-writer first, re-run
`omd copy --check`, and only then update source through the hand. Copy, claim, or action
changes invalidate the affected blind copy review and typography proof. The hand never
silently rewrites shipped copy.

## 9. Ship

Verify project tests/build plus `omd check`, two clean copy checks around an independent
writer/editor pass, a blind typography proof before sketches and production-container
reproof before the visual checkpoint, responsive sharp/squint renders, applicable filmstrip, humanize review,
probe, `omd craft status`, `omd design --check` when applicable, `omd ref distance`, bounded target
convergence when a manifest exists, and `omd check --site` for multi-page output. The normal graph also
requires a fresh `omd composition --check`; the Figma structural-bypass route instead requires the
supplied snapshot/design-system/attribution artifacts plus a fresh passing `omd figma diff` for every
selected frame. Source-candidate triage has no untriaged or needs-render items and its
  scan was rerun after repairs. When reference assembly applies, hand off the passing
  `.omd/reference-usage-v2.json` ledger, current `.omd/reference-selection-v2.json`, settled
  `.omd/motion-resolutions/sha256-<digest>.json`, and decision-bound composer/hand
  `reference-handoff-v2` receipts to the finalizer. The finalizer calls
  `generateReferenceReport(root, writer)` with host-authorized `ProjectWriteAdapter`, which alone
  persists `.omd/reference-report.md`; paste the pure formatter's exact Korean-first bilingual
  Markdown unchanged into the final chat. Everything is clean or has an evidence-backed deliberate
  overrule.
Regardless of whether reference assembly applied, close the final chat response with this run's usage: run `omd usage` and include its elapsed-time and token total in your final message to the user. It reads the host session log (Claude Code or Codex); if no log is found it prints a short unavailable note, which you simply omit rather than fabricating a number.
When the run is an iteration with a before/after pair, form the pairwise blind-choose verdict:
blind-choose is the visual distinction signal only; applicable task probes, accessibility checks, and
declared viewport task evidence remain independent passing UX gates. Record the comparison; it never
replaces the blind typography, copy, or critique gates above.

### Refinement rounds (RED/GREEN, evidence-driven)

Every `product`, `marketing`, and `mixed` surface — and any `editorial`/`static` surface with a real
visual system — runs a mandatory RED/GREEN loop: the first shippable build is round 0, never the ship.
Only a trivial content-only surface may ship after one pass, and only with a recorded reason and a clean
slop scan. Write the acceptance criteria (the strict GREEN target) from the frame and
`theory/expressive.md` § "Slop-free is not the same as distinctive": it names the template it resembles
and departs from it; one clear first-read with no two competing primary masses; `omd slop scan` has zero
confirmed candidates and `omd check --category slop` is clean; no reality-depth tell (a form that never
submits, timing theatre standing in for real work, or self-referential in-page trust); `omd ref
distance` recorded (advisory); carrier present and register-fit; and the blind-choose after beats before.
Any unmet criterion is RED.

Then iterate, leaving evidence every round — a round with no evidence does not count:
1. The hand makes one concrete change, then captures sharp desktop/mobile renders into
   `.omd/.cache/rounds/round-<N>/`, measures each visual criterion (glance hierarchy, `omd check`/slop
   scan, `omd ref distance`, carrier read), and reruns every applicable declared task probe,
   accessibility check, and required-viewport task evidence. Any UX invariant failure rolls the round
   back.
   Build and judgment stay separate.
2. Spawn a fresh `omd-eye` — never the hand that built it — with only the sanitized acceptance
   criteria and the two anonymized renders (this round's after and the previous build). It forms the
   blind-choose visual distinction and reports which criteria are still RED. Record its verdict, the
   still-RED criteria, and the evidence paths with `omd decision`; blind-choose cannot overrule a UX
   invariant.
3. Decide continue or stop from the round evidence. CONTINUE only while the applicable UX invariants
   pass, blind-choose favors the after, and RED criteria remain — there is no fixed round budget — then
   fix the single highest-leverage RED target with the same one-concrete-change discipline
   as the craft checkpoints and re-measure. STOP on GREEN (every acceptance criterion met — done), a
   UX regression (rollback), a visual regression (revert to the previous build), a plateau
   (blind-choose tie while still RED). On a plateau, keep the best valid build and report the
   remaining RED. A round with no evidence does not count.
It is not a blind automatic retry: it advances only on measured visual improvement while UX and
beautiful UI remain coequal, and it may run as many rounds as it takes to converge on GREEN — there is
no fixed budget. Round 0 is almost never GREEN
— do not ship the first AI-shaped pass. A one-pass ship is allowed only for a trivial content-only
surface, with a recorded reason and a clean slop scan.
  After all source and approved inputs stop changing, freeze and collect final evidence in the order
  required by `protocol/human-design-loop.md`: run `omd source --seal <root>`, then `omd source
  --check <root>`; build and collect every final check, test, declared/applicable probe,
  fixed-viewport screenshot/render, and applicable motion filmstrip from sealed source; then run
  `omd source --check <root>` again. For `product` or `mixed`, publish the task index with `omd
  evidence tasks --input .omd/.cache/task-evidence-manifest.json`, then `omd evidence tasks-check
  --json`. Write the `final-evidence-v2` manifest at
  `.omd/.cache/final-evidence-v2-manifest.json`; it binds the immutable art-direction record,
  `.omd/reference-selection-v2.json`, settled motion projection, copy receipt, source seal, and
  exactly one branch: `motionDecision: none` with `static-direction-evidence-v1`, or
  `motionDecision: one` with exactly one `motion-evidence-v2`. It contains no unselected
  direction or raw evidence. Publish only with
  `omd evidence v2 finalize --input .omd/.cache/final-evidence-v2-manifest.json --activation
  <host-issued-invocation.json>`, using a final-reviewer-authorized activation. Then run
  `omd evidence v2 check --activation <host-issued-invocation.json> --json`. The sole publication
  marker is `.omd/final-evidence-v2.json`, pointing at one immutable
  `.omd/final-evidence-v2-runs/sha256-<digest>.json` record. Never invoke the v1 finalizer/checker
  or write `.omd/final-evidence.json`; any source or build mutation requires the protocol's
  reseal, rebuild, rerun, and v2 republish sequence. The seal proves byte freshness only and does
  not prove semantic copy/source fidelity.
Deliver the working artifact and briefly state the frame,
concept, structural choice, what the two craft renders changed, glance/critique outcome,
and any deliberate overruling. Do not release, deploy, or wait for further approval unless
the user asked for it.
