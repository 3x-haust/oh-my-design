# Human design loop protocol

This is the durable contract for an OMD run. Host prompts may explain it, but may not
reorder it:

`preflight -> frame -> concept -> research -> writer copy deck -> copy check -> blind copy
edit -> preserve copy-eye report -> copy review-check -> writer revision -> copy check -> typesetter proof -> blind type review -> type
revision/proof pass -> composition contract/check -> structural sketches -> blind selection -> production build ->
semantic checkpoint -> selected-container type reproof -> visual checkpoint -> squint
glance -> source candidate scan/triage -> sharp critique/probe -> repair/rescan -> reframe ->
ship`.

When a run uses visual references, the reference branch follows the exact eight-stage
sequence in `protocol/reference-assembly.md`. That protocol owns its owners, artifact
boundaries, chat presentation, browser fallback, and stop conditions; this protocol does
not create a parallel reference flow.

A request to fix or improve the UX of an existing surface is a reference-worthy run: research how
strong products solve that same UX problem — the specific flow, state, or component — before proposing
changes, rather than applying generic UX rules from memory alone.

## Stack routing

Apply one precedence everywhere: explicit user request > existing repository stack/toolchain
(including existing vanilla HTML) > React + Vite + TypeScript only for a truly blank
greenfield. Plain HTML greenfield requires an explicit user request. There is no autonomous
single-static-surface exception. Before the hand's first write it reads the brief,
package.json when present, and one representative existing surface/component when present,
then records the stack choice and evidence. Preserve and investigate an unrecognised package
or toolchain; never cover it with a React scaffold. Greenfield scaffold dependencies are
allowed. Existing projects receive no unnecessary dependencies.
An "existing repository stack" is a real project the user brought — a package manifest, a build
config, or files the user points at. A bare `index.html`/`.css`/`.js` with no manifest, next to an
`.omd/` from a prior OMD run, is OMD's own leftover output, not a user stack: a fresh brief there is
a greenfield (React + Vite + TypeScript by default), and a prior run's output never pins the stack.
Immediately after scaffold/dependency resolution, resolve every newly introduced import/export
against the exact installed versions, parse generated configuration with its owning tool, and run
focused typecheck, build, and test-discovery. Repeat this smoke verification after every
dependency, dependency-API, or configuration change; retain the full final verification.

## State boundary

Durable, reviewable state lives under `.omd/`: `frame.md`, `scout.md`, `copy-deck.md`,
`type-proof.md`, `composition.md`, `decisions.md`, `design.md`, `attribution.md`, `motion-spec.md`, `craft.jsonl`,
`source-seal.json`, `task-evidence.json`, `task-evidence-runs/*.json`, `final-evidence.json`,
`final-evidence-runs/<runId>.json`, `config.json`, `probes/*.json`, `refs/*.json`, and explicit
taste records. When reference assembly applies, `.omd/reference-board.json`,
`.omd/reference-selection.json`, `.omd/reference-composite-lineage.json`,
`.omd/reference-usage.json`, and `.omd/reference-report.md` are likewise durable bound
records; their raw evidence is scout-only. `task-evidence.json` and `final-evidence.json` are validated current indexes; their
run records preserve immutable prior publications. Reusable intent and final evidence identity
belong there, while generated screenshots and raw execution output do not.

Ephemeral state lives under `.omd/.cache/`: raw build/check/test/probe/render output, renders,
filmstrips, typography specimens, structural candidates, raw source-candidate JSON, and scratch
output. All ordinary evidence artifacts are cache-local; the deliberate published
`.omd/task-evidence.json` index is the sole artifact-path exception. It can be deleted without
erasing a design decision or the durable final-evidence index. Accepted and dismissed candidate
reasoning is durable and belongs in `.omd/decisions.md`.

## Evidence and taste precedence

When evidence conflicts, apply this order and record the conflict:

1. the current brief;
2. explicit feedback from the current user in this run;
3. prior explicit project taste recorded with verbatim evidence;
4. agent choices and legacy/unknown records.

Never infer user taste from an agent selection, silence, an unchanged screen, or legacy
choice data. Coach remains taste-blind.

## Surface grammar

