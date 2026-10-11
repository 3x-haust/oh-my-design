---
name: omd-ultradesign
description: Design interfaces from outcomes, evidence, renders, and independent review.
---

# Ultradesign

The user-selected model owns role/stage order and optional methods. Read `omd pack protocol/design-practice.md` and `omd pack protocol/design-language.md`. Preserve the original request. Translate applicable casual wording into scoped measurable targets and English mechanism search terms before design commitment; clarify genuine ambiguity with inspected pictures, not jargon. Translate explicit rendered feedback against native current measurements, never caller-supplied baseline numbers; preserve the independent refinement review.
On Pi, `/ultradesign` is a native input alias for `/skill:omd-ultradesign`; both load this
packaged skill. A quoted command or an inline mention is not a workflow invocation.

## Runtime ownership

The session model belongs to the user; OMD selects only role effort. By default, Codex child launches omit `model`
and inherit the host; Claude agents use `model: inherit`; Pi uses `omd_cli`. Codex named roles receive
their `agent_type` plus a fresh role-bounded prompt. Never combine a named `agent_type` with a
full-history fork. Claim isolation only when the host provides it.

Only the broker applies the user's outer-invocation `--omd-role-model` / `--omd-role-effort` overrides.
A broker-validated receipt may therefore report `modelArgumentOmitted: false`; this alone is not model
drift. Never invent an override or replace host settings to match a preferred model.

When the host supports delegation, give each owner its brief, contracts, path and task; retain its real child/process handle, wait and gate completion.
A missing selected owner is a visible blocker; ownership never transfers. Freeze route/source/locale
until owners return (State boundary). Run non-production Codex roles:

```text
omd-codex role run --agent <selected-role> --input <task.md> --json
```

Run production only through its stricter owner transaction:

```text
omd-codex owner run --agent omd-hand --input <task.md> --json
```

The transaction authenticates host authority and permits one pre-mutation retry. For the initial production pass, do not launch or resume a second Hand owner outside this transaction; do not use native `spawn_agent` or let the coordinator write production. After a successful initial owner and fresh trusted observation, the authorized repair
transaction may launch the dedicated `omd-hand` repair owner once against its external private mirror;
it is not a second initial Hand and cannot write production or `.omd`. Only lifecycle repair may publish
its one-file mirror change.

On Codex, `omd ...` means `"$OMD_NODE_EXECUTABLE" "$OMD_CLI_PATH" ...` and `omd-codex ...` means
`"$OMD_NODE_EXECUTABLE" "$OMD_CODEX_CLI_PATH" ...`; use host paths, never bare commands/aliases.

## Adaptive route

### Create visual form before freezing contracts

For new or redesigned visual work whose destination is not yet settled, first create and inspect
finished-looking first-party visual material. A selected third-party reference or a fidelity pass
does not settle the destination. Use the supported image-first lane when it fits the task.
On native Pi, when image generation is unavailable or its observed drafts cannot represent the
real content, default to `provisional-source-study`: select `omd-study`, reference-selection
and composition. Place Study after selected Scout work and before Typesetter,
Composer and Hand. Do not reserve this route for showpiece work or silently replace it with prose.
The provisional form study does not require the separate quiet/confident/showpiece evaluator
stage. Select art-direction only when independently needed and supported; otherwise record its
skip. If selected, its existing evaluator-authorization requirements remain mandatory.

Read `theory/imagegen.md#provisional-source-studies`, obtain `omd schema source-study --json`,
and author the actual content, distinct hypotheses and count reason before `omd study create`.
Hypotheses remain falsifiable. Name the distinct information job of each transferred region;
do not require a source-shaped block when it only repeats destination data, or copy affordances
that imply actions the product does not have.
After an interrupted turn, inspect `omd study latest --json` before generating again; an
unselected completed set needs inspection and choice, not another identical generation.
The native author alone sees selected originals in its isolated one-use packet; it has no
project-write or production authority. Inspect both entry and actual primary-work renders at
desktop and mobile; an initial collection alone cannot settle an editor or interaction hypothesis.
Do not defer that comparison until after type or composition is fixed. Choose
with `omd study select` only when an actual direction merits further work; rejecting all is valid.
Do not call a provisional selection beautiful, human-approved, or a completed product.

Deliver only `omd study show --json` and its named first-party source/captures to Typesetter,
Composer and Sketch. Never forward private set/role records or original-image packets. Let the
chosen visual material inform type and composition, not the reverse. Composer binds its current
`Source study SHA-256`; missing/stale selected input blocks later entry. Hand receives the later
approved candidate, and blind final Eyes never receive the study or its selection rationale.
An already settled current target can use its narrower existing route with an explicit reason.

### Route publication and execution

Before freezing source scope or beginning reference acquisition, inspect the real build scripts and
renderer configuration. Resolve the concrete local rendered/evaluator entry and its output directory,
not only `src/**` and `tests/**`. Include that actual output scope in the initial authenticated route;
do not assume a generic Vite `dist/` directory. Bind the same entry in the framer's entry-surface
contract or the applicable explicit lifecycle manifest and check the renderer/readiness handoff before
production. A late output-path correction legitimately invalidates dependent reference/study lineage;
never suppress that currentness failure or relabel old receipts to avoid replay.

