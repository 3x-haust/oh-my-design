---
name: omd-ultradesign
description: >-
  Design and build an interface through a human design loop: interrogate the brief,
  research evidence, write real copy first, compose deliberately, compare isolated structural sketches, build
  reflectively, test hierarchy and interaction, critique blind, reframe, and ship.
  Use for UI, page, app, dashboard, blog, landing-page, and redesign requests.
---

# Ultradesign

> **Figma routing**: when the brief contains a figma.com link, hand off to `omd-figma`
> instead of running this loop. The design decisions — concept, colour, type, layout —
> were already made in Figma; the frame/concept/reference steps here are not needed.

Give the user the working interface they asked for. Do not expose internal quotas or ask
them to operate the harness. Run host-native agents in fresh contexts; do not create a
workflow engine, queue, model router, or session runtime.

Read `protocol/human-design-loop.md` from `omd pack dir` first. It owns phase order, state,
evidence precedence, blindness, isolation, checkpoints, and probe safety. Use the relevant
theory/cookbook files (`theory/`, `composition/`, `graphics/`, `motion/`, `craft/`) instead
of duplicating their rules here. `.omd/` records are English; the interface and handback use
the user's language.

## 0. Preflight and routing

Pin the absolute working directory and run `omd doctor`. Stop on a failed prerequisite.
If the user supplied a Figma frame or exact visual target, route to `omd-figma`/target
convergence for structure; this loop still uses content, craft, glance, probe, and critique.

Apply stack precedence exactly: explicit user request > existing repository stack/toolchain
(including existing vanilla HTML) > React + Vite + TypeScript only for a truly blank
greenfield. Plain HTML greenfield requires an explicit user request; there is no autonomous
single-static-surface exception. Preserve and investigate unrecognised package/toolchain
evidence instead of replacing it with React. Greenfield scaffold dependencies are allowed;
existing projects receive no unnecessary dependencies.
Plain HTML/CSS/JS for a blank greenfield requires the explicit user request quoted verbatim in the
stack `omd decision`. Absent a matching verbatim user quote, a truly blank greenfield is React +
Vite + TypeScript — never infer, assume, or paraphrase a pre-authorization. A decision that claims
the brief "pre-authorized plain HTML" without a verbatim user quote that actually says so is a
stack-routing defect, not a lawful shortcut.
"Existing repository stack" means a real project the user brought: a package manifest, a framework
or build config (`vite.config`, `next.config`, `package.json`, etc.), or files the user explicitly
points at. A bare `index.html`/`.css`/`.js` with no manifest and no build config, sitting next to an
`.omd/` directory from a prior OMD run, is OMD's own leftover output — not a user stack. A fresh
design brief in that folder is a greenfield (React + Vite + TypeScript by default), not a
continuation of the leftover HTML; do not let your own previous output pin the stack to vanilla.
Testing repeatedly in one directory reuses the `.omd/refs/` board (fine, output-neutral) but never
reclassifies a greenfield as an existing HTML project.
The hand runs `omd stack` before its first production write and builds in exactly the stack it
computes from folder evidence — a blank greenfield resolves to React + Vite + TypeScript
deterministically, so the model never talks itself into plain HTML for a one-page site. The only
lawful override is a verbatim explicit user request for HTML.

Run `omd config show`. `checkpoint: none` is the default and means no approval waits.
Only `concept`, `structure`, or `both` opt into a human pause at that named point.
Speed comes only from output-neutral structure, never from degrading the result. Two levers, both
of which leave the full-fidelity output unchanged: reuse a coverage-complete `.omd/refs/` board when
this working directory already has one for the concept (scout only the missing categories rather
than rebuilding it), and let the scout capture references in parallel with `omd ref add-batch` — one
browser instead of one per reference. The first run in a fresh directory is the slowest because it
builds the board; later runs in the same directory are much faster and still full-fidelity. There is
no reduced-quality mode: every run is the real result.

Run `omd taste profile` and pass only that explicit-user profile to the framer. Never use
`--all` for design decisions. Current brief beats current explicit feedback, which beats
prior explicit taste, which beats agent choices. Record conflicts.

## 1. Frame and concept hypothesis

Spawn `omd-framer` with the brief, explicit-user taste profile, and working directory. It
records the primary task, frequent action, costliest error/recovery, evidence, hypothesis,
and trade in `.omd/frame.md`.

Read the frame and relevant theory. Form one concept hypothesis: generator/metaphor,
colour direction, typography register, quiet/confident/showpiece register, and one memorable
moment. Ground it in the brief/evidence and record it with `omd frame generator` plus
`omd decision`. Pause only when config explicitly includes the concept checkpoint.
When the brief explicitly signals visual ambition — 개쩔게, 죽여주게, 미쳤다, 어워드/awards-level,
killer, wow, showpiece — treat it as an explicit user request for the showpiece register and at
least one genuinely novel signature moment, and record it as such. Do not reframe an explicit
ambition brief down into restraint: substance-over-spectacle is the default only when the brief is
silent on ambition; the current brief beats the agent's own taste for restraint. Restraint still
governs *how many* techniques ship (one signature moment, never a catalogue), never *whether* the
explicitly requested showpiece ambition is honored at all.