The frame records a surface classification (`uxSurface`: `marketing` | `product` |
`editorial` | `mixed`, per `theory/ux.md` §Surface types) alongside the primary task,
frequent action, and costliest error; `FRAME-UX-INCOMPLETE` flags a frame that skipped any
of the four. The classification selects the composition grammar downstream: a `product`
work surface composes as a task loop over screen regions and reachable states with the
work object as the dominant first-viewport anchor at representative density — never as a
marketing message ladder with a hero band. A `product` or `mixed` surface always completes
the `omd design` contract (information architecture and interaction states) before
production. Selector and critique eyes read their frozen dimensions through the same
grammar: on a product surface a "section" is a screen region or reachable state and the
"CTA" is the frequent action.
## Feature-level reference research and transfer

Reference synthesis starts from function, not mood. Field names, record shape, axis vocabulary, and validation belong exclusively to `protocol/composition-contract.md`. This protocol governs only when synthesis applies and how it flows: select **Branch A — explicit functions** when the user named detailed features, preserving each feature and deriving its interaction primitives directly; add only indispensable connective or recovery primitives, marked as inferred with an assumption. Select **Branch B — product goal only** only for `product` work and product screens of `mixed` work when detailed functions are absent; first record the smallest task-complete feature set and every assumption. Explicit details always win. An inferred addition needs a task-completion dependency and may not add optional analytics, AI, collaboration, personalization, admin, export, or adjacent capability. Pure `marketing`, `editorial`, and static work does not infer CRUD, state machinery, probes, or task evidence; it transfers only explicit applicable content or interaction primitives. User-origin references receive a concrete canonical synthesis record or an explicit decline individually; scout-found sources cannot satisfy an omitted user-reference mention. Source identity stays scout-side: downstream receives only stable source keys/labels, trust, uncertainty, and sanitized rules—not URLs, screenshots, pixels, or source-page descriptions. Synthesis records never issue `T#`, create probes, alter task coverage, or redefine task/final-evidence contracts.
## Visual reference gallery and concept exploration

Function fixes structure; a production-grade result also needs a deliberate visual system, so visual reference discovery is a first-class research obligation, not optional polish. For every surface the scout treats curated design galleries and inspiration sources — for example Pinterest, Dribbble, Mobbin, Behance, Land-book, Godly, Savee, and equivalent boards — as an admissible visual reference category alongside domain and competitor evidence, and captures enough high-craft main-screen references for the product's domain and register to support a visual decision. It sanitizes each into the canonical multi-axis synthesis (macro layout, density, typography, spacing/rhythm, component anatomy, surface/material, colour role, motion). Gallery evidence obeys the same clean-room boundary as every other source: no raw URL, screenshot, pixel sample, or source-page description travels downstream, and no gallery image is copied — only measured, sanitized principles transfer. Build for coverage, not counts, and report no capture quota.

Concept selection is exploratory, not a single guess. Grounded in that gallery and domain evidence, the concept stage enumerates multiple distinct main-screen visual directions — each a named generator/metaphor, colour and typographic register, surface/material stance, density posture, and one memorable moment — then blind-selects the strongest direction and records it durably with its rejected alternatives. The number of directions scales with ambition and uncertainty; an awards-level or explicitly ambitious brief explores more. This visual-direction selection is a direction signal only: it never replaces the structural sketch divergence, the task/accessibility/viewport UX gates, the blind copy/type/critique gates, or the clean-room boundary, and the chosen direction still passes `omd composition --check` and every downstream gate. A result whose visual system is a generic default — unstyled or stock controls, flat undifferentiated fields, weak typographic hierarchy, arbitrary whitespace, or no distinctive surface/material and colour system — fails the visual acceptance gate even when every task succeeds; beautiful production-grade UI and sound UX are co-equal requirements.

