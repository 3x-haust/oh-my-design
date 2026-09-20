---
name: ultradesign
description: Design interfaces from outcomes, evidence, renders, and independent review.
---

# Ultradesign

The user-selected model owns role/stage order and optional methods. Read `omd pack protocol/design-practice.md`.

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
transaction may launch the dedicated `oh-my-design:hand` repair owner once against its external private mirror;
it is not a second initial Hand and cannot write production or `.omd`. Only lifecycle repair may publish
its one-file mirror change.

On Codex, `omd ...` means `"$OMD_NODE_EXECUTABLE" "$OMD_CLI_PATH" ...` and `omd-codex ...` means
`"$OMD_NODE_EXECUTABLE" "$OMD_CODEX_CLI_PATH" ...`; use host paths, never bare commands/aliases.

## Adaptive route

On Codex use `omd-codex exec -C <project> ...` (or `oh-my-design codex exec ...`) with opaque read-only
`OMD_ACTIVATION_PATH` when the current host actually supplies that launcher. Never manufacture or reuse Codex activation.
Pi and the local CLI use `omd_cli`/`omd` without `--activation`; local command authority is created by the CLI.
An absent external activation file is not a Pi setup error. Do not ask the user to supply one.
For copy review, send the exact `content` and `sha256` from `omd copy review-input --json`
together to the reviewer, then preserve and publish its report. Other local evidence fingerprints
use `omd hash <.omd/artifact-path> --json`. Neither command grants a verdict; never guess hashes
or replace an old review's hash after a writer revision. The report format belongs to
`protocol/human-design-loop.md`.
The Codex role/owner commands above apply only when that broker is available, never to Pi.
Pi uses available native delegation with the user's model; if independent review is unavailable,
record that limitation rather than claiming an isolated review or blocking reference collection.
On Pi without a delegation tool, execute the selected design roles as explicit, sequential role passes
in the current session, respecting each role's inputs and owned paths. Execution waves still express
dependency groups; do not simulate child handles or concurrent processes. This host fallback does not
attest independence. Record same-session review as such in the design handoff, and do not run broker
commands or ask the user for a missing broker to perform ordinary research and design work.

Read `omd pack protocol/three-layer-enforcement.md` at intake. The three layers are declaration,
stage/owner procedure, and automatic refusal, not three repetitions of a promise. At each selected
boundary, the coordinator inspects the brief, delivers contracts, then runs its `entryGate.command`.
Pi adds host tool/final-message refusal to the CLI boundaries. Before application writes run
`omd guard production --json`.
Resolve every blocker using the named stage's brief, delivered contracts, real artifact and checker.
When selected, Writer publishes the copy deck and completes its current copy-edit review; Typesetter
proves the actual language/copy before Composer fingerprints those inputs. Same-session passes must
be recorded honestly and cannot stand in for independent final review. A PRD is a source, not a copy
deck; a post-hoc composition note is not the pre-production contract. Never lower risk or relabel
product UX as editorial to escape a validation error: repair the task matrix/input instead.

The Pi extension serializes OMD commands per project. Use `omd_cli`, not shell-wrapped OMD calls;
prepare directly owned documents and publisher inputs under `.omd/.cache/`, then use the specified
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
at most two repair passes per real user input. Research/document-only turns never authorize automatic
implementation of the remaining route. Each pass may repair multiple blockers and rerun existing checks.
Before a route exists, Pi may also retry an already-authored route input using current structured
diagnostics. This repairs setup only, not missing deliverables. A failed classification retains its real
cause; authority errors do not retry. Input-only work does not authorize publishing or implementation.
Pause/abort and missing user facts/authority never authorize an automatic retry or a scope change.
After a fresh authored route enters a checked stage, Pi can also use the same two-pass budget to
continue unfinished selected-stage authoring before source exists. It recomputes `stage next`, not
terminal completion. A concrete planning question stops for the user's answer; existing-route
inspection and route-only classification do not opt into this continuation.
For an existing route, automatic continuation requires a standalone full-workflow skill invocation
without additional user prose, followed by a selected entry check and successful owner publication/write.
A skill name inside a longer request is not an unrestricted continuation grant: that request may
limit the scope or require a stop. Execute its requested work normally, but do not auto-resume the
rest of an existing route. A failed write, help call or read-only visit is also insufficient. Never
reclassify a fresh route merely to evade the user's stopping boundary.
Recompute `stage next --json` after each owned publication or repair, not only at final reporting.
For `reference-board`, follow the returned action instead of repeating a passing entry check:
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
After Sketch produces its isolated candidates and the rendered selection is made, the coordinator
uses `schema candidate-selection` and `candidate select --input` to publish that pointer. Sketch
does not write outside its assigned candidate directory. Run `stage next` again after publication.

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

For a normal product request, keep moving without approval pauses:

```text
route classify → selected research/copy/type passes → selected composition/candidates → guard production → implementation → rendered review/repair/recheck → guard completion
```

