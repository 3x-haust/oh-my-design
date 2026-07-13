# Human design loop protocol

This is the durable contract for an OMD run. Host prompts may explain it, but may not
reorder it:

`preflight -> frame -> concept -> research -> writer copy deck -> copy check -> blind copy
edit -> preserve copy-eye report -> copy review-check -> writer revision -> copy check -> typesetter proof -> blind type review -> type
revision/proof pass -> composition contract/check -> structural sketches -> blind selection -> production build ->
semantic checkpoint -> selected-container type reproof -> visual checkpoint -> squint
glance -> source candidate scan/triage -> sharp critique/probe -> repair/rescan -> reframe ->
ship`.

## Stack routing

Apply one precedence everywhere: explicit user request > existing repository stack/toolchain
(including existing vanilla HTML) > React + Vite + TypeScript only for a truly blank
greenfield. Plain HTML greenfield requires an explicit user request. There is no autonomous
single-static-surface exception. Before the hand's first write it reads the brief,
package.json when present, and one representative existing surface/component when present,
then records the stack choice and evidence. Preserve and investigate an unrecognised package
or toolchain; never cover it with a React scaffold. Greenfield scaffold dependencies are
allowed. Existing projects receive no unnecessary dependencies.

## State boundary

Durable, reviewable state lives directly under `.omd/`: `frame.md`, `scout.md`, `copy-deck.md`,
`type-proof.md`, `composition.md`, `decisions.md`, `design.md`, `attribution.md`, `motion-spec.md`, `craft.jsonl`,
`source-seal.json`, `config.json`, `probes/*.json`, `refs/*.json`, and explicit taste records. Reusable intent
belongs here; generated screenshots and raw execution output do not.

Ephemeral state lives under `.omd/.cache/`: IR, renders, filmstrips, typography specimens,
structural candidates, raw source-candidate JSON, probe results, and scratch output. It can
be deleted without erasing a design decision. Accepted and dismissed candidate reasoning is
durable and belongs in `.omd/decisions.md`.

## Evidence and taste precedence

When evidence conflicts, apply this order and record the conflict:

1. the current brief;
2. explicit feedback from the current user in this run;
3. prior explicit project taste recorded with verbatim evidence;
4. agent choices and legacy/unknown records.

Never infer user taste from an agent selection, silence, an unchanged screen, or legacy
choice data. Coach remains taste-blind.

## Blindness and isolation

The composer owns only `.omd/composition.md`. After typography approval it receives the
sanitized frame/concept, clean copy deck, approved type proof, and durable scout summary when
present. It receives no raw screenshots, source files, pixel samples, URLs, candidate
renders, rejected alternatives, or authorship. It turns evidence into a structural contract,
records exact SHA-256 fingerprints, and runs `omd composition --check` before divergence.

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
frame, decisions, or authorship, and it reports without editing. The coordinator first
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
- Walk `craft/finish-pass.md`. Complete applicable items and record a concrete reason for
  every skipped item.
- When `.omd/design.md` exists, run `omd design --check` and resolve its findings.
- Always run `omd ref distance <page>`; a similarity above `0.6` does not ship.
- When `.omd/target/manifest.json` exists, run a bounded `omd target diff` repair loop.
  Stop at the configured threshold or record the remaining measured mismatch and evidence;
  never iterate without a bound.
- For multi-page output, run `omd check --site <dir>` and resolve cross-page drift.
- Once production source exists, run the source-candidate scan and contextual triage before
  the final sharp verdict. Resolve every triage item, repair and rescan confirmed current
  candidates, and retain evidence for dismissals. Candidate presence alone never fails the
  run; final untriaged and needs-render counts must both be zero.
- Final evidence includes sharp desktop and mobile renders, plus applicable filmstrip,
  `omd check`, humanize review, declared probe, and project tests/build. Findings must be
  clean or deliberately overruled with written evidence; silence is not an overrule.
- After all production source and approved inputs stop changing, run `omd source --seal
  <root>` and then `omd source --check <root>`. `.omd/source-seal.json` proves byte freshness
  for copy deck, type proof, composition, and sorted production source files only; it does
  not claim semantic copy/source fidelity.

`omd render` captures the exact requested viewport by default. Use `--full-page` only as
supplementary continuity evidence; it never replaces the fixed desktop/mobile viewport
captures used for hierarchy, critique, or acceptance.
