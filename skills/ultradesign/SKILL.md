---
name: ultradesign
description: Design interfaces from outcomes, evidence, renders, and independent review.
---

# Ultradesign

The user-selected model owns strategy: role order, stage order, and optional methods.

## Runtime ownership

The session model belongs to the user; OMD selects only role effort. Codex child launches omit `model`
and inherit the host; Claude agents use `model: inherit`; Pi uses `omd_cli`. Codex named roles receive
their `agent_type` plus a fresh role-bounded prompt. Never combine a named `agent_type` with a
full-history fork. Claim isolation only when the host provides it.

A named owner receives its brief, contracts, project path, and task. The coordinator retains the real
child/process identifier, waits for actual completion, and gates it. A missing selected owner is a visible
blocker; ownership never transfers. Run non-production Codex roles through:

```text
omd-codex role run --agent <selected-role> --input <task.md> --json
```

Run production only through its stricter owner transaction:

```text
omd-codex owner run --agent omd-hand --input <task.md> --json
```

The transaction authenticates host authority and permits one fresh retry only before mutation. Do not
launch or resume a second hand, use native `spawn_agent`, or let the coordinator write production.
Host logs stay outside the project; the owner snapshot includes `.omd/`.

## Preflight and adaptive route

On Codex, start through `omd-codex exec -C <project> ...` (or `oh-my-design codex exec ...`). The
host launcher exports the opaque, read-only `OMD_ACTIVATION_PATH`; never replace it. On a
Pi-compatible host use `omd_cli`. If it cannot issue required authority, stop at that boundary;
never manufacture or reuse Codex activation.

From the target project:

```text
omd doctor
omd stack --json
omd schema route-input
omd route classify --input .omd/.cache/route-input.json --json --activation "$OMD_ACTIVATION_PATH"
omd stage resume
omd route show --activation "$OMD_ACTIVATION_PATH"
```

The closed route carries outcomes, evidence, reality, UX rails, fact status, axes, browser context,
ordered roles/stages/contracts, attribution, methods, and reasoned skips. Malformed context fails
closed. High-risk work retains safety and rigorous UX validation. Scope, outcomes, write/activation
authority, sealing, final-v2, independent review, and model ownership cannot be skipped.

`omd route check --activation "$OMD_ACTIVATION_PATH"` enforces write scope. A UI request does not authorize repository
publication, licensing, unrelated dependencies, or unrequested surfaces. Use the `omd stack` renderer.
A supplied Figma frame is structure evidence. Whether framing or alternative generation is useful is decided by the adaptive route;
this never removes required UX outcomes, production evidence, accessibility, or independent review.

## Evidence supply

At each selected stage boundary run `omd brief <stage>`. It is derived from current disk state and carries
ownership, applicable references with measured principles, delivered contracts, schemas, renderer,
prior renders, judges, and blockers. Pass it unchanged to the selected owner.

For each contract named by the selected stage:

```text
omd stage deliver --stage <stage> --contract <pack-relative-path>
omd stage require <stage>
```

`[deliver-then-retry]` asks for the missing delivery. `[owner-blocked]` means a selected earlier owner
did not produce its artifact. File/symbol cues come from `omd cue`; schemas come from `omd schema`;
protocol excerpts come from `omd pack <file> --section <heading>`. Roles do not inspect `core/**` to
guess an input shape and do not read this coordinator skill.

Reference and browser records bind provenance, actual use, URL/state/viewport/result, and the tested
decision. Only repeated independent validation becomes advisory guidance.

## Adaptive execution

Use `.omd/route.json` as the machine-consumed strategy. Do not substitute a remembered `thin`,
`standard`, or `deep` sequence.

- Launch only the roles and stages selected by the route, in its model-owned order, while respecting
  actual artifact dependencies.
- Apply selected recommended methods and capability support cards. Preserve every reasoned skip.
- When reference discovery is selected, stop at decision coverage; there is no reference quota.
  When it is skipped, use the recorded existing evidence and actual-use note.
- Candidate generation, framing, copy isolation, typography proof, composition, art direction, and
  refinement are conditional methods. Their own contracts apply fully when selected; absence requires
  the route's reason rather than an invented artifact.
- If `content-grain` is selected, deliver its protocol between frame and composition. Framer publishes
  Grain or decline; Writer preserves fixture morphology; Composer binds its consequences; Hand proves
  both viewports before Fit; Eye checks falsifiers/currentness. A skip creates no Grain/Fit artifacts.
- When art direction is selected, apply `[metaphor-contract:typed-router]` and route the immutable typed decision rather than retyping or
  paraphrasing it. Its selected alternative and decision carry exact non-empty `metaphorQualities`
  and `literalPropsToReject`. Pass the full private visual contract unchanged to `oh-my-design:composer`,
  `oh-my-design:hand`, and the applicable fidelity `oh-my-design:eye`; give `oh-my-design:writer` only the copy-safe projection
  that excludes both fields and all negative instructions. The coordinator does not duplicate or
  author visible UI copy; copy remains the writer's exclusive artifact.
- For concept formation, first-party targets, ambition examples, anti-literal exclusions, and invariant
  revision, follow `theory/imagegen.md` and `protocol/human-design-loop.md`. External references stay
  sanitized; only rendered hypotheses can win, and Hand cannot relax bound invariants.
