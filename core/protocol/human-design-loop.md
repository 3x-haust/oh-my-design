# Human design loop protocol

This is the durable contract for an OMD run. The adaptive route consumes the current task outcome,
UX policy, evidence claims, reference-discovery decision, design axes, selected-model capability
profile, decision-linked browser context, and validated-learning context. The user-selected model
owns role, stage, and optional-method order within their actual dependencies; this protocol does not
supply a universal sequence.

`protocol/design-practice.md` defines how the selected work practices the motto "AI that designs
like a human": uncertainty-led tests, evidence-aware framing, independent alternatives, reflection,
critique, and scoped learning. It is a source-free method contract, not an additional stage gate.

Scope lock, required outcomes, hard safety rails, project-write authority, activation, source sealing,
final-v2 evidence, independent review, and user-selected-model ownership are mandatory. Optional work
such as domain analysis, framing, discovery, copy isolation, typography proof, composition,
divergence, art direction, reflection-in-action, reference-distance work, and refinement is present
only when selected by the typed route. Every
optional omission has a written reason. When a method is selected, its owner, artifact boundary,
validation, browser fallback, and stop conditions in this protocol and its specialized protocol apply
without weakening.

Reference discovery is selected from task need, uncertainty, and existing evidence. Selected
discovery researches the named unresolved decision and stops at coverage. A justified skip uses and
records sufficient existing evidence. No route has a universal capture or candidate quota.

Every research or data-gathering step — the framer's subject research and cited-evidence gathering, the scout's reference, gallery, and domain research — issues its independent searches, captures, and lookups in parallel, not one at a time. A serial gathering pass is a defect to avoid: gather concurrently, then reconcile.

## Surface outcomes and execution requirements

Before route publication, preserve the complete original request and distinguish what the product
must do from how the run must be performed. `taskOutcome.mustHave`, `mustNotHave`, and
`completionEvidence` carry product/surface outcomes. The browser evaluator must cover every one;
visible boilerplate cannot stand in for a working interaction, preserved input, or recovery.

Use the optional `taskOutcome.executionRequirements` array for execution-only constraints. Each
entry preserves the requirement and binds `enforcedBy` to the exact existing host gates printed by
`omd schema route-input`. For example, authorized production writing binds `project-write-boundary`;
independent review and terminal completion bind `independent-review`, `final-evidence-v2`, and
`completion-preflight`. These declarations carry no verdict, script, selector, or arbitrary checker.
Unsupported requirements remain blocked; declaring a browser check does not establish native app
installation or native behavior. Do not move a failed product behavior into this array.

Execution requirements remain in the immutable source contract and its hash. They are not counted
as entry-surface DOM witnesses or browser outcome scripts and are omitted from the visual review's
surface projection. The terminal preflight reports their gate bindings only after current final
evidence, independent review, and completion prerequisites pass. Earlier browser success cannot
claim that a future preflight ran. This is separation of evidence types, not a weaker success rule.

If a published route misclassified an execution requirement as a browser outcome, preserve the
failure and source record; do not silently delete it or replace it with page text. Correct the
classification in a fresh authorized route, then reissue all affected contracts and evidence.

## Domain analysis

When the adaptive route selects domain analysis, it records `.omd/domain-brief.json`
(`domain-brief-v1`, validated by `omd domain check`). This method identifies the
domain, its canonical surfaces, its core objects, and its audience, and emits the scout's two-role
reference queries (component design and top-tier craft). An unfamiliar domain or named product is
researched, not guessed. It feeds the frame and the scout; it never designs or writes code. The full
contract is `protocol/domain-analysis.md`.

## Stack routing

Default to plain HTML/CSS/JS: a landing, marketing, or content page is a static page and needs no
framework. Reach for a framework (React + Vite + TypeScript, or another) only when the user explicitly
asks for one or the surface is a genuinely stateful application (dashboard, console, CRUD, editor).
Always build in an existing repository's stack instead of replacing it — a package manifest, a build
config, or files the user points at. A bare `index.html`/`.css`/`.js` with no manifest, next to an
`.omd/` from a prior OMD run, is OMD's own leftover output, not a user stack, and never pins the
stack. Before the hand's first write it reads the brief, package.json when present, and one
representative existing surface/component when present, then records the stack choice and evidence
with `omd decision`. Framework scaffold dependencies (when a framework is chosen) are allowed; existing
projects receive no unnecessary dependencies.
Deciding the stack is not permission to build it. Production writes — including creating `package.json`, `tsconfig`, `vite.config`, or a framework skeleton — remain owned by the hand and begin only after every prerequisite selected by the adaptive route is current. A reasoned skip creates no phantom artifact prerequisite; a missing selected prerequisite blocks production.
Immediately after scaffold/dependency resolution, resolve every newly introduced import/export
against the exact installed versions, parse generated configuration with its owning tool, and run
focused typecheck, build, and test-discovery. Repeat this smoke verification after every
dependency, dependency-API, or configuration change; retain the full final verification.

## State boundary

**[active-route-quiescence]** Route, source-contract and locale-context changes wait for every
active role to return. Delegated authority is bound to the exact current route/source/authority
bytes; a concurrent reclassification invalidates valid owner work before it can publish. Prepare
these inputs before launch. Independent role-owned artifacts may still progress concurrently when
the execution plan permits it. If observation reveals a needed strategy change, record the finding,
wait on the existing handles, then reclassify and issue fresh briefs. Do not relax the child's
currentness checks, reuse its old activation or reconstruct its rejected publication.

**[production-project-quiescence]** The Codex production-owner transaction requires an exclusive
project-write interval, not merely exclusive access to source files. Prepare project-local briefs,
task inputs, contract copies, and result destinations before launch. Until the signed owner result
returns, the coordinator and all other owners are read-only across the entire project, including
`.omd/.cache`. Do not save pack excerpts, redirect diagnostic logs into the project, publish proofs,
or invoke commands with implicit project writes during that interval. Even a coordinator-owned
audit-file change is outside Hand's source-only transaction and can trigger rollback. Non-writing
status/log reads and waiting on the existing handle remain allowed; project publications resume
only after the transaction returns. Preserve failed receipts and the host's mutation/retry limits;
never clear authority or relabel a failure to restart a rejected owner.

Durable, reviewable state lives under `.omd/`: `domain-brief.json`, `frame.md`, `scout.md`, `copy-deck.md`,
`type-proof.md`, `composition.md`, `decisions.md`, `design.md`, `attribution.md`, `motion-spec.md`, `craft.jsonl`,
`source-seal.json`, `task-evidence.json`, `task-evidence-runs/*.json`, `final-evidence.json`,
`final-evidence-runs/<runId>.json`, `config.json`, `probes/*.json`, `refs/*.json`, and explicit
taste records. When reference assembly applies, `.omd/reference-board.json`,
`.omd/reference-selection.json`,
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

Expression register never changes surface grammar. `quiet` and `showpiece` describe expressive
intensity; `marketing`, `product`, `editorial`, and `mixed` describe the surface. Quiet marketing
still carries a marketing message hierarchy and evidence-backed carrier. A showpiece product still
earns its form from the work object, task states, and interaction rather than marketing theatre.

## Greenfield authenticity

