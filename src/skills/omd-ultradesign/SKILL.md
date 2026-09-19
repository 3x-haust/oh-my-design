---
name: omd-ultradesign
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
transaction may launch the dedicated `omd-hand` repair owner once against its external private mirror;
it is not a second initial Hand and cannot write production or `.omd`. Only lifecycle repair may publish
its one-file mirror change.

On Codex, `omd ...` means `"$OMD_NODE_EXECUTABLE" "$OMD_CLI_PATH" ...` and `omd-codex ...` means
`"$OMD_NODE_EXECUTABLE" "$OMD_CODEX_CLI_PATH" ...`; use host paths, never bare commands/aliases.

## Adaptive route

On Codex use `omd-codex exec -C <project> ...` (or `oh-my-design codex exec ...`) with opaque read-only
`OMD_ACTIVATION_PATH` when the current host actually supplies that launcher. Never manufacture or reuse Codex activation.
Pi and the local CLI use `omd_cli`/`omd` without `--activation`; local command authority is created by the CLI.
An absent external activation file is not a Pi setup error. Do not ask the user to supply one.
The Codex role/owner commands above apply only when that broker is available, never to Pi.
Pi uses available native delegation with the user's model; if independent review is unavailable,
record that limitation rather than claiming an isolated review or blocking reference collection.
On Pi without a delegation tool, execute the selected design roles as explicit, sequential role passes
in the current session, respecting each role's inputs and owned paths. Execution waves still express
dependency groups; do not simulate child handles or concurrent processes. This host fallback does not
attest independence. Record same-session review as such in the design handoff, and do not run broker
commands or ask the user for a missing broker to perform ordinary research and design work.

Before selecting methods, read `omd pack protocol/human-design-loop.md --section "Visual reference gallery and concept exploration"`. A simple task is not settled visual evidence; a current supplied direction can be. Experiments stay conditional.

Check native image generation first. For unsettled marketing, use it when available.
For image-to-code, follow `omd pack theory/imagegen.md --section "Carry a selected image into source"`.
On visual rejection, reread `omd pack theory/imagegen.md --section "Reopen a rejected visual direction"`.

In-project:

```text
omd doctor
omd stack --json
omd schema route-input
omd route validate --input .omd/.cache/route-input.json --json
omd route classify --input .omd/.cache/route-input.json --json
omd stage resume
omd route show
```

On a brokered Codex invocation append the supplied `--activation` to publishing/reading commands.
If validation fails, read the exact schema and repair the named field, then validate again.
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

For any new or redesigned UI, do not write application source, copy, or generated-project docs until the
current route is present and the route-selected reference work has produced real evidence. A missing
`.omd/route.json`, missing `.omd/refs/` evidence, or missing `.omd/reference-board.json` is a hard stop:
run the route and Scout/reference stages first. Render captures of the generated app are not design
references and cannot satisfy this requirement.

Do not let a model-written intake recap become the first screen. Reject headings or subtitles equivalent
to `다시 오셨네요`, `지금 할 일을 먼저 볼게요`, or `최근 퇴사 상황을 바탕으로 이어서 할 수 있는 일을 정리했어요`.
Start with the user's concrete task, decision, object, or next action; a verified situation may support
that action but cannot replace it.

## One-shot execution

For a normal product request, keep moving without approval pauses:

```text
route classify → domain check → reference discovery → reference judgment → composition → render/critic → production
```

After `omd domain check`, print the domain summary for the run record and advance automatically. Do not ask the user to choose references or a visual direction; the coordinator selects and records the strongest evidence. Ask one blocking question only when a missing product fact
would change the route or result materially: market/target audience, the product's real capability, or
whether the primary task is discovery versus continuing an existing application. Otherwise make the
reversible design decision, record why, and continue.

## Reference roles

Read `protocol/reference-assembly.md`: three roles (component, craft, mood) over two axes. `omd ref mood`, `omd ref gates`, and `omd ref granularity` carry the checks.

## First-render gestalt check

After first render, run `omd first-render check --input .omd/.cache/first-render-surface.json`. It checks purpose, dominant object, utility subordination, comparison, and trust. `revise` requires composition/rerender, never threshold changes; benefit cards leading with subordinate sidebar/search/AI is `retain`.

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
```

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
final-v2 through the host. Re-read its pointer and run `omd completion preflight --activation "$OMD_ACTIVATION_PATH"`.
Independent review and final evidence apply at every task size.

If preflight fails or `.omd/final-evidence-v2.json` lacks the current immutable record, you MUST NOT say the work is complete. Report the exact host-authority blocker and strongest checks, keeping completion
unclaimed; never substitute app tests, build output, screenshots, probes, or reviewer prose for the
current final pointer and successful terminal preflight.

When active Grain is selected, final-v2 requires current Fit. Add a short read-only `Designed around
your material` Fit Receipt naming preserved material and desktop/mobile evidence paths; report measured
preservation only, never raw content or inferred preference/taste. Omit it when Grain is skipped/declined.

Return the interface, evidence, checks and blockers; never ask the user to operate the harness or expose quotas.