Visual-reference assembly is chat-first. The scout presents the exact `omd ref candidates`
Markdown in the conversation; the coordinator records the user choice (or an explicitly
disclosed agent choice when interaction is unavailable) through `omd ref select` and
`omd ref check`. No stage opens or asks the user to open a board UI, HTML, PNG, or
`omd-board`. Interactive browsing and user-directed gallery-region capture use browser-rs
first. Only an observed initialization/capability failure permits headless, reduced-motion
`omd render`/`omd probe` Playwright fallback. Before composer begins, the coordinator/host—not
composer—derives prompts from the hash-bound selected assembly and already-permitted
project-owned brief/copy/type/register material, creates and selects two-to-three independent
clean-room drafts when capable, then records and checks lineage. An unavailable capability is
recorded and checked before composer takes the CSS/SVG path. The rest of the reference workflow,
including the final bilingual report, is governed by `protocol/reference-assembly.md`.
## Support-chat conditional regression
A support-ticket conversation is a conditional primitive regression, never a default grammar. When explicitly requested or task-completely inferred, its transfer requires customer-left/agent-right direction, intrinsic content width with a max-width cap, machine-readable timestamps, a declared temporal compatibility window, temporal grouping that merges consecutive same-sender messages within that window and splits an expired-window reply into a new group with fresh sender/time metadata, distinct internal-note treatment and vocabulary, an anchored composer, and deliberate mobile recomposition. Generic full-width message slabs fail. Production probes/tests prove both temporal boundaries: a same-sender reply within the declared window merges without a duplicate sender/time group, and an expired-window same-sender reply splits into a new group with fresh metadata. After commit, the new bubble must be visibly revealed in the desktop and mobile conversation viewport; a toast or offscreen DOM text alone fails. Require immediate repeated-send regression and visible-last-bubble evidence. Do not apply these conversation traits to non-conversation, marketing, editorial, or static surfaces.

## Task coverage matrix

For `product` and the product screens of `mixed` surfaces, the frame owns `Task coverage matrix`
as a durable section. It is the only issuer of stable rows `T1`, `T2`, and so
on; rows cover every explicit user core task and invariant, not merely the primary
task, frequent action, or costliest error. Each row records the user-visible goal,
start state, minimal actions, success observable, applicable error/recovery, and
required viewport(s). `N/A` is valid only with evidence that the field or task is
inapplicable. These are production tasks and production-reachable states: a component
showcase or gallery is never evidence that a task or state is reachable. `marketing`,
`editorial`, and static-only work does not invent a matrix, tasks, states, or probes;
`mixed` records rows only for its product screens.
For a requested or task-completely inferred list→detail workspace with two or more work objects, the frame includes a production `T#` whose actions open a non-default, non-first object and whose success observable asserts that detail's identity and object-local state. Selection is keyed to the work-object identity, never a fixture identifier or list position; the bound production locator/probe exercises that same non-primary selection. This rule is conditional on that workspace shape and does not impose list-detail tasks on non-list-detail product, marketing, editorial, or static surfaces.

## UX task coverage
This protocol exclusively owns the exact `## UX task coverage` schema, including row syntax,
cardinality, applicability, and locator semantics. Roles may state their mapping responsibility
and point here, but must not restate that schema.

For every applicable frame-owned `T#`, the composer preserves that id and maps it 1:1
into a named `## UX task coverage` section. Each nonblank row in that section uses this
exact syntax: `T# | production: /route | locator: selector |`. There is exactly one row
per applicable `T#` and no showcase, gallery, demo, fixture, or additional prose row.
`/route` is the local production-reachable path; `selector` is the unique stable semantic
action locator for that task at every required viewport. Repeated controls include their
operated work-object identity in the locator contract, and accessible names remain stable
across responsive hiding unless the action itself changes. The mapping realizes the frame
row's goal, actions, success observable, applicable recovery, required viewports, and
`requirements` field through the bound production path, probes, and renders. The hand
consumes these existing mappings; it never creates a new `T#` or a row merely because a
state is reachable. Showcase-only controls and gallery states do not count.

A user-requested invalid submit remains attemptable when it is part of a task: its
production evidence proves an actionable error and preserved entered values. Preventing the
attempt with a disabled control is acceptable only when that prevention matches the user
contract and the row explains why; it must not make a requested invalid-submit path
unreachable. `requirements: invalid-submit` requires an invalid-submit probe; `requirements:
transient` requires settled or reduced-motion PNG pixels for the transient state; `none`
requires neither.

## Task evidence index