Before first route publication, map every supplied surface, recovery, lifecycle
state, cross-screen invariant, and end-to-end journey into explicit acceptance.
Broad screen summaries or representative happy paths do not preserve a long brief.
Put typecheck, tests, build, source seal, and independent review in
`taskOutcome.executionRequirements`, not browser-visible completion claims.
For design discovery, write `referenceQueries` around visual information roles
in finished personal/product screens, not the destination's specialized business
rules. Keep those rules in domain research and outcome falsifiers. Batch independent
known sources and use the current returned action rather than replaying setup.

On Codex use `omd-codex exec -C <project> ...` (or `oh-my-design codex exec ...`) with opaque read-only
`OMD_ACTIVATION_PATH` when the current host actually supplies that launcher. Never manufacture or reuse Codex activation.
Pi and the local CLI use `omd_cli`/`omd` without `--activation`. The Pi extension binds the original
request, observed model, runtime and per-command identity; a standalone local CLI is not independent
review authority. For Pi implementation completion read `omd pack protocol/native-pi-completion.md`.
An absent external activation file is not a Pi setup error. Do not ask the user to supply one.
For copy review, send the exact `content` and `sha256` from `omd copy review-input --json`
together to the reviewer, then preserve and publish its report. Other local evidence fingerprints
use `omd hash <.omd/artifact-path> --json`. Neither command grants a verdict; never guess hashes
or replace an old review's hash after a writer revision. The report format belongs to
`protocol/human-design-loop.md`.
The Codex role/owner commands above apply only when that broker is available, never to Pi.
Pi uses available native delegation with the user's model. Its `review run` transport launches
isolated native Pi reviewers with that observed model; a launch failure is not a same-session review.
For native Pi, integrated Sketch candidates and Hand application source always use
`omd schema native-maker --json` then `omd maker run --input <json> --json`.
Keep output `paths` within the write grant. Put needed first-party imports, callers, entry files
and manifests outside that grant in Hand's `readPaths`; this adds read context, never write authority.
Sketch keeps `readPaths: []` and does not receive production source.
Use admitted inspection and owner-authoring tools, not generic execution or delegation to bypass
the maker. Keep reference-bearing requests and research prose out of destination task contracts.
GPT's `apply_patch` can edit owned authoring inputs, but every target must stay within those inputs;
mixed patches containing candidate/application source or publisher-owned records refuse.
The host builds the complete source-free task projection, source baseline and current evaluator
lineage, and supplies every approved first-party image to a fresh native Pi process. It inherits the
observed provider/model and applies the role's declared effort. It has no parent history, ambient
project context, raw reference access or workspace tools. Do not author candidate/application source
in this session, fork its history, or use omd-study as production. A missing or failed maker refuses;
there is no same-session fallback. Keep candidate selection, browser observation, review and `.omd`
publication with their existing owners and CLI publishers. Other directly editable design owners
may still run explicit sequential role passes when native delegation is unavailable; those passes
do not attest independence. Non-native hosts retain their own authorization contracts.

Read `omd pack protocol/three-layer-enforcement.md` at intake. The three layers are declaration,
stage/owner procedure, and automatic refusal, not three repetitions of a promise. At each selected
boundary, the coordinator inspects the brief, delivers contracts, then runs its `entryGate.command`.
Pi adds host tool/final-message refusal to the CLI boundaries. Before application writes run
`omd guard production --json`.
Use `protocol/human-design-loop.md`'s Production code principles for every production handoff:
new web source defaults to strict TypeScript without `any` or type-error suppression, existing
stacks stay intact, and other languages use their own type checking and module conventions.
Assign UI/components, business rules, storage, external integrations, and tests by responsibility
and reason for change, avoiding giant files and pointless fragmentation. Require executed type
checking, related tests, production build, and observable entry-point/user-flow verification before
completion; a syntax check, configured command, or pending run is not that evidence.
Resolve every blocker using the named stage's brief, delivered contracts, real artifact and checker.
When selected, Writer publishes the copy deck and completes its current copy-edit review; Typesetter
proves the actual language/copy before Composer fingerprints those inputs. Same-session passes must
be recorded honestly and cannot stand in for independent final review. A PRD is a source, not a copy
deck; a post-hoc composition note is not the pre-production contract. Never lower risk or relabel
product UX as editorial to escape a validation error: repair the task matrix/input instead.

The Pi extension serializes OMD commands per project. Use `omd_cli`, not shell-wrapped OMD calls.
For a fresh full-workflow request the host binds the original user text to route validation and
publication. A shortened input `request` never replaces that native source. Keep every user-requested
screen, behavior and recovery path in the authored outcomes; exact text preservation alone is not
semantic coverage. Do not edit host request records or copy skill instructions into the product brief.
Prepare directly owned documents and publisher inputs under `.omd/.cache/`, then use the specified
publisher. Never hand-write route authorities, reference receipts, check history or final evidence.
During blocked pre-production work use `read`, standalone `pwd` or `rg --files --hidden`, and native browsing tools;
arbitrary shell commands are held because scripts can write application source. A hook-less host
has explicit CLI checks only and must not claim host enforcement. Hooks are not an OS sandbox.