A greenfield run starts from the user's prompt, not from an existing product, brand, content
library, or interface. The absence of those things is a constraint, never permission to simulate
them. The frame records whether the subject, brand, operational facts, records, people, metrics,
media, and capabilities are supplied, verified, explicitly requested as demo material, or unknown.
Unknown material stays absent or is visibly labelled as a demo; it never ships as implied reality.

For a prompt-only product, reference research begins with real domain product screens, task flows,
content density, interaction anatomy, and the audience's language. Style galleries may support a
named expressive question only after domain conventions are understood; they never supply the
product model. The result does not invent a startup name, logo, case number, customer, technician,
status, metric, testimonial, photograph, diagnostic annotation, or operational precision merely to
make a blank project feel inhabited.

Product distinction comes from the task model, representative content, hierarchy, information
density, interaction, and responsive behavior. It does not require a decorative carrier, signature
moment, static template break, visual metaphor, display headline, English micro-label, ornamental
metadata, or systematic annotation layer. Each visible device must either help the current task,
orient the user, carry verified content, explain state, enable action, provide feedback, or support
recovery. A quiet product may intentionally use ordinary controls, a true-white ground, one semantic
accent, and no decorative scene when that is the most credible expression of the task.

Desktop and mobile sharp renders receive a separate `reality-fit` review before completion. The
review rejects concept theatre: invented brand or operational evidence, marketing hierarchy on a
work surface, stock or generated media presented as factual evidence, decorative technical
annotations, English labels used only as style, exaggerated headings for routine state, controls
that appear before their prerequisite decision, desktop sections merely stacked on mobile, and any
visual treatment whose only rationale is to look designed. A clean functional product is not failed
for restraint; it fails only when visible hierarchy, task specificity, content accommodation,
interaction, responsive behavior, or finish is materially weak.

## Feature-level reference research and transfer

Reference synthesis starts from function, not mood. Field names, record shape, axis vocabulary, and validation belong exclusively to `protocol/composition-contract.md`. This protocol governs only when synthesis applies and how it flows: select **Branch A — explicit functions** when the user named detailed features, preserving each feature and deriving its interaction primitives directly; add only indispensable connective or recovery primitives, marked as inferred with an assumption. Select **Branch B — product goal only** only for `product` work and product screens of `mixed` work when detailed functions are absent; first record the smallest task-complete feature set and every assumption. Explicit details always win. An inferred addition needs a task-completion dependency and may not add optional analytics, AI, collaboration, personalization, admin, export, or adjacent capability. Pure `marketing`, `editorial`, and static work does not infer CRUD, state machinery, probes, or task evidence; it transfers only explicit applicable content or interaction primitives. User-origin references receive a concrete canonical synthesis record or an explicit decline individually; scout-found sources cannot satisfy an omitted user-reference mention. Source identity stays scout-side: downstream receives only stable source keys/labels, trust, uncertainty, and sanitized rules—not URLs, screenshots, pixels, or source-page descriptions. Synthesis records never issue `T#`, create probes, alter task coverage, or redefine task/final-evidence contracts.
## Visual reference gallery and concept exploration

**[short-request-quality-default]** A request naming a surface and first-party material is enough
to start. Its brevity limits neither visual finish nor task-complete implementation. Derive the
subject, audience, truthful content and adoption path from that material; ask only about a genuine
missing fact or authority that changes the outcome. The user need not request references, typography,
responsive layout, working controls or verification individually. New marketing work discovers task
anatomy and high-craft evidence by default and starts at least `confident`, unless current user or
brand evidence justifies restraint. Do not infer a `showpiece` lock or a country aesthetic from silence.

Before settling marketing art direction, inspect relevant motion possibilities as well as static
craft even when the user never says "animation". Select and implement motion only when its observed
mechanism serves the chosen content-to-form relationship; it is not an automatic scene quota. Real
controls still receive purposeful hover/focus/pressed feedback. Prove the actual target-language copy
and type, responsive page continuity, keyboard and touch reach, and any selected motion's reduced-
motion state through the native workflow. A locale supplies language mechanics, not a national style:
same-language references can establish line density and wrapping without a cultural-fit claim.

For unsettled marketing, Codex checks its native image-generation tool before choosing a study
method; any host with that capability uses image-first concept studies by default. Follow
`theory/imagegen.md` for early first-party drafts, later reference-grounded selection and code
translation. Image generation is a native design tool, not an external harness, and a no-shipped-
bitmap constraint does not prohibit a decision image. HTML studies prove implementation risks or
provide the observed-unavailable fallback; they do not silently replace an available image lane.

Visual feedback routes through `theory/imagegen.md` §Reopen a rejected visual direction. Distinguish
a bounded edit from rejection of the overall decoration, typography or composition. The latter
reopens unaccepted choices and generation conditioning; it does not silently turn the rejected image
into a target or infer a quiet register. Preserve facts and explicit invariants, not accidental style.

When visual reference discovery is selected, the scout treats curated design galleries and inspiration sources — for example Pinterest, Dribbble, Mobbin, Behance, Land-book, Godly, Savee, and equivalent boards — as an admissible category alongside domain and competitor evidence. It gathers only enough high-craft evidence to settle the named visual decision, measures each retained item into the canonical multi-axis synthesis (macro layout, density, typography, spacing/rhythm, component anatomy, surface/material, colour role, motion), and keeps local captures under `.omd/refs/`. Copying a selected reference is allowed: Composer and Hand consume the sanitized selected assembly's measured anatomy, geometry, treatment, and destination landing, plus the optional source-free no-ship visual packet when explicitly selected; they do not inspect Scout-owned source pixels. Build the named relationships with the destination's own copy, assets, and tokens, and record attribution. Build for coverage, not counts, and report no capture quota.
Award showcases (Awwwards, FWA, GDWEB) and their case studies are part of this category, and are load-bearing for a `marketing` surface in the showpiece register: they show how high-craft structure, section rhythm, and signature motion are actually built, and the FWA/Awwwards case write-up (concept, stack, motion approach) is studied alongside the hero capture, not skipped for a screenshot. Study award work for principle and craft filtered through the subject's own identity anchor; never clone a famous showcase.

When the brief names a real, existing subject, reference research begins by establishing what that subject actually is — a web search plus the linked repository/README and any wordmark or brand the source already ships — and fixes the subject's own identity anchor (its real palette and motif) before any gathering lane runs. That anchor governs the colour and motif of every enumerated direction and is never outvoted by category evidence: a palette or motif that is the product category's default (a dev tool rendered in terminal green) rather than the subject's own identity is the convergence-to-the-mean failure, even when every deterministic gate passes.

Distinguish an explicit brand/user invariant from an observed example treatment in that record.
First-party ownership alone does not make an example site's palette, type or motif immutable. Where
no invariant is established, keep those observations as evidence, not a lock; a current-user rejection
may reopen them. This never permits a category default to override a genuinely established identity.

Concept selection is exploratory, not a single guess. Grounded in real content plus applicable domain
and gallery evidence, it keeps distinct conceptual hypotheses alive through the smallest useful visible
experiments before blind selection. Spatial, media, interaction, typographic, and metaphorical invention
remain available where they serve the subject and task; they are not a mandatory taxonomy or count.
Prose, scores, and valid metadata cannot choose a winner before visible experiments exist. Hypothesis
count and experiment method scale with ambition, uncertainty, and host capability. This never replaces
structural divergence, task/accessibility/viewport gates, independent review, or source isolation. A
generic default fails visual acceptance even when every task succeeds.