For `product` and `mixed` only, the hand writes
`.omd/.cache/task-evidence-manifest.json` from actual production probe plans/results and
desktop/mobile renders, then runs `omd evidence tasks --input
.omd/.cache/task-evidence-manifest.json` followed by `omd evidence tasks-check --json`.
The manifest is schema version `1` with exactly `schemaVersion`, `surface`, `frame`,
`composition`, and `tasks`. `surface` equals the frame's `uxSurface`; `frame` and `composition`
bind their canonical `.omd` paths and SHA-256 values. Every task has `id`, `context: production`,
`production` (`route`, `locator`, `workObject`), actual `probes`, and actual `renders`; optional
`invalidSubmit` and `transient` evidence are present exactly when the frame row's `requirements`
demands them. Every probe record, including `invalidSubmit`, has `role`, `viewport`, plan/result
cache paths, and SHA-256 values. For every viewport required by the frame row, a task has exactly
one `primary` probe; when recovery applies, it has exactly one distinct `recovery` probe for that
same viewport. A probe result must be a successful local production route run. Its activation
step uses the task's production locator, and that same step's declared successful expectations
prove the task outcome. Invalid-submit evidence orders a fill of one field and an enabled
production-locator activation; that activation step's expectations prove the actionable error and
preservation of that same field's entered value.

Each render is a decoded PNG at exactly `1280x900` for `desktop` or `390x844` for `mobile`; it
uses the fixed viewport named by its role, never a full-page substitute. A transient record has
`probeRole`, `viewport`, `stepIndex`, `stateSelector`, `path`, `sha256`, and `captureMode`; it
binds its probe role and exact viewport to the successful activation step at `stepIndex` and its
successful state selector, uses `settled` or `reduced-motion`, and is a decoded fixed-viewport PNG
with a coherent visible state region rather than merely non-uniform pixels. The published
`.omd/task-evidence.json` is the validated immutable production index, not a hand-written
substitute. `marketing`, `editorial`, and static-only runs omit this manifest and index entirely.

When user-origin references exist, the scout records sanitized multi-axis feature/primitive transfers, and the composer preserves each in the canonical `Reference synthesis` plan at its declared destination or explicitly declines it; `omd composition --check` still fails when a user reference is absent. The hand implements each accepted transfer at that landing or records an evidence-backed deviation. The sharp eye verifies visible structural/behavioral correspondence across every applicable accepted axis at the named landing, not token resemblance; interaction correspondence requires matching probe evidence. The clean-room transfer boundary still governs every trait; a reference landing never creates or replaces a frame `T#` task locator.

## Blindness and isolation

The composer owns only `.omd/composition.md`. After typography approval it receives the sanitized frame/concept, clean copy deck, approved type proof, and durable scout summary when present. When reference assembly applies, it starts only after the coordinator has checked lineage: it receives the current hash-bound sanitized selected assembly plus the coordinator-chosen clean-room draft on the generated route, or the checked unavailable lineage plus CSS/SVG evidence path on the unavailable route. It never supplies a draft prompt or upstream art-direction direction, and never receives the internal raw evidence record. Reference transfer input is limited to stable source keys/labels, trust, uncertainty, and sanitized multi-axis feature/primitive rules, adaptations, token variation, conflicts, and destination criteria; it receives no raw screenshots, source files, pixel samples, URLs, source-page descriptions, candidate renders, rejected alternatives, or authorship. It turns evidence into a structural contract, records exact SHA-256 fingerprints, and runs `omd composition --check` before divergence.

Each sketch receives only a sanitized frame/concept, the copy deck, the approved typography
contract derived from `.omd/type-proof.md`, the same sanitized `.omd/composition.md`, an
anonymous candidate id, and one axis from its Candidate axes section. The contracts expose
approved structural dependencies, roles, family, weight, size/measure, and wrapping
constraints, not rejected-alternative rationale or authorship. A sketch preserves both
contracts, varies only its assigned axis, cannot invent a new type scale, cannot read or
reuse another candidate, and writes only to `.omd/.cache/sketches/<id>/`. It preserves the
first-viewport anchor, lawful media or alternate mental-model carrier, uninterrupted CTA
cue/path, and responsive relationships. A visible CTA plus a predictable completion path
proves reach; the terminal form/control surface need not be above fold and earns no credit
merely for being there. A photo is never mandatory.