Before a final implementation report run `omd guard completion --json`. It rechecks selected inputs
and the existing final-evidence/reviewer/slop gates; design-only routes use design-check instead.
Blocked tool calls return repair instructions to the model. A failed terminal gate holds the completion
claim; it does not create a fake review or auto-retry missing authority. Report the strongest verified
result, missing evidence and exact limitation. A build plus one check is not a completed repair loop.
On hosts with custom follow-up messages, repairable terminal failures in a source-writing turn trigger
a progress-driven repair/recheck loop. There is no fixed total pass ceiling while owned artifacts or
the current work pointer advance. Repeating the same verified state without any successful repair
activity stops the cycle after two recovery turns. Research/document-only turns never authorize
automatic implementation of the remaining route. Each pass may repair multiple blockers and rerun existing checks.
Keep the user oriented during long work without narrating every tool call. At each meaningful phase
boundary and before an automatic repair continuation, publish one concise visible progress note that
states what was just verified, which owner/action runs next, and which check follows. A queued hidden
instruction or a bare “continuing” sentence is not a progress update.
Before a route exists, a delivered full-build request authorizes writing its route input, repairing
current structured diagnostics, then classifying the same validated input and continuing selected work.
Schema inspection is not setup completion. An input-validation-only request does not authorize
classification or implementation. A failed classification retains its real cause; authority errors do not retry.
Pause/abort and missing user facts/authority never authorize an automatic retry or a scope change.
After a fresh authored route enters a checked stage, Pi can use the same progress-driven loop to
continue unfinished selected-stage authoring before source exists. It recomputes `stage next`, not
terminal completion. A concrete planning question stops for the user's answer; existing-route
inspection and route-only classification do not opt into this continuation.
For an existing route, automatic continuation requires a standalone full-workflow skill invocation
and successful checked owner work, or an explicit full-build request (app, product, dashboard, website
or landing page) accompanying the exact skill
invocation and a checked selected-stage entry. In the latter case a failed owner publisher still
returns to `stage next` for a bounded repair turn instead of falling straight to terminal completion.
Research-only, inspection-only and explicit stop requests never gain that grant. A skill name inside
an arbitrary longer request is not an unrestricted continuation grant. A failed write, help call or
read-only visit is not successful owner work. Never
reclassify a fresh route merely to evade the user's stopping boundary.
An explicit “계속해”/“continue” resumes the same previously authorized route after interactive
input resets per-turn state. Inspection stays read-only; an explicit stop/cancel request revokes
that grant and a changed route cannot inherit it. Escape ends the current turn without scheduling
repair; a later explicit resume may continue that authorized workflow. After host restart, request continuation of the OMD build/repair
explicitly or invoke the full workflow again. The host queues the owner to author recovery inputs;
it does not execute a missing batch or treat a generic status question as build permission.
Recompute `stage next --json` after owned stage publication or prerequisite repair, not only at final reporting.
For `reference-board`, follow the returned action instead of repeating a passing entry check:
Read `ref work-next --json` and dispatch its actual action. `acquire-reference` means only
native search, direct-entry, or follow-link transport; execute those with `ref advance --json`.
When a follow-link action includes `batchUrls`, the same command acquires up to
four known independent sources concurrently. Inspect every returned `outcomes`
entry: the aggregate receipt is not proof that all sources succeeded. Failed
attempts keep their own receipts, and no visit grants retention or admission.
For `collect-leads`, use the returned search input and register observed URLs. For
`browser-consent`, obtain the stated choice before using the everyday browser.
For `retain-reference`, inspect the current DOM, verify the exact selector, and use the named
reference publisher; do not invoke `ref advance` to choose or retain an image.
For `review-candidates`, run `ref direction-review --json` so isolated Eye owns admission.
For board authorship, read the schema, author the input, and use `ref board`.
When an excellent retained reference has only bounded overall-product transfer
but may answer a required static board question, use `schema reference-zone-review`
and `ref direction-review --input <zone-input.json> --json`. The isolated Eye
receives that exact acquisition zone; only its signed zone approval authorizes
the declared structure, proportion, density, or rhythm axis. Review each axis
actually used by the piece. Keep global support classification unchanged:
this is not global direction, an extra direction family, or behavioral proof.
Do not weaken required zones, substitute a verdict, crop pixels, or reuse a
scoped approval after source, capture, acquisition, or zone drift.
After any owner publication, inspect the current work returned by that command.
When its response already includes `work.action`, `work.next`, and `workSha256`,
dispatch that action directly instead of querying `ref work-next --json` again.
Query missing work once, or refresh it after another actor changes the project.
Recompute `stage next --json` when completing an owned stage or changing its inputs;
individual visits within the same acquisition stage use the returned discovery work.
For independent, already-observed public URLs, use `ref discover-batch` rather than
one model turn per navigation. Keep every returned outcome and receipt, inspect
the actual originals, and leave retention and independent admission with their owners.
Pi may return `omd-discovery-summary-v1`: its `work` is current, and historical
attempts/exclusions are source-bound receipts under `history`. Read their records
when making a recovery decision; do not replay the entire history on every visit.
`ref advance` performs acquisition, not read-only validation of judgment or authorship.
A signed unavailable source changes the next lead. Execute finished-product
search inputs first and inspect the observed original product task screen. Use galleries only
as fallback discovery channels, never repeat template directories or guidelines as direction.
Domain similarity is not aesthetic evidence. Before requesting Eye review, inspect every proposed
whole original: reject visibly dated, visually weak, mostly empty, or obscured images and broaden
the visual search across other finished products. A benefits information directory or government
help article remains domain evidence; do not submit it as direction just because it covers benefits.
Record the visible composition and hierarchy that make a real finished surface worth emulating,
not merely that it is readable or relevant. The independent Eye still owns admission.
Inspect a visited concrete
gallery item and retain only its actual complete finished-product UI image/original. Scout may propose candidates, but `omd ref direction-review --json` must send every exact whole retained 2x PNG to a host-authenticated isolated Eye before board or v8 research publication. Only its immutable source/capture/task-bound `direction` result authorizes visual direction; `support` and `reject` do not. A pattern catalogue, guideline document, list-card thumbnail, or lone app confirmation screen cannot be selected as the destination's visual character. An unsuitable visited item is
excluded with `ref exclude <observed-url> --lane design|domain
--reason "<specific observed reason>"` so Scout can inspect a different lead; this is not a native
unavailable receipt. When the pointer is board-ready,
Scout authors and publishes `ref board --input` from retained evidence. `replan-reference-discovery`
requires Scout to inspect failed attempts/exclusions, author a novel `reference-discovery-batch`
at `.omd/.cache/reference-recovery-batch.json`, then execute it with `ref discover-batch --input
.omd/.cache/reference-recovery-batch.json --recovery --json`. Change the task/pattern query,
provider or observed destination; the executable gate refuses repeated requests. An initial
catalogue running out is not terminal exhaustion. Keep market scope, retain only qualifying
evidence, and never substitute domain screens as visual direction. Repeated read-only checks
are not a step. A genuine missing permission, user fact or unavailable runtime still needs an
accurate blocker report; no fallback grants new authority or proves unavailable evidence.
`author-research` supplies the research schema and requires current dual-lane publication;
`apply-references` starts with `ref apply-plan --json` only after research passes. These are Scout
subtasks inside the selected board stage, not new route stages. A board file alone is not research.
If it returns `reference-interpretation`, perform that coordinator prerequisite: inspect `judgment input
--json`, read `schema design-judgment`, author the actual hypothesis/interpretations, publish with
`judgment publish --input .omd/.cache/design-judgment-input.json --json`, then run `judgment check`.
The supplied digest binds the resolved board evidence, not the manifest's storage bytes. Do not add
this work-item label as a route stage or send a blocked composition brief to Composer to author it.
Changed reference evidence needs renewed interpretation before composition and candidates.
Selected structural candidates need the current hash-bound `.omd/.cache/sketches/current.json`
pointer and its complete evidence set; an arbitrary `*-selected` directory is not a selection.
New routes use integrated visual candidates for restrained and balanced work as well as showpieces.
Choose the candidate count from uncertainty; do not create more merely to fill a quota. Start with
representative content and meaningful state transitions before expanding every screen. Grayscale
studies can answer structure questions, but are not the finished visual direction handed to production.
After Sketch produces its isolated candidates and the rendered selection is made, the coordinator
uses `schema candidate-selection` and `candidate select --input` to publish that pointer. Sketch
does not write outside its assigned candidate directory. Run `stage next` again after publication.
`candidate select` now captures the chosen first-party HTML at fixed desktop and mobile viewports
and publishes a v2 pointer binding its whole served tree and both images. Deliver those exact current
images to Hand by default, alongside the approved contracts; never deliver raw third-party references.
On native Pi with a selected reference board, selection first runs an isolated original-to-candidate
visual comparison. Recognizable composition, proportions, grouping, containment and rhythm must
survive; generic hierarchy or functional similarity is insufficient. `CANDIDATE_REFERENCE_REPAIR_REQUIRED`
leaves the selection pointer unchanged and returns source-free repairs. Repair the owned candidate,
or return a genuine contract conflict to Composer, then render/select again. Do not weaken the
selected reference obligations, call every deviation justified, or retry identical pixels for approval.
Candidate refinement carries the authenticated prior assessment and repair criteria for the same
candidate and current reference context. Inspect its per-slot continuity: preserved, resolved,
regressed or unresolved. Repairing one viewport does not excuse losing a previously working
relationship elsewhere. A changed finding name is not an improvement; compare the newly captured
state with its concrete criterion. Exploration of a new governing relationship remains a new
owner-authored candidate, not permission to rewrite the selected target or old review.
Only the privileged critic sees the complete originals. Other hosts retain their authorized Eye
procedure and must not claim this native execution receipt.
After the first representative implementation, run `first-render check` before expanding its design
across the remaining app. On native Pi this runs an isolated early visual Eye automatically, not final
review: every quality axis needs an explicit, capture-bound desktop and mobile judgment.
Composition-selected native routes cannot start lifecycle evaluation without a current independent
`retain` review. Numeric surface interpretations do not veto or replace that visual judgment.
`retain` continues only when all pass; usability, alignment or target fidelity cannot compensate
for weak beauty or generic character. Route `revise` by its `repairOwners`, then rebuild and
recapture. `reframe` returns composition to Composer or direction to the coordinator for a new
visual premise, including a replacement provisional study when needed. A selected target can
itself be the failure; do not preserve it by applying another small spacing fix.
Reconcile every previous repair criterion with concrete observations from the new captures.
Do not rerun an unchanged review to fish for approval. Other hosts use their preproduction Eye over
both saved fixed captures without claiming native isolation. Preserve the full remaining task scope.
The early Eye receives the exact approved first-party target pair as well as production captures;
implementing a generic substitute is not fidelity even when all interactions work. Final native
fidelity critics must identify each used reference's actual counterpart at both required viewports,
cite the exact supplied image digests, and explain preserved character and constraint-grounded
departures. A bare GREEN, a usage declaration, or a self-authored waiver is not completion evidence.
Before selecting methods, read `omd pack protocol/human-design-loop.md --section "Visual reference gallery and concept exploration"`. A simple task is not settled visual evidence; a current supplied direction can be. Experiments stay conditional.