- Before styling, apply `theory/color.md` for surface-appropriate roles and contrast. No dominant ground
  or neutral palette is a universal default; colour follows the brief, subject, first-party target, and task.
- Safety work and required outcomes are not recommendations. A high-risk route without its safety rail,
  rigorous task/accessibility validation, and recovery evidence is invalid.
- Production remains owned by `oh-my-design:hand`. On Codex it is launched only through `omd-codex owner run`; it writes only allowed paths and uses only named dependencies.
- When the selected route needs direct visual comprehension of a component blueprint, the coordinator
  may run `omd ref visual-packet --slot <used-slot>` only after selection. Pass Composer/Hand the
  current source-free manifest and exact named no-ship SVG; keep
  `.omd/reference-visual-packet-evidence.json` and raw `.omd/refs/` out of their inputs. Require
  `omd ref visual-packet-check --production <changed-files>` before accepting production. The packet
  adds geometry visibility only and never becomes source colour, copy, imagery, typeface, or an asset.
- For market-grounded references, run `omd ref locale-bind` after the board. Its source-free output
  binds declared local pieces to current profile decisions and captures; `locale-bind-check` gates use.
- The terminal evidence transaction remains production, decision-linked browser evidence, and a fresh
  independent `oh-my-design:eye` review. Strategy freedom cannot reorder away those gates.

Artifact ownership remains exclusive whenever an artifact is selected: frame/acquisition belongs to
`oh-my-design:framer`; scout/reference records to `oh-my-design:scout`; copy deck to `oh-my-design:writer`; type proof to
`oh-my-design:typesetter`; composition to `oh-my-design:composer`; structural candidates to `oh-my-design:sketch`; production
source and observations to `oh-my-design:hand`; verdicts to a fresh `oh-my-design:eye` or `oh-my-design:glance`. The coordinator
orchestrates and preserves returned records; it does not impersonate an owner.

## Build, observe, review

In investigate mode, `omd workflow check` means every selected proof and review is current. If a
greenfield component lacks source, publish production-independent artifacts and structure review
with `omd workflow readiness`, then require `omd workflow check-readiness` before the owner.
The owner publishes the component and page-context slice with `omd workflow slice`; publish its
proofs and expression review with `omd workflow artifacts`, then require `omd workflow check`.
A decision graph never substitutes for a selected proof.

`oh-my-design:hand` starts from `omd brief production`, builds only the routed scope, runs its `judgedBy`
commands, and returns changed paths plus actual command results.

On Codex, Hand is source-write-only: its task excludes `omd render`, `omd ir`, `omd probe`,
`omd lifecycle`, Playwright, browser-rs, screenshots, observations, and final evidence. Hand runs
source-safe checks without mutating `.omd` and returns authorized changes. After commit, the
coordinator sends source proofs, browser evidence, review, sealing, and final publication through
their authorized roles and host phases.

Observe the real renderer rather than source intent. Collect the task states, viewports, interaction
paths, reduced-motion behavior, and failure/recovery evidence required by the outcome and UX
contracts. Browser observations must link to the exact design decisions they validate. Do not create
states, motion, reference boards, candidates, or research solely because an older sequence contained
them.

**[protocol-review-packet-contract]** gives every primary
screenshot plus viewport, PNG hash, capture receipt path/hash, and empty check.
**[review-pair-configuration-contract]** gives an identical evidence payload pair-distinct reviewer
configuration—slot/evidence order—with distinct hashes.

The independent reviewer receives opaque renders plus deterministic findings, bounded product facts,
required outcomes, and safety rails. It does not receive authorship, implementation rationale, or
unselected reference material. Only the production owner repairs production.

A refinement round is evidence-driven: RED records an observed mismatch; GREEN records the new
observation and check that closed it. Run refinement when selected or when a required gate remains
RED. Do not manufacture rounds after required outcomes and review are clean.

## Ship

Benchmark products run `omd lifecycle plan`.
Run selected brief checks, build/typecheck, `omd route check --activation "$OMD_ACTIVATION_PATH"`,
and final renderer inspection. After approved inputs and source stop changing, use the trusted
project-write path, seal and recheck source, collect every applicable final
check/probe/render, and publish final-v2 evidence through the host-authorized finalizer. Re-read the
published pointer immediately, then run `omd completion preflight --activation "$OMD_ACTIVATION_PATH"`.
Independent review and final evidence are required on both a one-line
change and a safety-critical new product.

If the preflight does not exit zero, or `.omd/final-evidence-v2.json` does not name the current
immutable record, you MUST NOT say the work is complete. Report the exact host-authority blocker and
the strongest checks that did run, while keeping completion explicitly unclaimed. Never substitute
app tests, build output, screenshots, probes, or reviewer prose for the current final pointer and
successful terminal preflight.

When the route selected active Grain, final-v2 requires current Fit. Add a short, read-only
`Designed around your material` Fit Receipt to the handback: what stayed intact and the desktop and
mobile evidence paths. Report measured preservation only, never raw content or inferred preference
or taste. Omit the receipt when Grain was skipped or explicitly declined.

Return the interface, evidence, checks, and concrete blockers. Do not expose quotas or ask the user
to operate the harness.