The copy editor is a fresh eye context and sees only the sanitized brief, copy deck/fact
ledger, and cited voice/audience evidence. It sees no renders, layout, code, build rationale,
frame, decisions, or authorship, and it reports without editing.
This protocol exclusively owns the exact copy-eye report format, including its fields and
cardinality. Roles may state their review or preservation responsibility and point here, but
must not restate that format.
The coordinator first
preserves the report verbatim at `.omd/.cache/copy-eye.md` with exact `Mode: copy-editor`,
`Review time: <ISO 8601 timestamp>`, `Reviewed copy-deck SHA-256: <64 lowercase hex>`,
`Verdict: <non-empty verdict>`, and a non-empty `Findings:` section. It immediately runs
`omd copy --review-check`; a failure stops writer revision and divergence until the report
format is repaired. This gate checks report structure only. It neither proves blindness or
semantic review quality nor requires the reviewed hash to equal the current deck. Only after
the gate passes does the writer receive the findings and revise the deck before another
deterministic check. The writer's revision and final `omd copy --check` are later, separate
evidence. Never replace the reviewed hash with the final deck hash or imply the eye reviewed
bytes it never saw.

The typesetter owns `.omd/type-proof.md` and `.omd/.cache/type-proof/`. It sees the clean
copy deck, typography theory, and scout typography evidence, but does not design composition,
colour, graphics, motion, or rewrite copy. A fresh eye in typography-proof mode sees only
desktop/mobile specimens plus sanitized copy and typography requirements. It never sees
authorship, references, rationale, page structure, colour, or code and never edits.

The selector gets a fresh context and sees anonymous renders plus the sanitized frame, copy
deck, typography contract, and the same sanitized composition contract. It scores exactly:
task/CTA clarity, narrative dependency, composition rhythm, concept-specific form,
responsive hierarchy, type/copy accommodation, interaction/form usability risk, and
accessibility/implementation cost. It never sees candidate prose, author identity, reference
attribution, or the production plan. Each candidate supplies fixed 1280x900 and 390x844
renders plus full-page desktop/mobile continuity captures. Fixed renders govern acceptance;
full-page captures inform only narrative dependency and composition rhythm.

The selector uses the frozen anchors: 0 absent/broken (missing or task-blocking); 1 weak
(major contradictions/failures dominate); 2 adequate (functional and understandable with
generic or consequential weaknesses); 3 strong (deliberate, task-specific, robust, only
minor weaknesses); 4 exceptional (unusually coherent/specific with no material desktop/
mobile contradiction). It reports eight integers, eight one-sentence visible-evidence
rationales, and their arithmetic mean. Contract violation or any dimension below 2 rejects
the candidate; a mean cannot hide a floor failure. It does not equate form-above-fold with
CTA reach or award concept-specific credit to a motif without a functional domain/evidence/
action relationship.

These dimension-specific anchors are frozen. Score 1 or 3 only by interpolating between the
adjacent 0/2/4 anchors; never replace them with a generic taste judgment:

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

If every candidate violates a contract or scores below 2 on any dimension, the selector
returns **no winner**. It never lowers the floor, averages away the failure, or selects the
closest candidate. From visible evidence only, it classifies the shared failure:

- **contract-level** — a supplied contract requirement creates the shared contradiction or
  makes the acceptance criterion impossible to satisfy faithfully;
- **execution-level** — the approved contracts permit a passing answer, but the rendered
  candidates fail to execute it.

Contract-level recovery starts one bounded replacement round with a fresh composer. The
composer receives only the sanitized shared visible contract conflict, never candidate
renders, scores, identities, or rationale; it revises `.omd/composition.md`, runs
`omd composition --check`, and produces a new composition hash. That new hash invalidates
every old candidate. Fresh sketch contexts then produce replacements under the revised
contract and their assigned axes. Execution-level recovery keeps the approved contracts and
also permits exactly one bounded replacement round in fresh sketch contexts. Each replacement
receives the same approved contracts and assigned axis plus only its own sanitized visible
failure and acceptance criteria—never numeric scores, another candidate or render, the prior
render/source, or candidate/selector rationale.

A fresh selector reviews the replacement set. This is the sole recovery round: if no
replacement passes, do not retry again. Reframe and stop with visible evidence, or pause only
when the configured structure checkpoint explicitly requires a human decision. Never create
an automatic retry loop or choose a failing candidate.

