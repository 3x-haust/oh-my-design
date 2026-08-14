---
name: omd-ultradesign
description: >-
  Design and build an interface from typed task contracts, measured project evidence, rendered
  outcomes, and independent review. Use for UI, page, app, dashboard, landing-page, and redesign work.
---

# Ultradesign

Deliver the requested interface from OMD's typed outcomes, boundaries, evidence, and validation.
The user-selected model owns strategy: role order, stage order, and optional methods.

## Runtime ownership

The session model belongs to the user; OMD selects only role effort. Codex child launches omit
`model` and inherit the authenticated host. Production uses the host-owned stdio JSONL boundary.
Claude agents use `model: inherit`. Senpi roles run as isolated processes after a healthy
authenticated `omd host senpi run`; its wrapper accepts no model flag.

A named owner receives only its stage brief, delivered contracts, project path, and bounded task.
The coordinator retains the real child/process identifier, waits for actual completion, and gates
the artifact. A missing selected owner is a visible blocker; it does not transfer ownership. On
Codex, write the task outside production and run:

```text
omd-codex owner run --agent omd-hand --input <task.md> --json
```

The command authenticates the owner against the live `omd-codex exec` host, rejects cross-project,
copied, stale, or owner-mismatched authority, and records its exact session/process events. It permits
at most one fresh-session retry, and only when the first attempt changed no production file. A timeout
after any production mutation is terminal. Do not launch a second hand, resume one concurrently, use
native `spawn_agent` for production, or write production source from the coordinator.

## Preflight and adaptive route

Start Codex through `omd-codex exec -C <project> ...` (or `oh-my-design codex exec ...`). The host launcher exports the opaque, read-only `OMD_ACTIVATION_PATH`; never create, copy, or replace that invocation file.

From the target project:

```text
omd doctor
omd stack --json
omd schema route-input
omd route classify --input .omd/.cache/route-input.json --json --activation "$OMD_ACTIVATION_PATH"
omd stage resume
omd route show --activation "$OMD_ACTIVATION_PATH"
```

The route input is closed and typed. It carries:

- the task outcome contract and completion evidence;
- UX hard rails, required outcomes, recommendations, and free choices;
- confirmed user facts separately from hypotheses and temporary decisions;
- the reference-discovery decision and its actual evidence use;
- task size, failure risk, UX rigor, and expressive-design axes;
- the current user-selected model capability profile decision;
- browser observations linked to the design decisions they test;
- validated-learning context that remains advisory and scope-bound;
- the user-selected model's ordered roles, stages, methods, and reasoned optional skips;
- exact conditional copy-repair, motion-ambition, AI decision receipt, and attribution-category contracts.

Malformed or missing context fails closed. A skipped recommendation, optional stage, or optional method has a written
reason. High-risk work retains safety and rigorous UX validation. Scope lock, required outcomes,
project-write authority, activation, source sealing, final-v2 evidence, independent review, and
user-selected-model ownership are hard gates and cannot be listed as skips.

`omd route check --activation "$OMD_ACTIVATION_PATH"` enforces the declared write scope. A UI request does not authorize repository
publication, licensing, unrelated dependencies, or unrequested surfaces.

Electron and Tauri renderers are web UI inside a desktop shell, not a second website. Use the
renderer target printed by `omd stack`; SEO, no-JS visitor, and marketing checks apply only when the
contract includes a website.

A supplied Figma frame is structure evidence. Whether framing, copy, typography, reference work,
composition, or alternative generation is useful is decided by the adaptive route. It never removes
required UX outcomes, production evidence, accessibility, or independent review.

## Evidence supply

At each selected stage boundary run `omd brief <stage>`. The brief is derived from current disk state:
owner, owned artifact, applicable references with measured principles, delivered contracts, input schemas,
renderer target, prior renders, deterministic judges, and blockers. Pass it unchanged to the
selected owner.

For each contract named by the selected stage:

```text
omd stage deliver --stage <stage> --contract <pack-relative-path>
omd stage require <stage>
```

`[deliver-then-retry]` asks for the missing delivery. `[owner-blocked]` means a selected earlier owner
did not produce its artifact. File/symbol cues come from `omd cue`; schemas come from `omd schema`;
protocol excerpts come from `omd pack <file> --section <heading>`. Roles do not inspect `core/**` to
guess an input shape and do not read this coordinator skill.

A measured observation is instruction-quality evidence. A slogan is not. Reference records state the
component or zone, observed principle, provenance, and actual use. Browser records bind a tested URL,
state, viewport, result, and exact design decision. One observation remains local; only repeated,
independently validated learning may become scoped advisory guidance.

## Adaptive execution

Use `.omd/route.json` as the machine-consumed strategy. Do not substitute a remembered `thin`,
`standard`, or `deep` sequence.

- Launch only the roles and stages selected by the route, in its model-owned order, while respecting
  actual artifact dependencies.