## 2. Research and copy before structure

Spawn `omd-scout` with the concept, component inventory, user references first, and working
directory. Require coverage across domain, competitors, user/community evidence,
typography, voice, relevant motion, and every required component. Accept no count theater,
pixel copying, low-trust laundering, slop contamination, or kinship.
The scout returns a sanitized summary — measured invariants, principles, coverage, and source
trust — never raw transcripts or screenshots, and captures its reference board in parallel with
`omd ref add-batch` (one browser). Its voice/audience evidence is the writer's only dependency; the
browser-heavy visual board is not, so the scout delivers voice/audience evidence first.

The coordinator does not author copy. Once the scout's voice/audience evidence is in hand, spawn
`omd-writer` concurrently with the scout's remaining board capture — the writer drafts the copy deck
while the board finishes building. Give it the brief, that cited voice/audience evidence, working
directory, `protocol/copy-deck.md`, and `theory/voice.md`.
It writes only `.omd/copy-deck.md`. Run `omd copy --check`; on failure stop divergence and
send the deterministic findings back to the writer for autonomous repair without waiting
for the user.
The writer additionally runs `omd text-slop .omd/copy-deck.md` as an advisory self-scan; it is
non-gating and never replaces the blind copy review, but a kept candidate carries a recorded reason.

After the first clean check, spawn a fresh `omd-eye` in copy-editor mode with only the
sanitized brief, copy deck/fact ledger, and cited voice/audience evidence. Do not pass renders,
layout, code, build rationale, frame, decisions, or authorship. Before sending its findings
to the writer, preserve and validate the report as specified below. Then send the cleanly
preserved findings to the writer for deck-first revision, rerun `omd copy --check`, and start
sketches only after it passes again. Every shipped claim traces to a verified fact ID;
fixture/open facts never ship. Status/error/empty/recovery copy exists only where applicable.

Before returning the report to the writer, preserve the fresh eye's report verbatim at
`.omd/.cache/copy-eye.md`. It uses these exact fields:
`Mode: copy-editor`,
`Review time: <ISO 8601 timestamp>`,
`Reviewed copy-deck SHA-256: <64 lowercase hex>`,
`Verdict: <non-empty verdict>`, and a non-empty `Findings:` section. Compute the reviewed hash before writer revision, then
immediately run `omd copy --review-check`. A failure stops writer revision and divergence
until the report format is repaired. The command validates report structure only; it does not
prove blindness or semantic quality and must not compare the reviewed hash with the current
deck. The writer's changed deck and final `omd copy --check` are separate evidence; never
overwrite the report with the final deck hash or claim that the eye reviewed the revised
bytes.

For multi-surface products, run `omd design` and complete the durable design contract. A
one-surface run may skip only this design-contract artifact with a recorded reason; that
skip never changes stack routing.

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

Spawn a fresh `omd-composer` with only the sanitized frame/concept, clean copy deck,
approved type proof, durable scout summary when present, `protocol/composition-contract.md`,
and `theory/layout.md`. Do not pass raw screenshots, page source, assets, pixel samples,
URLs, candidate renders, rejected alternatives, authorship, or production rationale. The
composer writes only `.omd/composition.md` and records exact SHA-256 fingerprints for the
frame, copy deck, type proof, and scout summary. When no durable scout summary exists it
records `N/A — reason` instead of inventing evidence.

Require one first-viewport dominant anchor, its visual-mass budget and relationship to
value/proof/visible CTA, plus a visible rejection condition. A visible CTA and predictable
completion path satisfy task reach; the terminal form/control surface need not be above fold
and is not rewarded merely for appearing there. The anchor may use lawful product/evidence
media, explanatory graphics, real interaction/data, or concept-bearing typography—never a
mandatory photo or invented fact/asset. When mechanism/material/workflow is central, Media
roles assigns a lawful carrier or an explicit alternate non-media mental-model carrier with
its limitation; `none because no approved photo` is insufficient.
For a confident/showpiece register where the composition is the deliverable, and when the host
provides an image-generation capability, the composer runs the image-first art direction in
`theory/imagegen.md`: it directs 2-3 art-directed concept-draft mockups seeded by the clean-room
structural grammar (measured principles and skin-abstracted blueprints) plus the committed
palette/type/material, picks the strongest, and records it as the reference-fidelity direction the
contract implements against. Drafts are design references stored under `.omd/.cache/imagegen/`, never
shipped page assets; `omd ref distance` still gates the shipped build. A quiet register or a host with
no image capability skips this and records why.

Run `omd composition --check`. Missing sections, malformed fingerprints, or stale inputs
stop divergence and return to the composer. A later change to frame, copy, type proof, or
scout summary invalidates all dependent sketches and the production build until the contract
is recomposed and passes again.
The composer also runs `omd visual-richness .omd/composition.md` as an advisory carrier read;
`CARRIER-ADVISORY` findings are non-gating prompts to name a purposeful carrier for a content
section, and a `quiet` register legitimately yields none.