The glance receives only squint renders. It never sees sharp renders,
frame, decisions, references, or rationale. The general eye receives only a sanitized
review brief: primary task, costliest error, generator/register, the composition contract's
acceptance criteria without its source rationale—including focal hierarchy and lawful media
or alternate-carrier criteria—renders, and deterministic check/probe
output. For source-candidate judgment it additionally receives only candidate id,
controlled signals, and review question — never path, source excerpt, authorship, or rationale.
It must not read frame, decisions, references, or attribution rationale.
The sharp eye receives only sanitized multi-axis observed rules, adaptations, and destination landing criteria—never source identity, rationale, URL, screenshot, pixels, or source description. It verifies visible or probe-supported correspondence at the landing rather than destination tokens; interaction correspondence requires matching probe evidence. It fails a feature synthesis reduced to interaction-only or token-only treatment when applicable layout or visual-system axes lack an observed rule, adaptation, or reasoned `N/A`; it does not invent axes irrelevant to the feature.

## Divergence and checkpoints

Structural divergence is conditional, not ceremonial: default to two independent sketches;
use three for showpiece work or high structural uncertainty/impact. Skip only when structure
is already supplied (for example, a Figma frame or explicit visual target), and record why.
Every sketch produces four proofs: fixed desktop 1280x900, fixed mobile 390x844, full-page
desktop continuity, and full-page mobile continuity. Full-page evidence is supplemental and
never replaces fixed-viewport acceptance.

The hand builds once. During that build it must render real content and record two craft
checkpoints: semantic layout, then the visual system before motion. After semantic structure
and before the visual checkpoint, it re-proves the approved typography inside the selected
production container at desktop and mobile. Each checkpoint names a concrete observation
and the resulting change. Human approval checkpoints are separate:
`.omd/config.json` defaults to `checkpoint: none`; concept, structure, or both are opt-in.
The hand receives the selected candidate and the same composition contract, runs
`omd composition --check` before its first production write and again before ship, and
records any deliberate deviation with visible evidence. A changed frame, copy deck, type
proof, or scout summary invalidates the contract and stops dependent work until recomposed.
The hand treats focal hierarchy and the lawful mechanism carrier or explicit alternate
mental-model carrier as production acceptance, preserves them responsively, and records
visible evidence or an evidence-backed deviation before the sharp eye judges them.
The hand receives only accepted sanitized transfer criteria, never raw URLs, screenshots, pixels, or source descriptions. It implements each criterion at its destination screen/route and unique semantic reference-landing selector, or records an evidence-backed deviation; transfer records do not create tasks or probes.

## Safe probe policy

Probe only an explicit plan under `.omd/probes/*.json`. Plans are non-destructive and may
use only declared click, fill, and keypress steps with declared expectations. Probe only a
local file or localhost/loopback URL; reject remote, authenticated, credential, destructive,
or undeclared actions. Never discover controls and auto-click them. A probe warning can
come only from an expected tab order or a declared post-action expectation.

Squint rendering is a hierarchy-isolation aid: conservative blur plus grayscale. It is not
a colour-vision simulation and does not reproduce a literal timed first impression.

## Source candidate triage

Read `protocol/slop-review.md`. After production source exists and before the final sharp
verdict, run `omd slop scan <root> --json` into `.omd/.cache/`. Candidate presence is not a
failed gate and is not a linter verdict. The coordinator marks every candidate `confirmed`,
`dismissed`, or `needs-render`. `needs-render` is transitional and must resolve after the
relevant sharp render. The final gate is zero untriaged and zero needs-render candidates. A
fresh eye judges only sanitized candidate metadata against sharp renders. Rendered IR is authoritative when
source and render overlap, and the two evidence streams are never merged or double-counted.

The hand repairs confirmed visual/source findings, then rerenders, runs `omd check`, and
rescans. Copy diagnosis may use humanize and a copy eye, but only the writer changes
`.omd/copy-deck.md`; the deck passes `omd copy --check` before the hand synchronizes source.
Changing copy, a claim, or an action invalidates the relevant blind copy review and type
proof. Durable evidence for a confirmed repair or dismissal goes to `.omd/decisions.md`.

Interaction scope in `.omd/copy-deck.md` owns applicability. `stateful` work requires
explicit `.omd/probes/primary.json` and `.omd/probes/recovery.json`, and both run through
`omd probe`. `navigation-only` requires only the primary probe; recovery copy/probe are N/A
with reasons. `static` records both probes N/A with reasons. Never add fake error, empty, or
recovery UI to make an inapplicable gate look complete. An eye makes interaction claims only
from supplied probe evidence.