User-supplied examples may be ambition evidence rather than a design target. In that role they calibrate
experimentation, surprise, and finish; do not extract their common traits as a house style. Judge visible
experiments against observable criteria grounded in the actual brief. A rejection names the concrete
visible deficiency; familiarity alone is not one. A new concept may depart from every example. An entire
supplied concept study is never a `literalPropsToReject` entry; that field excludes literal props.

A current-user-selected, project-owned concept image is a visual target, not an external reference.
It follows the explicit-user evidence precedence above and may be passed exactly to the applicable
concept-making and production owners; blind selectors/reviewers receive only the bound invariant and
falsifier contract. Competitive and gallery sources remain scout-only and source-isolated. Before
typography or structure freezes, the art-direction decision records only the
target's visible load-bearing invariants and a falsifier for each: the relationships that create its
identity, not every pixel or an imitation recipe. Typesetter tests real copy and actual fonts inside
the target relationship. If one specimen clips, it tests lawful wrapping, container geometry, or
responsive recomposition before shrinking concept-bearing type past the target's relative scale.
Composer and Sketch preserve every bound invariant; Hand receives them with the selected candidate and
cannot relax them. Revision requires a new owner-issued contract supported by visible evidence or current-user direction.
The required command or frequent action remains usable and prominent enough for the task, but it does
not automatically replace the selected concept relationship as the page's visual identity.

Commit the direction count and its evidence-based rationale before generation. Multiple directions must differ in their content generator and macro-composition, not merely their styling. Shared brand colours are lawful: a common palette can support genuinely different concepts, while new colours cannot rescue the same structure repeated cosmetically. One direction is lawful only when the brief and evidence already settle the direction; uncertainty or an ambitious exploration request requires alternatives. Judge the rendered concept, task, and craft after proving feasibility at the required viewports. Colour remains an intentional subject-grounded choice, never a variety quota or a silent default.
## Harness-v2 art-direction decision

[adaptive-art-direction:consumer] The authoritative adaptive route selects or explicitly skips
art direction. Only an explicit art-direction skip with its typed skip receipt removes that stage's
obligation. Missing is not skipped. On that skip, downstream owners consume the selected
frame/copy/type/scout/reference projection and typed skip receipt within their existing source-free
and copy-safe boundaries; do not fabricate a register, motion decision, metaphor contract, image
draft, handoff, or art-direction/motion/settled-selection hashes. Preserve all other selected
prerequisites, current evaluator lineage, and design-quality acceptance criteria. A skipped art-direction
stage does not skip reference assembly, composition, or any independently selected experiment.

When art direction is selected (and on non-adaptive routes that require it), before composition,
the coordinator resolves only the art direction supported by current visible
evidence; unresolved conceptual hypotheses advance to the selected visible-experiment method instead
of being forced into a prose winner. An explicit current-user register or motion instruction is a lock:
it is preserved, never inferred from silence or legacy records, and must be satisfied by the selected
direction. A motion-only lock remains authoritative when the evaluator's overall winner disagrees:
select the highest-ranked compatible evidence-grounded direction that passes every applicable floor;
if none does, return no winner rather than ignore the lock or lower the floor. For `marketing`, compare enough evidence-grounded directions to
settle the decision without a fixed candidate count; do not ask the user to choose or approve a direction.
Each direction declares its static and motion evidence, rejection condition, and activation path. `none`
is legal when the selected direction has adequate static proof; `one` is legal only when one declared
motion hypothesis is eligible and activated by the selected direction. Never default motion to `one`,
invent a motion scene, or convert a user lock into a preference.

For selected art direction, this decision is made before the composer receives inputs. Preserve the immutable decision, authorized evaluator evidence, settled motion, activation binding, settled selection, and all required downstream lineage. The composer sees only the selected, hash-bound decision, selected capture visibility, and applicable evidence bindings; it does not see rejected directions, their scores, or their authorship. Critical quality floors remain independent: a passing direction must satisfy the selected static or motion evidence contract, fixed-viewport quality floors, and separate blind-quality and fidelity reviewers in isolated lanes. Negative marketing copy stays a rejection condition or comparison fact, never literalized into shipped copy.

No stage prompts the user for a choice that the evidence-bound coordinator can make. Human input is accepted only as explicit current-user direction; it is recorded as a lock and not reopened as an approval checkpoint.

Visual-reference assembly is chat-first (no board UI). The scout records the candidates; the
coordinator selects the strongest itself, disclosing its choice and reason — it does not ask the user
to pick a candidate, and a candidate the user explicitly named still wins. It records the selection
through `omd ref select` and
`omd ref check`. No stage opens or asks the user to open a board UI, HTML, PNG, or
`omd-board`. Interactive browsing and user-directed gallery-region capture use browser-rs
first. Only an observed initialization/capability failure permits headless, reduced-motion
`omd render`/`omd probe` Playwright fallback. When image-first exploration is selected, before composer begins, the coordinator/host—not
composer—derives prompts from the hash-bound selected assembly and already-permitted
project-owned brief/copy/type/register material, creates enough independent image-first drafts to
resolve the actual uncertainty when capable, and selects one from visible evidence only when it clears
the applicable floors before handing it to composer. When there is no image
capability, composer takes the CSS/SVG path. When image-first exploration is explicitly skipped,
pass its recorded skip reason and current selected source-free reference projection without inventing
a draft or handoff. Reference assembly alone does not select image-first exploration. The rest of the reference workflow,
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

When user-origin references exist and reference assembly is selected, the scout records multi-axis feature/primitive transfers and keeps the local captures under `.omd/refs/`. When composition is also selected, the composer preserves each in the canonical `Reference synthesis` plan at its declared destination or explicitly declines it; `omd composition --check` then fails when a user reference is absent. The hand implements each accepted transfer from the current source-free selected assembly and its measured landing criteria — or, only when the brief names it, the source-free no-ship visual packet — and records an evidence-backed deviation when needed. The sharp eye verifies visible structural/behavioral correspondence across every applicable accepted axis at the named landing; interaction correspondence requires matching probe evidence. Copying a reference's layout and treatment is allowed and recorded with attribution; a reference landing never creates or replaces a frame `T#` task locator.

## Blindness and isolation

### Evidence handoff

At each selected boundary, `omd brief <stage>` is coordinator intake. It derives ownership,
measured references, delivered contracts, schemas, renderer, prior renders, judges and blockers
from current disk. The source-aware brief is not a role-safe packet: it can include raw
reference descriptions, source paths, previous renders and route rationale. Never append it
unchanged to an isolated owner's task. Preserve ownership, schemas, checks, blockers and
complete required evaluator lineage, but supply only that role's permitted projections and
evidence. Composer, Sketch, Hand and isolated Eyes do not gain source identity, rejected
alternatives or prior verdicts because those appeared in the brief. An inventory path is not
a read grant. Source-free owners receive the projection; they do not reopen the raw brief.
When the brief names `omd ref handoff <role> --json`, supply its complete current output as the
selected reference projection. The read-only export contract is in `protocol/reference-assembly.md`;
a digest receipt alone contains no feature content.