- Apply selected recommended methods and capability support cards. Preserve every reasoned skip.
- When reference discovery is selected, gather for unresolved decisions and stop at coverage; there
  is no reference quota. When it is skipped, use the recorded existing evidence and actual-use note.
- Candidate generation, framing, copy isolation, typography proof, composition, art direction, and
  refinement are conditional methods. Their own contracts apply fully when selected; absence requires
  the route's reason rather than an invented artifact.
- When art direction is selected, apply `[metaphor-contract:typed-router]` and route the immutable typed decision rather than retyping or
  paraphrasing it. Its selected alternative and decision carry exact non-empty `metaphorQualities`
  and `literalPropsToReject`. Pass the full private visual contract unchanged to `omd-composer`,
  `omd-hand`, and the applicable fidelity `omd-eye`; give `omd-writer` only the copy-safe projection
  that excludes both fields and all negative instructions. The coordinator does not duplicate or
  author visible UI copy; copy remains the writer's exclusive artifact.
- Before art direction, composition, or production writes visual styling, settle a rendered palette
  plan from `theory/color.md`: dominant ground, secondary surfaces, primary/brand colour, accent,
  expected 60-30-10 roles, and contrast targets. A general product surface defaults to true white
  (`#FFFFFF`) for the dominant 60% canvas; near-white neutrals belong to secondary surfaces. A dark,
  tinted, cream, beige, paper-like, or material dominant ground
  requires explicit user, brand, or subject evidence; style words such as "editorial", "premium",
  "cultural", or "magazine-like" alone are not evidence. Translate them into hierarchy, rhythm,
  typography, imagery, and composition rather than literal material imitation.
- Safety work and required outcomes are not recommendations. A high-risk route without its safety rail,
  rigorous task/accessibility validation, and recovery evidence is invalid.
- Production remains owned by `omd-hand`. On Codex it is launched only through `omd-codex owner run`; it writes only allowed paths and uses only named dependencies.
- The terminal evidence transaction remains production, decision-linked browser evidence, and a fresh
  independent `omd-eye` review. Strategy freedom cannot reorder away those gates.

Artifact ownership remains exclusive whenever an artifact is selected: frame/acquisition belongs to
`omd-framer`; scout/reference records to `omd-scout`; copy deck to `omd-writer`; type proof to
`omd-typesetter`; composition to `omd-composer`; structural candidates to `omd-sketch`; production
source and observations to `omd-hand`; verdicts to a fresh `omd-eye` or `omd-glance`. The coordinator
orchestrates and preserves returned records; it does not impersonate an owner.

## Build, observe, review

For an investigate-mode workflow, `omd workflow check` means every selected proof and review is current. If a selected greenfield component has no source to render, publish only the production-independent artifacts and applicable structure review with `omd workflow readiness`, then require `omd workflow check-readiness` before launching the owner. The authenticated owner writes only the component and representative page-context slice and publishes `omd workflow slice`; after actual component/interaction proofs and expression review are published with `omd workflow artifacts`, require the complete `omd workflow check`. A decision graph never substitutes for a selected proof.

`omd-hand` starts from `omd brief production`, builds only the routed scope, runs its `judgedBy`
commands, and returns changed paths plus actual command results.

Observe the real renderer rather than source intent. Collect the task states, viewports, interaction
paths, reduced-motion behavior, and failure/recovery evidence required by the outcome and UX
contracts. Browser observations must link to the exact design decisions they validate. Do not create
states, motion, reference boards, candidates, or research solely because an older sequence contained
them.

The independent reviewer receives opaque renders plus deterministic findings, bounded product facts,
required outcomes, and safety rails. It does not receive authorship, implementation rationale, or
unselected reference material. Only the production owner repairs production.

A refinement round is evidence-driven: RED records an observed mismatch; GREEN records the new
observation and check that closed it. Run refinement when selected or when a required gate remains
RED. Do not manufacture rounds after required outcomes and review are clean.

## Ship

Run the project's focused checks, applicable build/typecheck, checks from the selected production and
review briefs, `omd route check --activation "$OMD_ACTIVATION_PATH"`, and final renderer inspection. After approved inputs and source stop
changing, use the trusted project-write path, seal and recheck source, collect every applicable final
check/probe/render, and publish final-v2 evidence through the host-authorized finalizer. Re-read the
published pointer immediately, then run `omd completion preflight --activation "$OMD_ACTIVATION_PATH"`.
Independent review and final evidence are required on both a one-line copy correction and a
safety-critical new product; the work before them is adaptive.

If the preflight does not exit zero, or `.omd/final-evidence-v2.json` does not name the current
immutable record, you MUST NOT say the work is complete. Report the exact host-authority blocker and
the strongest checks that did run, while keeping completion explicitly unclaimed. Never substitute
app tests, build output, screenshots, probes, or reviewer prose for the current final pointer and
successful terminal preflight.

Return the working interface, changed files, actual evidence used, observed result, checks run, and
any concrete blocker. Do not expose internal quotas or ask the user to operate the harness.