## UX acceptance contract

Every applicable surface names and verifies the primary task, most frequent action,
costliest-error recovery, an exit from every reachable state, immediate visible feedback,
and mobile reach. The hand reads the exact `theory/ux.md`, copy deck, and design contract;
uses native semantics; preserves form values on error; blocks duplicate submits; and honors
reduced motion. Loading, empty, error, success, disabled, and offline exist only when the
surface can reach them.

## Production quality gates

These gates are part of every applicable production run, not optional polish:

- The coordinator never authors production copy. After scout, a fresh `omd-writer` writes
  the deck, `omd copy --check` must pass, a fresh eye performs copy-editor mode, the writer
  revises deck-first, and `omd copy --check` passes again before any sketch. A failed check
  stops divergence and is fixed autonomously without waiting for the user.
- Preserve the copy-editor report at `.omd/.cache/copy-eye.md` with reviewed deck hash,
  copy-editor mode/time, verdict, and findings. A post-review writer revision and final copy
  check do not rewrite that hash; the report proves only which bytes were blindly reviewed.
- After the second clean copy check and before sketches, a fresh `omd-typesetter` creates
  actual-copy specimens at 1280x900 and 390x844 plus `.omd/type-proof.md`. A fresh eye reviews
  only sanitized typography requirements and specimens; the typesetter revises and rerenders
  until the proof passes. The proof records roles, source/licence, target glyph coverage,
  requested and computed family/weight evidence, axes, fallback/loading, wraps/clips, rejected
  alternatives, and its invalidation fingerprint.
- After typography proof passes and before sketches, a fresh `omd-composer` writes
  `.omd/composition.md` from sanitized frame, copy, type, and scout-summary inputs. Run
  `omd composition --check`; a missing section, bad fingerprint, or stale dependency stops
  divergence. When no durable scout summary exists, the contract records `N/A — reason`.
- Composition specifies one dominant first-viewport anchor with a visual-mass budget,
  value/proof/CTA relation, and rejection condition. When mechanism/material/workflow is
  central, it specifies lawful media or an explicit alternate non-media mental-model carrier
  with its limitation. It never mandates a photo, invents facts/assets, or treats a terminal
  form above fold as proof of task reach.
- Copy, font family/file, requested weight/axis, or proof container-width changes invalidate
  typography proof and require a rerun. After structure is selected, the hand re-proves the
  type in that real container at desktop/mobile before the visual checkpoint. OMD waits for
  `document.fonts.ready`; computed styles and FontFace status do not identify the physical
  font that painted each glyph.
- Before any animation code, write `.omd/motion-spec.md`. Production implements only its
  declared scenes; every timing/easing cites measured reference or theory evidence.
- Write `.omd/attribution.md` for the sources of shipped tokens, motion, composition, and
  graphics. A deliberate theory choice is still a source; an arbitrary choice is not.
- When reference assembly applies, the hand records the complete production usage ledger and
  the finalizer runs the validator-backed report formatter from
  `protocol/reference-assembly.md` before the final chat handback. The finalizer pastes the
  formatter's exact bilingual Markdown and does not replace it with a vague inspiration claim.
- Walk `craft/finish-pass.md`. Complete applicable items and record a concrete reason for
  every skipped item.
- When `.omd/design.md` exists, run `omd design --check` and resolve its findings.
- Always run `omd ref distance <page>` as an advisory fidelity signal: it reports closeness to each saved reference and never blocks shipping. High similarity to a chosen reference can be intended; record attribution.
- When `.omd/target/manifest.json` exists, run a bounded `omd target diff` repair loop.
  Stop at the configured threshold or record the remaining measured mismatch and evidence;
  never iterate without a bound.