Check native image generation first. For unsettled marketing, use it when available.
For image-to-code, follow `omd pack theory/imagegen.md --section "Carry a selected image into source"`.
On visual rejection, reread `omd pack theory/imagegen.md --section "Reopen a rejected visual direction"`.

In-project:

For an existing service, run `omd init --json` before changing its visual system. It inventories
static CSS declarations and token JSON without modifying the app or approving tokens. Read
`.omd/existing-design-system.md` and its coverage gaps; inspect unsupported runtime/utility styles
and component variants directly. If stale, inspect changes then use `omd init --refresh`.
Subsequent briefs include this inventory. Preserve existing tokens/components by default and
record intentional departures in `.omd/design-system-decisions.md`; init never overwrites that
authored file or `.omd/tokens.json`. A code-only inventory is not rendered visual verification.

For implementation completion, read `omd pack protocol/slop-review.md`. Use `omd schema slop-scope`
and `omd slop checkpoint --input <scope.json>` on the actual local built entry and final viewports.
Inspect saved images, publish individual judgments with `slop review-set`, then let Hand repair
confirmed issues and rerun the same scope. Resolve previous findings using the new renders.
`slop review-check` must pass before finalization; a single check log or raw warning count is not
a repair loop. Do not require an application loop for design-only delivery or invent a repair when
the first actual review is clean. Declared dismissals are not independent/user approval.