For marketing copy, Writer and copy-editor Eye use `theory/web-copy.md` alongside the current
copy contract. A user rejection of copy reopens the writer's message choice even if its
previous structural check or review passed. Route research through cited voice/copy evidence
and let Writer revise the deck before affected type, composition or render work resumes.
Reuse unaffected acquisition evidence; never preserve obsolete wording just to keep an
earlier layout, type proof or art-direction study valid.

The composer owns only `.omd/composition.md`. After selected typography approval it receives the sanitized frame/concept, clean copy deck, approved type proof, and durable scout summary when selected. When image-first exploration is selected, it starts after the coordinator has chosen its image-first draft: it receives the current hash-bound sanitized selected assembly plus the coordinator-chosen draft when a draft was generated, or the selected assembly plus the CSS/SVG evidence path when the host has no image capability. An authoritative adaptive art-direction skip uses the typed skip receipt and selected frame/copy/type/scout/reference projection described above; it never fabricates absent direction lineage. A selected reference assembly still supplies its current sanitized projection even when image-first exploration is explicitly skipped. It never supplies a draft prompt or upstream art-direction direction, and never receives the internal raw evidence record. Reference transfer input is limited to stable source keys/labels, trust, uncertainty, and sanitized multi-axis feature/primitive rules, adaptations, token variation, conflicts, and destination criteria; it receives no raw screenshots, source files, pixel samples, URLs, source-page descriptions, candidate renders, rejected alternatives, or authorship. It turns evidence into a structural contract, records exact SHA-256 fingerprints for selected dependencies, and runs `omd composition --check` before divergence.

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

When a routed candidate task carries both `[host-evidence-only:candidate]` and an exact
`[candidate-motion-scene:v1]`, the same authenticated sketch may implement that one bounded
preproduction scene in its isolated candidate source. “Same” means the authenticated role invocation
that owns and returns that candidate source; motion and source ownership cannot be split across roles.
The v1 block is complete only when it names one trigger, `durationMs`, CSS `easing`, the exhaustive
animated-property list, reduced-motion duration and state/focus result, normal state/focus result, and
the reversal trigger plus state/focus result. Everything else remains static: no other property or
scene animates, while declared state, focus, clipboard, and recovery changes may commit immediately.
This exception never authorizes production, autonomously invented motion, browser operation,
screenshots, receipts, optical totals, checks, or packet construction. The sketch returns source paths
and a concise structure/behavior summary; that return is the coordinator takeover point. The
coordinator alone collects and validates evidence after the sketch returns. Without both markers, the
sketch's ordinary no-motion and proof-rendering rules remain in force.

The copy editor is a fresh eye context and sees only the sanitized brief, copy deck/fact
ledger, and cited voice/audience evidence. It sees no renders, layout, code, build rationale,
frame, decisions, or authorship, and it reports without editing.
This protocol exclusively owns the exact copy-eye report format, including its fields and
cardinality. Roles may state their review or preservation responsibility and point here, but
must not restate that format.
The coordinator first
preserves the report verbatim at `.omd/.cache/copy-eye.md` with exact `Mode: copy-editor`,
`Review time: <ISO 8601 timestamp>`, `Reviewed copy-deck SHA-256: <64 lowercase hex>`,
exactly `Verdict: CLEAN` or `Verdict: REVISE`, and a non-empty `Findings:` section. It immediately runs
`omd copy review-publish --input <exact-copy-eye.md>`; publication fails unless the structurally
valid report names the current deck bytes. `REVISE` goes to the writer without invoking the
terminal gate. `CLEAN` proceeds to `omd copy --review-check`, which also requires the current
deck hash and exact clean verdict. These checks do not prove blindness or semantic review quality.
After the writer receives findings and revises the deck, the old report becomes stale and cannot close the run.
The coordinator sends the revised exact deck to a fresh copy-editor context, preserves that new
report, and reruns both `omd copy --check` and `omd copy --review-check`. Never replace a reviewed
hash with a later deck hash or imply the eye reviewed bytes it never saw. Terminal
`review-check` passes only a current `CLEAN` report.

The typesetter owns `.omd/type-proof.md` and `.omd/.cache/type-proof/`. It sees the clean
copy deck, typography theory, and scout typography evidence, but does not design composition,
colour, graphics, motion, or rewrite copy. A fresh eye in typography-proof mode sees only
desktop/mobile specimens plus sanitized copy and typography requirements. It never sees
authorship, references, rationale, page structure, colour, or code and never edits.

Preproduction study audits, concept perspectives, structural selection and typography reviews may
inspect their explicitly supplied first-party render or specimen paths with the native image viewer.
They use fresh, role-bounded contexts, not the host-isolated final/refinement pixel transport. Preserve
each mode's input restrictions; missing or unreadable images remain unassessed. Their findings or
selection do not establish final production approval, final-v2 evidence, completion, or host-enforced
isolation. Closed final and refinement reviews still require their host-issued one-use evidence tool
and bound output contract; a provisional review or path-only handoff cannot replace them.

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
action relationship. The numeric floor is not a forced-winner rule. Losing any current-user
concept-target invariant is a contract violation, and an explicit ambition request adds its stated
visual floor. If every candidate is merely adequate where the brief requires exceptional concept or
craft, the selector returns no winner even when every dimension is at least 2.

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

If every candidate violates an applicable contract or floor—including current-user concept-target
invariants or the brief's explicit ambition—or scores below 2 on any dimension, the selector
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
Divergence is measured, not assumed: the candidate set must realize genuinely different macro-layout families — a different top-level spatial organization, or a different placement and orientation of the dominant anchor and reading path — never one stacked single-column flow reskinned with different margins, column width, type scale, or spacing. A candidate set that collapses to a single macro-layout family has not diverged; the blind selector, which sees every candidate render, treats it as a contract-level no-winner (the Candidate axes were not genuinely different) and returns it to a fresh composer to re-derive divergent axes, even when one candidate would otherwise pass.
Every sketch produces four proofs: fixed desktop 1280x900, fixed mobile 390x844, full-page
desktop continuity, and full-page mobile continuity. Full-page evidence is supplemental and
never replaces fixed-viewport acceptance.