- For multi-page output, run `omd check --site <dir>` and resolve cross-page drift.
- Every `product`, `marketing`, and `mixed` surface — and any `editorial`/`static` surface with a real visual system — runs a mandatory RED/GREEN refinement loop; the first shippable build is round 0, never the ship. Only a trivial content-only surface may ship after one pass, and only with a recorded reason and a clean slop scan. Acceptance criteria written from the frame and `theory/expressive.md` § "Slop-free is not the same as distinctive" are the GREEN target and are strict: it names the template it resembles and departs from it; one clear first-read with no two competing primary masses; `omd slop scan` has zero confirmed candidates and `omd check --category slop` is clean; no reality-depth tell (a form that never submits, timing theatre standing in for real work, or self-referential in-page trust); a carrier present and register-fit; and the blind-choose after beats before. Any unmet criterion is RED. Each round leaves evidence (sharp renders under `.omd/.cache/rounds/round-<N>/`, measured gate results, and the blind-choose verdict) — a round with no evidence does not count. Before accepting a round, rerun every applicable declared task probe, accessibility check, and required-viewport task evidence; all must remain passing or the round rolls back. Blind-choose distinguishes visual quality only and cannot overrule those UX invariants. Round 0 is almost never GREEN — do not ship the first AI-shaped pass. There is no fixed round budget: keep iterating, fixing the single highest-leverage RED target per round, as long as blind-choose shows the after still beating the before, and stop only on GREEN (every criterion met), a regression (revert), or a genuine plateau (blind-choose tie while still RED). It is not a blind automatic retry — every round needs fresh evidence and measured improvement — but it may run as many rounds as it takes to reach GREEN, and it never overrides the gates above.
- Once production source exists, run the source-candidate scan and contextual triage before
  the final sharp verdict. Resolve every triage item, repair and rescan confirmed current
  candidates, and retain evidence for dismissals. Candidate presence alone never fails the
  run; final untriaged and needs-render counts must both be zero.
- Final evidence includes sharp desktop and mobile renders, plus an applicable filmstrip for
  motion, `omd check`, humanize review, declared/applicable probes, and project tests/build.
  Findings must be clean or deliberately overruled with written evidence; silence is not an overrule.
- After all production source and approved inputs stop changing, run `omd source --seal <root>`
  and then `omd source --check <root>`. Build and collect every final check, test,
  declared/applicable probes, fixed-viewport screenshot/render, and applicable motion filmstrip
  from that sealed source; run `omd source --check <root>` again. The hand then writes the
  strict metadata manifest at `.omd/.cache/final-evidence-manifest.json`, runs
  `omd evidence finalize --input .omd/.cache/final-evidence-manifest.json`, and runs
  `omd evidence check --json`. Never write `.omd/final-evidence.json` directly: only
  `omd evidence finalize` publishes it. Each successful finalize creates the immutable per-run
  record `.omd/final-evidence-runs/<runId>.json` and atomically publishes the full current
  manifest at `.omd/final-evidence.json`.
  This protocol is the canonical final-evidence ABI and owns the manifest schema. The manifest
  has exactly `schemaVersion`, `runId`, `sourceSeal`, `build`, `tools`, `interaction`, and
  `artifacts`; `sourceSeal` is canonical `.omd/source-seal.json` plus its SHA-256, `build`
  records target, fingerprint, and served target, and `tools` records non-empty versions and
`interaction` is exactly `{scope: stateful|navigation-only|static, motion:boolean,
surface: marketing|product|editorial|mixed}`; `surface` must equal the frame's `uxSurface`.
Every ordinary artifact has a globally unique cache-local path under `.omd/.cache/` and a
SHA-256; the deliberate `task-evidence` artifact alone is `.omd/task-evidence.json`. Check and
test are required; probes use strict `primary`/`recovery` roles (`stateful`: exactly one of each;
`navigation-only`: exactly one primary and no recovery; `static`: none); screenshot/render
records carry desktop/mobile viewport roles and include both; and a filmstrip is present exactly
when motion is true. Raw artifacts remain in `.omd/.cache/` and are never embedded in the durable
index. Any source or build mutation invalidates the bundle and forces resealing, rebuilding,
rerunning, and reindexing.
  To recover a stale bundle, do that sequence again with a new `runId`, write a new manifest, then
  finalize and check it: a different `runId` after reseal, rebuild, or rerun may supersede the
  current manifest while preserving every prior run record. An existing same `runId` is an
  `EEXIST` conflict that fails closed; never retry it by manually deleting either the current
  manifest or a per-run record. The seal proves byte freshness for copy deck, type proof,
  composition, and sorted production source files only; it does not claim semantic copy/source
  fidelity.

`omd render` captures the exact requested viewport by default. Use `--full-page` only as
supplementary continuity evidence; it never replaces the fixed desktop/mobile viewport
captures used for hierarchy, critique, or acceptance.