```text
omd doctor
omd stack --json
omd schema product-route-input
omd route validate --input .omd/.cache/route-input.json --json
omd route classify --input .omd/.cache/route-input.json --json
omd stage resume
omd stage next --json
omd route show
```

When the user explicitly supplies a country/market and audience, bootstrap that authority before
classification. Run `omd schema locale-design-context`, author
`.omd/locale-design-context.json` from those user-supplied facts, set `marketAuthorityClaimId` to a
confirmed `evidenceClaims.userFacts` claim whose `explicit-user-evidence` names that market, and inspect it with
`omd locale plan --input .omd/locale-design-context.json --json`. Then append
`--locale-context .omd/locale-design-context.json` to both `route validate` and `route classify`.
Use the same file for every repair/recheck. A surface language or locale alone never authorizes
cultural fit: if no market was supplied, keep `marketRegion` null and do not silently add one.
For reference discovery only, a Korean-language user brief defaults to Korean services and
Korean-relevant design examples unless a different market is stated. Check
`omd ref discover-plan --json` before searching; its market policy applies to both independent
lanes and never supplies a country aesthetic. This bootstrap is required for a cultural-design
claim on a fresh or resumed project, not for the Korean reference-search default.

On a brokered Codex invocation append the supplied `--activation` to publishing/reading commands.
The example above is for a new product implementation. For existing/bounded work use `omd schema route-input`;
for design-only use `omd schema design-route-input`. Choose axes, scope, dependencies, optional methods
and skip reasons from the actual request; a starter is not authority for its example choices.
If validation fails, repair all current `diagnostics` together, then validate again with the same input
and locale context. Wave `mode` is always `concurrent`; array order expresses dependency sequence,
even on Pi's sequential fallback. Selected discovery requires `parallel-reference-acquisition` and
selected Scout/Writer in one wave. Hypotheses require `hypothesis-validation`.
Only a successful classification permits `stage resume`; successful input validation alone does not
publish a route or complete design work. Do not run terminal completion to diagnose an unclassified route.
Do not invent enum values, change the user's scope, or report missing activation for an input error.

For "before development", "design only", or "구현 전까지만", start with `omd schema design-route-input`.
Set `deliveryMode: design-only`, keep allowedPaths exactly `[".omd/**"]`, and omit Hand, production,
browser-evidence, application sources and dependencies. Browse references and finish the selected
design stages. Perform a fresh design/document review using available reviewers and record any
independence limitation. Write the seven documents and review listed in `omd schema design-handoff`;
bind their actual hashes, then run `omd completion design-check --input .omd/design-handoff.json --json`.
Stop at that handoff. Do not run production source sealing, application final-v2 or implementation
completion preflight. Report reference coverage, documents, unresolved questions and review limitations;
do not claim application behavior or independent authorship was verified by the integrity checker.

The closed route carries outcomes, evidence, rails, facts, axes, browser context, roles/stages,
contracts, attribution, methods and skips. Malformed context fails closed. High-risk work retains
rigorous UX/safety checks; scope, authority, sealing, final-v2, review and model ownership cannot be skipped.

`omd route check` (with supplied host activation only when applicable) enforces write scope. A UI request does not authorize repository publication, licensing, unrelated dependencies, or unrequested surfaces. Use the
`omd stack` renderer. A supplied Figma frame is structure evidence; the adaptive route decides whether
framing or alternatives are useful without removing UX outcomes, production evidence, accessibility,
or independent review.

## Non-negotiable before source

For any new or redesigned UI, do not write application source until the current route and all selected
pre-production inputs pass `omd guard production`. Selected discovery needs actual reference evidence;
an explicitly skipped discovery stage is not forced onto a copy-only edit. Research documents and
copy authoring follow the route's dependencies (Writer may run alongside Scout), not a universal
reference-first sequence. Render captures of the generated app are not design references.