The hand builds once. When the adaptive route selects reflection-in-action, that build renders
real content and records two craft checkpoints: semantic layout, then the visual system before
motion. After semantic structure and before the visual checkpoint, it re-proves selected
approved typography inside the production container at desktop and mobile. Each selected
checkpoint names the tested criterion, a concrete observation, and an evidenced `revise`, `retain`,
or `reframe` decision. Retain preserves a design whose observed criteria hold; reframe returns a
contradicted assumption to its upstream owner. Neither requires an invented defect or cosmetic change.
Use `omd craft checkpoint <phase> --render <project-png> --observed "..." --decision
revise|retain|reframe --criterion "..." --reason "..."`; revise additionally requires `--changed`.
Explicit decisions bind the inspected PNG bytes. Historical change-only notes remain readable, but
neither kind is a final acceptance receipt. Actual revisions still need fresh after-render evidence
under the selected visual-observation or trusted repair contract. Reframing changes no scope or
upstream artifact by itself, and never clears a failed gate. A typed reflection skip
creates no craft-checkpoint artifact but never removes browser evidence, final evidence, or
independent review. Human approval checkpoints are separate:
`.omd/config.json` defaults to `checkpoint: none`; concept, structure, or both are opt-in.
When composition is selected, the hand receives its selected candidate and composition
contract, runs `omd composition --check` before its first production write and again before
ship, and records any deliberate deviation with visible evidence. A changed selected frame,
copy deck, type proof, or scout summary invalidates that contract and stops dependent work
until recomposed. A typed composition skip creates neither a composition contract nor check.
Hashes, schema validity, currentness checks, and owner receipts prove transport, not visual
acceptance; they never establish that production preserved a concept target or achieved the requested bar.
The first real production renders are compared against every applicable target invariant before a
candidate or production direction can be accepted. Visible loss returns to the owning design stage or
produces no winner; metadata reconciliation may not freeze the lost render as the chosen design. Any
invariant revision requires the owning design stage's new contract and visible evidence or current-user
direction; Hand cannot waive it as an implementation deviation.
The hand treats focal hierarchy and the lawful mechanism carrier or explicit alternate
mental-model carrier as production acceptance, preserves them responsively, and records
visible evidence or an evidence-backed deviation before the sharp eye judges them.
The hand receives the accepted transfer criteria and builds from the source-free selected assembly's measured anatomy, geometry, treatment, and destination landing. When the brief explicitly selects the visual-packet experiment, it may also inspect only the named source-free, no-ship SVG study for box proportion, grouping, nesting, and whitespace; it never opens Scout-owned captures or private packet evidence. It implements each criterion at its destination screen/route and unique semantic reference-landing selector, or records an evidence-backed deviation; transfer records do not create tasks or probes. Host-side selected-distance and influence-proof gates may inspect the bound capture pixels independently; that pixel access is not Hand input.

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

A `stateful` surface that spans two or more reachable screens — a login → onboarding → dashboard sequence, a multi-step form or wizard — additionally supplies `.omd/probes/flow.json` and runs `omd flow-probe`, which walks the declared screen sequence in one browser. A screen that is never reached, because a control leads nowhere, is a dead end (`FLOW-DEAD-END`); a value entered early that does not survive forward to a later screen is state loss (`FLOW-STATE-LOSS`). On a `product`/`mixed` surface both are RED — a real UX failure, not advisory — because a broken cross-screen path fails the task no matter how correct each single screen is in isolation. The eye makes cross-screen navigation and state-continuity claims only from this flow-probe evidence, never from inspecting one screen; a single-screen surface records the flow probe N/A with a reason.

## UX acceptance contract

Every applicable surface names and verifies the primary task, most frequent action,
costliest-error recovery, an exit from every reachable state, immediate visible feedback,
and mobile reach. The hand reads the exact `theory/ux.md`, copy deck, and design contract;
uses native semantics; preserves form values on error; blocks duplicate submits; and honors
reduced motion. Loading, empty, error, success, disabled, and offline exist only when the
surface can reach them.

## Production quality gates

The hard safety, required-outcome, source, evidence, and independent-review gates are part of every
applicable production run. The method-specific gates below apply when their method is selected:

- **[settled-capture-contract]** A browser capture taken after an interaction is admissible only
  after the capture driver subscribed to the exact state/DOM signal before triggering the action,
  observed that signal, crossed the next two `requestAnimationFrame` commits, and awaited every
  finite `document.getAnimations()` entry affecting the captured work object. Screenshot options
  that disable animations do not replace this barrier because a frame-scheduled class mutation can
  begin after screenshot preparation. Immediately before capture, the primary work object and the
  state-specific target must have non-empty layout/text and computed `display`, `visibility`, and
  `opacity` that make them visibly rendered. A passing DOM/focus assertion beside a blank,
  transparent, stale, or contradictory screenshot is RED evidence, never proof of recovery.
  Persist one exact `settled-capture-receipt-v1` per primary screenshot and run
  `omd capture --check --input <receipt.json> --json`; any finding blocks packet construction and
  Eye launch. Fixed-viewport proof uses `fullPage: false`; a separately labelled full-page
  supplement never substitutes for it.
- **[protocol-review-packet-contract]** Before Eye launch, materialize one closed capture index
  that enumerates every primary screenshot with its viewport, PNG path and SHA-256, corresponding
  capture receipt path and SHA-256, and the empty result from its exact `omd capture --check`.
  Both protocol Eyes receive the complete index and every indexed receipt binding; aggregate counts,
  a manifest digest, or a sampled subset cannot replace those per-capture records.
- **[self-contained-review-packet-contract]** Every Eye packet inlines the bounded observation
  projections needed for its lane; a path/hash/purpose pointer is not evidence when isolation forbids
  opening that path. The closed initial-final and refinement production-pixel transports are the
  sole exception: the host projects their complete content-addressed packet once through
  `read_reviewer_evidence`, with real anonymous `image/png` blocks and no project-path access.
  Capture authority includes every screenshot binding plus its full validated
  receipt projection: `fullPage`, subscription and observation chronology, two-frame commits,
  animation settlement, primary target geometry/visibility, pixel analysis, and empty exact check
  result. Bind one current IR path/hash and its exact `omd check --ir <path> --json --no-log` result;
  never run bare `omd check`. Repair hard/error findings before launch. Advisory warnings remain
  visible evidence for human judgment and are not automatic RED. Do not claim or ask an Eye to prove
  future lane publication, source sealing, completeness, final-v2, or preflight artifacts.
- **[review-packet-proof-contract]** The full packet bytes are embedded directly in the role input,
  or for either closed production-pixel transport delivered by its one-use host evidence tool;
  review cannot depend on opening a local packet path. Inline the exact `omd proof --check --json`
  result and require `[]`. A blind packet contains opaque capture/observation IDs and no URLs, source
  IDs, source names, or provenance. It also contains the complete unchanged source-free
  `design-quality-observation-projection-v1` produced by `omd review evidence-projection` from the
  lane's aggregate observation-v2 hashes; each final quality claim copies its aggregate hash,
  viewport, and exact tested state from one projected capture row. Audit benchmark applicability against the demonstrated reality
  boundary: unsupported submission, receipt, dispatch, or success patterns are absent or explicit
  `N/A`, never criteria that contradict a truthful local preview.
- **[review-pair-configuration-contract]** An ordinary two-Eye lane receives an identical evidence
  payload but a pair-distinct reviewer configuration: a stable opaque reviewer-slot ID and a
  different evidence-order or checklist emphasis that cannot expose another verdict. The closed
  initial-final and refinement transports instead use the same host-owned neutral task and
  configuration to prevent caller bias; distinct process, session, nonce, and one-use evidence
  receipts prove independence. Neither Eye receives the other's output.
- **[host-authority-role-launch-contract]** Unless the active host explicitly declares sufficient
  concurrent role capacity, serialize role launches through its one authority channel. A
  pre-execution authority rejection creates no process/session and is not a review result, but it
  fails the transaction closed; do not resubmit that slot inside the same transaction.