After `omd domain check`, print the domain summary for the run record and advance automatically. Do not ask the user to choose references or a visual direction; the coordinator selects and records the strongest evidence. Ask one blocking question only when a missing product fact
would change the route or result materially: market/target audience, the product's real capability, or
whether the primary task is discovery versus continuing an existing application. Otherwise make the
reversible design decision, record why, and continue.

Use `omd stage next --json` from the first classified run, not only after interruption. It identifies
the earliest missing/malformed authored output and names its schemas, contracts and checks; it does
not certify output quality or completion. `domain check` is structural: inspect `unconfirmedPlanning`,
reread the original request, and attach exact excerpts to supported statements. Only genuinely missing
facts require a question. Never invent a prototype-only exclusion for a request to build a full product.

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
  methods and preserve every reasoned skip. When reference discovery is selected, there is no reference quota;
  When it is skipped, use the recorded existing evidence.
- Candidate generation, framing, copy isolation, typography proof, composition, art direction, and
  refinement are conditional methods. Their own contracts apply when selected; absence requires the
  route reason, not an invented artifact.
- Dual research finishes with Scout's screen application: `omd ref apply-plan --json` → fill the
  input from actual images → `omd ref apply-set --input <application.json>` → `omd ref apply-check`.
  Query strings alone are not research: Scout uses native search receipts or v6 `discoveryRoots`
  from `ref navigate --entry public-directory` (domain) / `--entry free-gallery` (design).
  Direct browsing of public lists is allowed without a search engine. Retained entries still trace
  to actual visible links and separate native visits; lists/search images stay outside refs.
  Inspect free-access failures and try a public alternative; never require a paid reference MCP.
  Show the user the retained previews and `.omd/reference-application.md`. Every domain-brief surface
  needs separate domain/design coverage, decisions, exclusions, gaps and future rendered checks.
  Pass only referenceApplication/screenApplication from the validated brief/handoff to Composer and
  Hand; never pass the source-bearing plan output or raw research. This is intended use, not proof
  of use or approval. Actual renders, usage evidence and review remain necessary. Keep the route's
  own candidate count and selection authority; this adaptation does not impose a new approval gate.
- Selected `content-grain`, art direction, concept formation, colour, and refinement methods follow
  their native protocols and stage briefs; skips retain their typed reasons. For art direction, apply
  `[metaphor-contract:typed-router]` and pass the immutable visual contract unchanged to visual owners;
  writer receives only its copy-safe projection. For concept formation, follow `theory/imagegen.md` and
  `protocol/human-design-loop.md`; external references stay sanitized and rendered hypotheses win.
- Safety work and required outcomes are mandatory; a high-risk route without its safety rail,
  rigorous task/accessibility validation, and recovery evidence is invalid. Production remains owned by
  `oh-my-design:hand`, launched on Codex only through `omd-codex owner run`, with allowed paths and named deps.
- If selected, the coordinator alone may run `omd ref visual-packet --slot <used-slot>` and pass only
  its source-free, no-ship geometry manifest/SVG to Composer and Hand; raw packet evidence and refs stay
  isolated. Require `omd ref visual-packet-check --production <changed-files>` before production; the
  packet never becomes source colour, copy, imagery, typeface, or an asset.
- For market-grounded references, run `omd ref locale-bind` after the board; its source-free output
  binds local pieces to current profile decisions and captures, and `locale-bind-check` gates use.
- Production, decision-linked browser evidence and fresh independent `oh-my-design:eye` review always end the route.

Artifact ownership remains exclusive: frame/acquisition `oh-my-design:framer`; scout/reference `oh-my-design:scout`;
copy `oh-my-design:writer`; type `oh-my-design:typesetter`; composition `oh-my-design:composer`; candidates `oh-my-design:sketch`;
production/observations `oh-my-design:hand`; verdicts fresh `oh-my-design:eye` or `oh-my-design:glance`. The coordinator preserves
records and never impersonates an owner.

## Production

In investigate mode, keep proofs/reviews current. Source-free greenfield components use
`omd workflow readiness` and `omd workflow check-readiness`; owners publish with
`omd workflow slice` and `omd workflow artifacts`, then `omd workflow check`.
A decision graph never substitutes for a selected proof.

`oh-my-design:hand` builds from the role-safe production handoff, stays in routed scope, runs its checks
and returns changed paths and results.

Codex Hand is source-write-only; browser/evidence follow success.
**[production-project-quiescence]** Before launch, prepare inputs. Until its signed result returns,
others are read-only across the entire project, including `.omd/.cache`; wait on the existing
handle. See `protocol/human-design-loop.md` §State boundary.

Observe task states, viewports, interactions, reduced motion and recovery required by outcome/UX contracts in the real renderer.
Link observations to the decisions they validate. Do not add states, motion, references, candidates,
or research merely to repeat an older sequence.

Before either initial final blind Eye runs, print `omd schema final-render-reviewer-packet`, write its
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

Benchmark products run `omd lifecycle plan`. Run selected checks, build/typecheck,
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