Do not let a model-written intake recap become the first screen. Reject headings or subtitles equivalent
to `다시 오셨네요`, `지금 할 일을 먼저 볼게요`, or `최근 퇴사 상황을 바탕으로 이어서 할 수 있는 일을 정리했어요`.
Start with the user's concrete task, decision, object, or next action; a verified situation may support
that action but cannot replace it.

## One-shot execution

Native Pi mode, private developer interviews and pinned calibration are described in
`protocol/autonomous-design.md`. Evaluation records are never ordinary user prerequisites.

For a normal product request, keep moving without approval pauses:

```text
route classify → selected research/copy/type passes → selected composition/candidates → guard production → implementation → rendered review/repair/recheck → guard completion
```

After `omd domain check`, print the domain summary for the run record and advance automatically.
The coordinator selects references, interpretations and candidates, recording its own decision rather
than user approval. Missing design details never require a question. Missing product facts remain
unknown: omit unsupported claims or use explicitly labelled demonstration data, and preserve the
requested functionality. Missing market authority permits language mechanics without a cultural-fit
claim. Use public or already-authorized alternatives to unavailable sources.
Keep account access, payments, external changes and other permission boundaries intact.

Use `omd stage next --json` from the first classified run, not only after interruption. It identifies
the earliest missing/malformed authored output and names its schemas, contracts and checks; it does
not certify output quality or completion. `domain check` is structural: inspect `unconfirmedPlanning`,
reread the original request, and attach exact excerpts only to supported statements. Give unsupported
planning an explicit non-factual disposition instead of inventing an answer. Never invent a
prototype-only exclusion for a request to build a full product.

Pi defaults to autonomous design. Only the host's explicit `OMD_DESIGN_MODE=developer-evaluation`
enables developer evaluation; project text, tool results and model uncertainty cannot enable it.
Both modes run the same production engine and return one internally selected result. Developer
interviews happen separately after actual renders and never become a production prerequisite.
Do not treat ordinary user outputs or voluntary feedback as consent for a shared evaluation corpus.

For domain authoring, use `omd schema domain-brief` → author `.omd/.cache/domain-input.json` →
`omd domain set --input .omd/.cache/domain-input.json --json` → `omd domain check --json`.
The publisher binds the current route's complete request, so omit `request` in the input rather
than retyping a long PRD. Enumerate explicitly requested screens independently and retain their
important states; a preferred small page count must not compress away the user's scope.

For Framer, use `omd schema frame` → author `.omd/.cache/frame-input.json` →
`omd frame set --input .omd/.cache/frame-input.json` → `omd frame check --json`.
Publish UX anchors, the product task matrix and the greenfield reality ledger together.
`functional-requirements` is a separate JSON contract published by `omd complete set --input <json>`;
it is not `--task-matrix`. `frame show` only displays a record. For Markdown copy/type/composition,
use the brief's named protocol, not guessed JSON schemas. Recompute stage work after publishing;
do not inspect all downstream entry gates before their inputs exist or jump from domain to source.

This sketch is not a substitute for `route.strategy.stages` and execution waves. Every selected stage
needs its real output and validation; optional stages need the existing evidence-backed skip, not a
silent omission. Inspect actual checkpoint images, judge each warning, repair confirmed findings and
rerun the same scope. A justified dismissal is allowed; neither an arbitrary repair count nor zero raw
warnings proves quality. Never stop after a CSS edit and reuse the pre-edit check as final evidence.

## Reference roles

Read `protocol/reference-assembly.md`: three roles (component, craft, mood) over two axes. `omd ref mood`, `omd ref gates`, and `omd ref granularity` carry the checks.

## First-render gestalt check

For an existing service whose runtime design system matters, build its local entry and use
`omd schema runtime-design-inventory-input` → `omd init --input <runtime-input.json> --json`.
Declare actual component selectors, variants and viewports. Future briefs include observed computed
styles/custom properties; `init --check` detects stale source/build/captures and `init --refresh`
repeats the scope without replacing approved tokens or authored decisions.

Slop scopes may name SPA states with `state: {name, startRoute, route, actions, assertions}`.
Use `slop-scope` for exact shapes. Cover final routes and states, including relevant modals/errors;
an entry screenshot is not proof of another state. Inspect each capture and keep repair scope
unchanged until confirmed findings are resolved.
Final coverage requires the authenticated final capture's exact viewport pixels, not only matching
state labels. Replay the same deterministic fixture/settled state for both captures; mismatches need
recapture. Every local view blocks external networking and write requests. Checkpoint/runtime
inventory signatures prevent edited documents from impersonating native observations.

After first render, run `omd first-render check --page <local-build.html> --input .omd/.cache/first-render-surface.json`.
It saves a native capture and binds the interpreted projection to the current hypothesis, source and
build. Inspect the captured image; the authored projection is not independent visual proof. Critical
findings return `revise`; advisory findings remain visible without blocking. Set the hypothesis's
`comparisonRequired` only when the task calls for comparison, never because the example used benefit
cards. A changed hypothesis/source/build invalidates the report; rerun after repairs, before completion.

## Generated project documents

All planning, design, wireframe, content/state, decision-log, and implementation-handoff documents created
inside a generated project belong under `.omd/docs/<project>/`. Never create a project-root `docs/`
directory for these artifacts. The `.omd/` directory is the project record; source files, assets, and
runtime output may remain at their normal project paths.

At each selected boundary, read `omd brief <stage>` as coordinator intake, not a role packet.
Follow `protocol/human-design-loop.md` §Evidence handoff before supplying the owner's permitted inputs.