- **[initial-final-production-pixel-contract]** Before either final blind Eye launches, run
  `omd schema final-render-reviewer-packet`, fill the exact observation-v2 chain, and publish it with
  `omd review final-packet`. The publisher revalidates the current observation pointer, route/source,
  build, trusted outcome receipt, decision graph, capture hashes, and decoded fixed desktop/mobile
  PNG dimensions. Launch each Eye with only the same content-addressed `--reviewer-packet`; `--input`
  is forbidden. The isolated reviewer has no project directory, shell, network, apps, plugins, web,
  other MCP, raw reference pixel, capture path, URL, rationale, prior verdict, or source identity.
  It calls `read_reviewer_evidence` exactly once and judges every anonymous production image block.
- **[initial-final-quorum-contract]** Both signed final handbacks bind the same current packet,
  evidence, fixed task/configuration, route, build, brief, decision graph, and observation set, but
  retain their own scores, visible-condition evidence, consequences, and findings in separate
  execution receipts. Any RED verdict or below-floor axis from either Eye blocks publication. The
  lane summary is publisher-derived and conservative: each critical floor and design-quality axis
  uses the lower score, cross-viewport status uses the worse result, and equal-score evidence uses a
  deterministic canonical tie-break. Final-v2 independently revalidates both executions and
  recomputes that aggregate; caller-written consensus or showing one review to the other cannot pass.
- **[copy-role-multiplicity-contract]** Production copy synchronization projects each reachable
  state's deck roles into an expected visible-string multiset and preserves the declared occurrence
  count. `Supporting fact: none` or `none — <reason>` means zero support carriers for that state;
  a next-action explanation cannot reappear as a notice, subtitle, footer, or hint unless the deck
  explicitly assigns that same string to another visible role. Before source handoff, render every
  changed state and block on any extra, missing, or repeated visible string relative to that deck
  projection.
- **[source-bound-proof-currentness]** Once production source exists, the Typesetter and Composer
  each record the same exact `## Production revision binding` entry from
  `omd proof revision --input <production-entry> --json`. Any production-source mutation
  invalidates both proofs. `omd proof --check --json` must return `[]` before review packet
  construction, lane publication, or source sealing.
- When copy repair is selected, the coordinator never authors production copy and the machine route
  enforces exactly `writer -> copy-check -> copy-editor -> writer -> copy-recheck`. A fresh
  `omd-writer` writes the deck, `omd copy --check` must pass, a fresh eye performs copy-editor mode,
  the writer revises deck-first, and `omd copy --check` passes again before a dependent selected
  stage. The entire method may be omitted only through its typed adaptive skip reason. A failed check
  blocks only work that depends on that deck.
- Preserve the copy-editor report at `.omd/.cache/copy-eye.md` with reviewed deck hash,
  copy-editor mode/time, verdict, and findings. A post-review writer revision and final copy
  check do not rewrite that hash; the report proves only which bytes were blindly reviewed.
- When typography proof is selected, a fresh `omd-typesetter` creates actual-copy specimens at
  required viewports plus `.omd/type-proof.md`. A fresh eye reviews only sanitized typography
  requirements and specimens; the typesetter revises and rerenders until the proof passes. The
  proof records roles, source/licence, target glyph coverage, requested and computed family/weight
  evidence, axes, fallback/loading, wraps/clips, rejected alternatives, and invalidation fingerprint.
- When composition is selected, a fresh `omd-composer` writes `.omd/composition.md` from the current
  selected inputs. Run `omd composition --check`; a missing section, bad fingerprint, or stale
  dependency blocks dependent divergence or production. An adaptively skipped upstream artifact is
  recorded as `N/A — reason`, not fabricated.
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
- Write `.omd/attribution.md` for every applicable source category among tokens, motion,
  composition, and graphics. Applicability comes only from the selected typed route contracts;
  missing, duplicate, unknown, or unproven categories fail. A deliberate theory choice is still a
  source; an arbitrary choice is not.
- When reference assembly applies, the hand records the complete production usage ledger and
  the finalizer runs the validator-backed report formatter from
  `protocol/reference-assembly.md` before the final chat handback. The finalizer pastes the
  formatter's exact bilingual Markdown and does not replace it with a vague inspiration claim.
- Close the final chat handback with this run's usage: run `omd usage` and include its elapsed-time and token total in the final message. It reads the host session log (Claude Code or Codex) and sums the run's threads; when no log is found it prints a short unavailable note that is simply omitted, never replaced by a fabricated number.
- Walk `craft/finish-pass.md`. Complete applicable items and record a concrete reason for
  every skipped item.
- When `.omd/design.md` exists, run `omd design --check` and resolve its findings.
- Bare `omd ref distance <page>` remains an advisory comparison against saved references. When reference work is selected, wait for current usage and build observation, then run `omd ref distance <page> --selected --gate --json`; every used measurable slot must score at least `0.6`, and a failed, missing, malformed, unmeasurable, or stale receipt blocks new final-v2 publication. High selected-part similarity is intended; record attribution. A typed reference-work skip creates no receipt obligation.
- When `.omd/target/manifest.json` exists, run a bounded `omd target diff` repair loop.
  Stop at the configured threshold or record the remaining measured mismatch and evidence;
  never iterate without a bound.
- For multi-page output, run `omd check --site <dir>` and resolve cross-page drift.
- Run a RED/GREEN refinement method when the adaptive route selects it or required evidence/review remains RED. A low-risk content-only change may ship after one clean evidenced pass with its recorded skip reason; no route manufactures rounds after every required gate is GREEN. Acceptance criteria written from the frame and `theory/expressive.md` § "Slop-free is not the same as distinctive" are surface-conditional.
- Every surface has one clear first-read with no two competing primary masses; `omd slop scan` has zero confirmed candidates and `omd check --category slop` is clean; no reality-depth tell (a form that never submits, timing theatre standing in for real work, or self-referential in-page trust). An initial clean build is judged by its independent final quality review; only an actual repair/refinement pair requires the blind-choose after to beat before. Marketing additionally names the template it resembles, departs from it, and realizes its selected carrier. Product instead proves task specificity, representative content, semantic hierarchy, prerequisite order, state feedback, and responsive priority without requiring decorative departure.
- Any unmet applicable criterion is RED. Each round leaves evidence (sharp renders under `.omd/.cache/rounds/round-<N>/`, measured gate results, and the blind-choose verdict) — a round with no evidence does not count. Before accepting a round, rerun every applicable declared task probe, accessibility check, and required-viewport task evidence; all must remain passing or the round rolls back. Blind-choose distinguishes visual quality only and cannot overrule those UX invariants. A round earns GREEN or RED from its current evidence; the round number itself never prejudges the result. There is no fixed round budget: for an authorized repair/refinement pair, a fresh independent after win improves and a before win rolls back. Reviewer disagreement or a tie with a remaining RED criterion returns to framing/composition; only a second chained tie on that same RED target is a genuine plateau, and remaining RED never completes. A unanimous tie with no remaining criterion records the repaired result as preserved and complete without claiming improvement. It is not a blind automatic retry — every round needs fresh evidence and no route manufactures a pairwise round for an initial clean review.
- Once a production repair exists, final-v2 publication, currentness checking, and terminal preflight require the current refinement checkpoint to be complete and the final graph's terminal observation to be that exact after render. A continue, stop, rollback, disagreement, missing pointer, or stale repair/checkpoint chain blocks completion. A clean run with no repair has no checkpoint obligation.