## 5. Independent structural divergence and blind selection

Gate divergence by structural uncertainty and impact:

- default: two independent `omd-sketch` contexts;
- showpiece or high uncertainty/impact: three;
- skip only when structure is supplied (Figma/target/explicit layout), recording why.

Skipping the composer or the sketch divergence is a protocol violation, not a shortcut: an
`.omd/composition.md` that passes `omd composition --check` and the blind sketch-selection record
are mandatory ship evidence. Never collapse frame → composition → divergence → blind-select into a
single inline build; a production write with no composition contract and no selected sketch is
redone, not accepted.

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

Spawn `omd-hand` once with the selected structure, sanitized build brief, copy deck,
`.omd/type-proof.md`, `.omd/composition.md`, and reference measurements/principles. Require
`omd composition --check` before its first production write. The hand builds semantic real-content layout first,
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
`.omd/probes/primary.json` and `.omd/probes/recovery.json`, with both run through `omd probe`.
`navigation-only` requires and runs only the primary probe; recovery is N/A with a reason.
`static` records both probes N/A with reasons. Never invent recovery/error/empty UI for an
inapplicable surface. Probe only local files/localhost, declared click/fill/press actions,
declared expectations, and optional expected tab order. Never auto-discover and click
controls; never probe remote production or authenticated flows.

## 8. Blind critique, repair, and reframe

Now render sharp desktop/mobile (and filmstrip when motion matters), run deterministic
checks, and spawn a fresh `omd-eye`. Pass only the sanitized review brief: primary task,
costliest error, generator/register, renders, check output, probe output, the immutable
glance report, the composition contract's acceptance criteria without source rationale, and
for source-candidate judgment only candidate id, controlled signals, and
review question. Do not pass candidate path or excerpt, frame, decisions, refs, attribution
rationale, source authorship, or build transcript.
The sharp eye explicitly judges focal hierarchy and the lawful media/alternate mental-model
carrier across desktop/mobile, without demanding a photo, invented asset, or form above fold.

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
probe, `omd craft status`, a fresh `omd composition --check`, `omd design --check` when applicable,
`omd ref distance`, bounded target convergence when a manifest exists, and `omd check --site`
for multi-page output. Source-candidate triage has no untriaged or needs-render items and its
scan was rerun after repairs. Everything is clean or has an evidence-backed deliberate overrule.
When the run is an iteration with a before/after pair, form the pairwise blind-choose verdict:
blind-choose is the sole gating signal, with quantitative and Awwwards reads as advisories only.
Record the comparison; it never replaces the blind typography, copy, or critique gates above.

### Refinement rounds (RED/GREEN, evidence-driven)

For a confident/showpiece register — and always when the brief signals awards-level ambition — the
first shippable build is not the ship: it is round 0 of a bounded RED/GREEN loop. First write the
acceptance criteria (the GREEN target) from the frame and `theory/expressive.md` § "Slop-free is not
the same as distinctive": for example, names the template it resembles and departs from it; no two
competing primary masses; one clear first-read; slop scan clean; `omd ref distance` <= 0.6; carrier
present and register-fit; and the blind-choose after beats before. Any unmet criterion is RED.

Then iterate, leaving evidence every round — a round with no evidence does not count:
1. The hand makes one concrete change, then captures sharp desktop/mobile renders into
   `.omd/.cache/rounds/round-<N>/` and measures each criterion (glance hierarchy, `omd check`/slop
   scan, `omd ref distance`, carrier read).
2. Spawn a fresh `omd-eye` — never the hand that built it — with only the sanitized acceptance
   criteria and the two anonymized renders (this round's after and the previous build). It forms the
   blind-choose and reports which criteria are still RED. Record its verdict, the still-RED criteria,
   and the evidence paths with `omd decision`. Build and judgment stay separate.
3. Decide continue or stop from the round evidence. CONTINUE only while the blind-choose favors the
   after AND RED criteria remain AND the round budget (default 3) is not spent — then fix the single
   highest-leverage RED target with the same one-concrete-change discipline as the craft checkpoints
   and re-measure. STOP on GREEN (every acceptance criterion met — done), a regression (revert to the
   previous build), a plateau (blind-choose tie while still RED), or the budget (keep the best build
   and report the remaining RED). A round with no evidence does not count.

The loop is bounded and never an automatic retry: it advances only on measured improvement and
converges on GREEN or the budget. A quiet register may ship after one pass with a recorded reason.
After final source and approved inputs stop changing, run `omd source --seal <root>` and
immediately `omd source --check <root>`. The seal is byte-freshness evidence for copy deck,
type proof, composition, and the sorted production source set; it does not prove semantic
copy/source fidelity. Any later source or approved-input change requires resealing.
Deliver the working artifact and briefly state the frame,
concept, structural choice, what the two craft renders changed, glance/critique outcome,
and any deliberate overruling. Do not release, deploy, or wait for further approval unless
the user asked for it.