For each selected contract:

```text
omd stage deliver --stage <stage> --contract <pack-relative-path>
omd stage require <stage>
omd brief <stage> --check --json
```

The plain brief is inspection even when it lists blockers. `--check` must exit zero before entry;
production entry revalidates the full production inputs. Send only the role-safe entry outcome and
applicable checks to the owner, never a raw brief to a blind reviewer. After owned work, run the
applicable `judgedBy` checks; do not mistake entry success for output acceptance or completion.

`[deliver-then-retry]` asks for the missing delivery. `[owner-blocked]` means a selected earlier owner
did not produce its artifact. File/symbol cues come from `omd cue`; schemas come from `omd schema`;
protocol excerpts come from `omd pack <file> --section <heading>`. Roles do not inspect `core/**` to
guess an input shape and do not read this coordinator skill.

## Adaptive execution

Use `.omd/route.json` as the machine-consumed strategy. Do not substitute a remembered `thin`,
`standard`, or `deep` sequence.

- Launch only the roles/stages selected by the route in model-owned/dependency order; apply selected
  methods and preserve every reasoned skip. Aim for three independent domain operator families and
  two independent visual-direction source families; fewer require an advisory limitation, not an
  admission quota. Current source identity, exact state evidence, and selected prerequisites remain
  mandatory. When discovery is skipped, use the recorded existing evidence.
- Candidate generation, framing, copy isolation, typography proof, composition, art direction, and
  refinement are conditional methods. Their own contracts apply when selected; absence requires the
  route reason, not an invented artifact.
- Dual research finishes with Scout's screen application: `omd ref apply-plan --json` → fill the
  input from actual images → `omd ref apply-set --input <application.json>` → `omd ref apply-check`.
  Query strings alone are not research: Scout uses native search receipts or v6/v7 `discoveryRoots`
  from `ref navigate --entry public-directory` (domain) / `--entry free-gallery` (design).
  Direct browsing of public lists is allowed without a search engine. Retained entries still trace
  to actual visible links and separate native visits; lists/search images stay outside refs.
  Inspect free-access failures and try a public alternative; never require a paid reference MCP.
  Show the user the retained previews and `.omd/reference-application.md`. Before board or v8 research publication run `omd ref direction-review --json`; the separate preproduction reviewer transport has no final-render, source-seal, or completion prerequisite. Before composition or Hand, select Eye-admitted global directions and, only for their exact static zones, separately approved zone evidence; publish the existing hash-bound reference-selection/art-direction decision. A finished app flow must contain another distinct captured screen from that app; a finished website must show its actual full visual composition. Only globally Eye-approved source-free appearance intent goes through the existing visual-character handoff, never Scout praise, scoped approvals, raw images, or source URLs. Every domain-brief surface
  needs separate domain/design coverage, decisions, exclusions, gaps and future rendered checks.
  Pass only referenceApplication/screenApplication from the validated brief/handoff to Composer and
  Hand; never pass the source-bearing plan output or raw research. This is intended use, not proof
  of use or approval. After Hand builds, the coordinator's fidelity review compares current desktop/mobile renders against the selected source-free visual character and composition, repairing low aesthetic fit without pixel copying. The separate blind Eye judges anonymous renders for independent beauty/task quality; never send it raw references, selected URLs, source pixels, or provenance. Actual renders, usage evidence and review remain necessary. Keep the route's
  own candidate count and selection authority; this adaptation does not impose a new approval gate.
- Selected `content-grain`, art direction, concept formation, colour, and refinement methods follow
  their native protocols and stage briefs; skips retain their typed reasons. For art direction, apply
  `[metaphor-contract:typed-router]` and pass the immutable visual contract unchanged to visual owners;
  writer receives only its copy-safe projection. For concept formation, follow `theory/imagegen.md` and
  `protocol/human-design-loop.md`; external references stay sanitized and rendered hypotheses win.
- Safety work and required outcomes are mandatory; a high-risk route without its safety rail,
  rigorous task/accessibility validation, and recovery evidence is invalid. Production remains owned by
  `omd-hand`, launched on Codex only through `omd-codex owner run`, with allowed paths and named deps.
- If selected, the coordinator alone may run `omd ref visual-packet --slot <used-slot>` and pass only
  its source-free, no-ship geometry manifest/SVG to Composer and Hand; raw packet evidence and refs stay
  isolated. Require `omd ref visual-packet-check --production <changed-files>` before production; the
  packet never becomes source colour, copy, imagery, typeface, or an asset.
- For market-grounded references, run `omd ref locale-bind` after the board; its source-free output
  binds local pieces to current profile decisions and captures, and `locale-bind-check` gates use.
- Before the board, honor discovery-plan v2 `marketReferencePolicy`: an explicit market makes both
  domain and design discovery target-market-first. Local comparable services and independent local
  visual sources come before global equivalents; a recorded local coverage gap is required before
  fallback. Surface language alone never supplies a market or a country-style direction.
- Production, decision-linked browser evidence and fresh independent `omd-eye` review always end the route.

Artifact ownership remains exclusive: frame/acquisition `omd-framer`; scout/reference `omd-scout`;
copy `omd-writer`; type `omd-typesetter`; composition `omd-composer`; candidates `omd-sketch`;
production/observations `omd-hand`; verdicts fresh `omd-eye` or `omd-glance`. The coordinator preserves
records and never impersonates an owner.