The native repair handoff keeps production closed until the owner receipt is consumed. Create the
external private mirror with `"$OMD_NODE_EXECUTABLE" "$OMD_CLI_PATH" owner mirror`, then run the
repair owner with `"$OMD_NODE_EXECUTABLE" "$OMD_CODEX_CLI_PATH" owner repair --agent omd-hand
--input <repair-task.md> --mirror <exact-mirror-root> --json`. After the isolated repair review has
published its exact content-addressed review, commit only through `"$OMD_NODE_EXECUTABLE"
"$OMD_CLI_PATH" lifecycle repair --project <project> --activation "$OMD_ACTIVATION_PATH" --review
<review.json> --mirror <exact-mirror-root> --owner-receipt <exact-receiptPath-returned-by-owner-repair>`.
The host authorizes those exact receipt bytes for this phase once; copied, substituted, missing,
writable, project-local, or replayed receipts fail closed.
- Colour strategy is part of the GREEN target and follows surface grammar. Marketing judges a dominant ground, secondary role(s), and reserved action/critical-state accents against the brief, subject/brand evidence, and visible hierarchy; 60-30-10 is a diagnostic starting point, not a fixed area obligation. Product uses semantic colour: accent identifies action, selection, focus, feedback, and critical state without a percentage obligation. Neither spreads colour as per-element decoration (`theory/color.md`). `omd slop scan` flags a rainbow of fill accents (`SLOP-DIFFUSE-ACCENT`); the eye owns the diffuse-border and reserved-accent verdict the fill scan cannot see. RED requires visible competing accents or collapsed attention order, not a multi-hue or achromatic palette by itself.
- Colour commitment is the other half of the target: under-commitment fails like over-decoration. A `marketing` surface must commit a deliberate colour identity — on a real, named subject its own brand palette and motif (its subject identity anchor), otherwise an evidence-grounded palette with real hue, temperature, and mood. An achromatic or near-monochrome direction is lawful when it is the subject's identity or an explicit brief/brand decision and is carried by scale, structure, and contrast. Multiple hues are lawful when each has an evidenced subject, content, or interaction role and the roles remain legible. A characterless palette that appears to be the unconsidered default is the convergence-to-the-mean failure (RED), not sophisticated restraint. `omd slop scan` flags an all-neutral, chromaticless fill palette as `SLOP-COLORLESS`; the eye decides whether that warning is an unconsidered default or a deliberate, evidenced identity, while a `product` surface may earn restraint through task hierarchy and semantic colour.
- Art direction is part of the GREEN target: the selected `art-direction-v1` contract determines `motionDecision: none|one`. On marketing, `none` requires a purposeful static outcome that realizes the selected direction's static evidence and template break; `one` requires exactly one declared, activated scene with its motion-evidence binding. Product with `none` requires no decorative scene or template break; its visible decision is the task-specific hierarchy, density, interaction, and responsive behavior. Every outcome must be register-fit and preserve usability. A merely functional element is not a marketing signature, but it may correctly be the dominant product work object.
- Motion ambition is part of the GREEN target in the `showpiece` register only after `motionDecision: one` is selected from explicit policy or evaluator evidence. The route persists `award-level` or `canonical` ambition for that showpiece scene and rejects `baseline`; baseline remains lawful for selected down-register motion. Its one declared `load`, `scroll`, or `pointer` scene is expected to be rich, performant, and reduced-motion-safe, not a token fade or bare opacity transition. Marketing may draw that ambition from studied award work; product must realize it through the task interaction without changing product grammar. This raises the quality ceiling of the selected scene; it never creates a scene, changes `none`, or adds a second trigger. `confident` and `quiet` registers remain subject to their selected evidence and explicit policy.
- Register default is part of the GREEN target and is not symmetric across surfaces: a `marketing` surface defaults to at least the `confident` register even when the brief is silent on ambition — a deliberate departure from the named generic template, reached by default — because its job is to persuade and be experienced. Motion is not implied by that default: `one` arises only from explicit policy or the selected evidence. The silent `quiet`/restraint default is reserved for a `product`/tool-operating surface, where the correct risk is functional. A near-monochrome, evenly-stacked, single-column marketing page whose only carrier is a functional element is the silent-default failure (RED), not a lawful restraint choice; quiet on a marketing surface must be a recorded, brief-driven decision, never the silent default.
- Restrained-colour ambition is part of the GREEN target: when a `marketing` surface in the `confident` or `showpiece` register commits to a near-monochrome or otherwise restrained palette, colour is not doing the persuading, so the register must be carried by scale and structure — at least one display-scale type moment (a headline dramatically larger and tighter than body, not body-plus-a-little) or an equivalent structural scale contrast. Uniform body-scale type across an evenly-stacked monochrome marketing page is the silent-default failure (RED), not lawful restraint; `SLOP-FLAT-STACK`'s "no display-scale moment" is RED on this register, not a mere warn, and the eye owns the verdict. A `product` surface is exempt — its clarity comes from density, not a display moment.
- Visual-material carrier is part of the GREEN target on a `marketing` surface: a real built visual carrier is expected, not text-in-boxes. Real supplied material — photographs, a portrait, product imagery, data — is assigned as a first-class structural carrier; unused authentic material is a failure. Where none is supplied and the host cannot lawfully generate imagery, the CSS/SVG path must still build a genuine visual carrier — illustrative or sculptural SVG/CSS forms, a generative geometric or graphical system, or a typographic-graphic composition made structural — never a text-only page. Gray text on white because the host cannot generate images is a carrier failure, not a lawful fallback: the placeholder policy's "a grey box is a defect" extends to "a page with no built visual material is a defect" on this surface. A `product` surface earns its restraint from density and is exempt.
- A shipped abstract/atmospheric AI asset is lawful only when exact prompt/provider provenance binds
  the stable-read current content-addressed `omd decision` record in this trusted project, that record
  binds the exact current invocation, and the host authorizes the purpose-bound project/invocation/
  decision-digest payload. Caller-computed hashes and `currentDecision` data are comparisons only;
  copied, replayed, stale, rewritten, or self-consistent forged records do not ship.
- Real photography is a lawful carrier path, not only supplied or AI material: for a zone where a real photograph is the right carrier and none is supplied, a mood-matched photograph may be sourced from a free-license library (Unsplash, Pexels, Openverse, Wikimedia Commons; CC0 or CC-BY) and used as a first-class carrier, recorded with its source, license, and attribution (`omd decision`). Mood-reference boards (Pinterest, Dribbble, Mobbin, Behance) are studied for the mood only and never lifted verbatim, because their images are third-party copyrighted; the shipped photograph comes from a free-license source or the user. A factual carrier — a real team photo, product screenshot, real person, or logo — is still never satisfied by AI-generated imagery. The shipped photograph's provenance is validated per `graphics/photo-sourcing.md` (`validatePhotoProvenance`): a permitted free licence, the photographer credit and rendered attribution string the CC-BY family legally requires, a safe local path, and descriptive alt text. An unpermitted or unknown licence (Pinterest, Getty, all-rights-reserved) never ships; OMD records provenance and never fetches, scrapes, hotlinks, or downloads a remote image.
- Once production source exists, run the source-candidate scan and contextual triage before
  the final sharp verdict. Resolve every triage item, repair and rescan confirmed current
  candidates, and retain evidence for dismissals. Candidate presence alone never fails the
  run; final untriaged and needs-render counts must both be zero.
- Production review collects the viewports, filmstrip, humanize review, and declared/applicable probes selected by the outcome and evidence contracts before independent review. On a `marketing` persuasion surface in the `confident` or `showpiece` register it also runs `omd craft-usage <page> --surface <surface>` as an audit of whether the selected direction uses or deliberately declines captured craft evidence; it never turns captured scroll craft into an additional motion obligation beyond the exact selected `motionDecision`.
- Model ownership belongs to the user: by default every child inherits the concrete model selected for the host session, while OMD adjusts only the role's effort tier. Direct Codex child launches omit `model` and may pass only `reasoning_effort`; Claude agent metadata uses `model: inherit` and the role's `effort`. The sole Codex exception is the user's explicit outer-invocation `--omd-role-model` / `--omd-role-effort`: the host binds those overrides and the broker alone applies them. Its validated receipt may report `modelArgumentOmitted: false` without a policy violation. No coordinator, recommendation, benchmark, or role label may invent a concrete-model substitution or change host settings. Without that explicit invocation override, a user-selected Luna run remains Luna in every role and ad-hoc worker; the same invariant applies to any other selected model.
- Artifact ownership is enforced whenever an artifact is selected: `.omd/frame.md` belongs to the framer, `.omd/scout.md` and `.omd/refs/*` to the scout, `.omd/copy-deck.md` to the writer, `.omd/type-proof.md` to the typesetter, `.omd/composition.md` to the composer, structural candidates to the sketch agent, every production source file to the hand, and every review verdict to a blind eye. The coordinator orchestrates, sanitizes, and gates; it never writes a selected owned artifact itself. Composition and divergence may be skipped only by the adaptive route with a reason. Production and independent review have no inline path or skippable condition.
- A pack recipe is installed, not reimplemented. `omd recipe list` is the installable library and `omd recipe add <name> [--stack react|vanilla]` writes that recipe's real source — parameters, implementation, and reduced-motion branch — into the project. A selected motion technique is installed first and then bound to this project's tokens, content, and selectors; it must remain within the selected exact-one decision. The install is recorded with `omd decision` and verified with `omd craft-capture` before the technique is claimed.
- Commit the approved design-system ladders before composition. `omd schema token-commit --json` prints the single-scale `token-commit-v1` contract; `omd schema responsive-token-commit --json` prints `token-commit-v2` for viewport-specific type. The authorized owner writes `.omd/tokens.json` and runs `omd tokens check --json`; this command validates only, and an `--input` file is never copied or published. Both contracts name the type scale, spacing scale, colour roles including `accent`, and font roles. Existing validator floors apply independently to every type scale: at least four positive ascending unique rungs, adjacent ratio at least 1.15, and total span at least 2.5 except for `quiet` and `product`. These are contract checks, not a visual-quality verdict. In v2, `responsiveTypeScales` supplies ascending unique positive finite `maxWidth` caps with their own `typeScale`; the first inclusive CSS viewport-width cap that matches wins, and the top-level scale applies above all caps. Take caps and values from the approved responsive proof, never union mutually exclusive sizes or alter approved type merely to pass a union check. Spacing, colour, and font roles remain shared. Run `omd tokens check --page <page> --viewport WxH --json` at every approved viewport: `TOKEN-DRIFT` checks rendered type against only that width's active scale and rendered spacing against the shared ladder.
- The bar is the industry's, not an internal invention. `omd award score <page>` scores the page against the published Awwwards Developer Award rubric and its exact weights (WPO 0.20, RWD/mobile 0.20, markup/metadata 0.15, semantics/SEO 0.20, animations/transitions 0.15, accessibility 0.10) from evidence the run already collects, and reports coverage for any axis with no evidence rather than fabricating one. The main jury's Design/Usability/Creativity/Content split is a human judgement and stays with the blind eye — the harness does not fake a number for it. Scoring is conjunctive: an axis below its floor forces the verdict down however high the weighted mean is, so a page with clean markup and no motion never reports as award-worthy. An Honourable Mention is 6.5; the Developer Award is above 7.
- Motion enhances content; it never gates it. Any surface that ships a reveal runs `omd no-js <page>`: it renders twice, with and without JavaScript, and counts the blocks that stay invisible *while in the viewport*. `NOJS-CONTENT-LOSS` is RED — a reveal whose default state is `opacity: 0` and whose only advance is an IntersectionObserver leaves a reader without JavaScript on an empty page, which fails the developer-award accessibility criterion "content accessible with no JS". A CSS scroll-driven reveal passes because the browser advances it without scripting; an observer-driven one passes only when the settled layout is the default and the observer animates from it. Below-fold content that has simply not been scrolled to yet is not a loss — only content that stays invisible once the reader reaches it.
- After all production source and approved inputs stop changing, run `omd source --seal <root>` and then `omd source --check <root>` for byte-freshness evidence, where `<root>` is the project root that contains `.omd/`, not a nested output directory. Excluded hidden or non-source metadata links are ignored by the source collector. Never move, rename, or delete a project symlink to make sealing pass; a reported source-bearing symlink is a real source-boundary blocker. The seal does not claim semantic copy or source fidelity. Build and collect every final check, test, declared/applicable probe, fixed-viewport render, and applicable motion filmstrip from that sealed source; run `omd source --check <root>` again.
- `final-v2` is the canonical final-evidence ABI and owns the manifest schema for v2, artifact roles/cardinality, publication behavior, and stale-bundle handling. Final evidence is published only by the v2 pointer publisher. v1 is historical-only. The legacy v1 writer is disabled before it opens, validates, or writes a manifest. No v1 lock, run record, current record, or temporary artifact may be created.
- First seal source, build, and collect the final check, test, declared/applicable probe, fixed-viewport render, and applicable motion filmstrip. The v2 manifest binds the activation decision and exactly one applicable evidence branch: `motionDecision: none` binds static-direction evidence; `motionDecision: one` binds exactly one activated motion-evidence binding. It contains no unselected directions or raw evidence.
- `omd evidence v2 finalize` is the sole publisher. It atomically writes one immutable content-addressed record and then one pointer; the pointer is the sole publication marker. Guard writes with the v2 exclusive lock, revalidate after lock acquisition, fsync files and directories, and fail closed on an existing, live, malformed, or ambiguous lock. A failed write leaves no pointer to an incomplete record.
- `omd evidence v2 check` follows only that pointer to its immutable record and verifies its hashes. The v1 checker is historical-only: it may read and verify an existing v1 record but never writes, repairs, migrates, or republishes one. Legacy history remains readable and is never used as current-user direction or v2 publication input.

`omd render` captures the exact requested viewport by default. Use `--full-page` only as
supplementary continuity evidence; it never replaces the fixed desktop/mobile viewport
captures used for hierarchy, critique, or acceptance.