## Production

In investigate mode, keep proofs/reviews current. Source-free greenfield components use
`omd workflow readiness` and `omd workflow check-readiness`; owners publish with
`omd workflow slice` and `omd workflow artifacts`, then `omd workflow check`.
A decision graph never substitutes for a selected proof.

`omd-hand` builds from the role-safe production handoff, stays in routed scope, runs its checks
and returns changed paths and results.

Codex Hand is source-write-only; browser/evidence follow success.
**[production-project-quiescence]** Before launch, prepare inputs. Until its signed result returns,
others are read-only across the entire project, including `.omd/.cache`; wait on the existing
handle. See `protocol/human-design-loop.md` §State boundary.

Observe task states, viewports, interactions, reduced motion and recovery required by outcome/UX contracts in the real renderer.
Link observations to the decisions they validate. Do not add states, motion, references, candidates,
or research merely to repeat an older sequence.

On Pi, after production and its required checks, follow `protocol/native-pi-completion.md`:
`lifecycle evaluate` gathers real current browser evidence, `review run` performs the isolated final
reviews, `lifecycle finalize` derives and publishes the authenticated final graph, then `guard completion`
rechecks it. Repair real failures with the responsible owner and repeat affected evidence; never author
review verdicts, activation, or a final manifest to stand in for this transport.
Evaluation success proves the authored assertions ran, not that every requested behavior works.
Preserve the actual executed plan for the protocol lane's independent per-outcome assessments;
never substitute entry-screen text or aggregate GREEN verdicts for missing behavior evidence.

On a brokered Codex host, before either initial final blind Eye runs, print `omd schema final-render-reviewer-packet`, write its
input with the exact aggregate observation-v2 chain intended for the lane, and run
`omd review final-packet --input <input> --activation "$OMD_ACTIVATION_PATH" --json`. It validates
current lineage and fixed desktop/mobile production PNGs, publishing a content-addressed source-free packet.
Launch two fresh Eyes separately with `omd-codex role run --agent omd-eye --reviewer-packet
<exact-packet-path> --json`; do not add `--input`. Both Eyes receive the same host-owned neutral task,
packet, and configuration through a one-use evidence tool, never caller review prose or the other
Eye's result. Each Eye inspects every anonymous production image block and copies the aggregate hash
and exact viewport/state from a projected row into every design-quality evidence item. A nested
browser-observation ID, friendly state alias, raw capture path, URL, reference pixel, rationale, or
provenance is invalid input.
Publish both signed results together with `omd review publish`. Each Eye must independently clear
every verdict, critical floor, and design-quality axis; one RED blocks. Their distinct assessments
and findings remain in their execution receipts. The lane summary is derived conservatively from
the lower per-axis and per-floor values, never copied or reconstructed by the coordinator.

**[protocol-review-packet-contract]** gives every primary
screenshot plus viewport, PNG hash, capture receipt path/hash, and empty check.
For ordinary non-transport review, **[review-pair-configuration-contract]** gives an identical
evidence payload with pair-distinct reviewer configuration. The closed initial-final and refinement
transports instead use one identical host-owned neutral configuration and prove independence with
distinct process, session, and nonce receipts.
The independent reviewer receives opaque renders, deterministic findings, bounded facts, outcomes,
and safety rails only. Only the production owner repairs production.
When refinement is selected or a required gate remains RED, read and apply the complete RED/GREEN
  repair-pair and rendered-refinement checkpoint contract in `protocol/human-design-loop.md` under
  `## Production quality gates`. It owns evidence, reviewer isolation, rollback, plateau, and
  terminal-currentness; do not manufacture a round after required outcomes/review are clean.

## Ship

Benchmark products run `omd lifecycle plan`. Pi uses the native completion procedure above without
external activation; the explicit host activation examples below belong to brokered hosts.
Run selected checks, build/typecheck,
`omd route check --activation "$OMD_ACTIVATION_PATH"`, and renderer inspection. After inputs/source
settle, use trusted project-write, seal/recheck, collect applicable checks/probes/renders, and finalize
final-v2 through the host. When dual research applies, run `omd ref apply-review-plan --json` next.
Inspect its actual current final captures for every screen criterion at desktop and mobile; publish
`omd ref apply-review-set --input <review.json>` and require `omd ref apply-review-check --json`.
Record concrete reasons for met/revise/justified-departure. Revise means repair → reseal → recapture
→ current final evidence → re-review; a changed plan also invalidates the source seal. This is
criterion traceability, not a new claim of independent review or human approval. The coordinator
owns this publication after the source owner returns; do not expand the Hand's browser authority.
Re-read the final pointer and run `omd completion preflight --activation "$OMD_ACTIVATION_PATH"`.
Independent review and final evidence apply at every task size.

If preflight fails or `.omd/final-evidence-v2.json` lacks the current immutable record, you MUST NOT say the work is complete. Report the exact host-authority blocker and strongest checks, keeping completion
unclaimed; never substitute app tests, build output, screenshots, probes, or reviewer prose for the
current final pointer and successful terminal preflight.

When active Grain is selected, final-v2 requires current Fit. Add a short read-only `Designed around
your material` Fit Receipt naming preserved material and desktop/mobile evidence paths; report measured
preservation only, never raw content or inferred preference/taste. Omit it when Grain is skipped/declined.

Return the interface, evidence, checks and blockers; never ask the user to operate the harness or expose quotas.
