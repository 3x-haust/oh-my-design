# Human design loop protocol

This is the durable contract for an OMD run. Host prompts may explain it, but may not
reorder it:

`preflight -> frame -> concept -> research -> writer copy deck -> copy check -> blind copy
edit -> writer revision -> copy check -> typesetter proof -> blind type review -> type
revision/proof pass -> structural sketches -> blind selection -> production build ->
semantic checkpoint -> selected-container type reproof -> visual checkpoint -> squint
glance -> sharp critique/probe -> reframe -> ship`.

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

Durable, reviewable state lives directly under `.omd/`: `frame.md`, `copy-deck.md`,
`type-proof.md`, `decisions.md`, `design.md`, `attribution.md`, `motion-spec.md`, `craft.jsonl`,
`config.json`, `probes/*.json`, `refs/*.json`, and explicit taste records. Reusable intent
belongs here; generated screenshots and raw execution output do not.

Ephemeral state lives under `.omd/.cache/`: IR, renders, filmstrips, typography specimens,
structural candidates, probe results, and scratch output. It can be deleted without erasing
a design decision.

## Evidence and taste precedence

When evidence conflicts, apply this order and record the conflict:

1. the current brief;
2. explicit feedback from the current user in this run;
3. prior explicit project taste recorded with verbatim evidence;
4. agent choices and legacy/unknown records.

Never infer user taste from an agent selection, silence, an unchanged screen, or legacy
choice data. Coach remains taste-blind.

## Blindness and isolation

Each sketch receives only a sanitized frame/concept, the copy deck, the approved typography
contract derived from `.omd/type-proof.md`, an anonymous candidate id, and one structural
axis. The contract exposes approved roles, family, weight, size/measure, and wrapping
constraints, not rejected-alternative rationale or authorship. A sketch preserves this
contract, varies structure only, cannot invent a new type scale, cannot read or reuse another
candidate, and writes only to `.omd/.cache/sketches/<id>/`.

The copy editor is a fresh eye context and sees only the sanitized brief, copy deck/fact
ledger, and cited voice/audience evidence. It sees no renders, layout, code, build rationale,
frame, decisions, or authorship, and it reports without editing. The writer receives the
report and revises the deck before another deterministic check.

The typesetter owns `.omd/type-proof.md` and `.omd/.cache/type-proof/`. It sees the clean
copy deck, typography theory, and scout typography evidence, but does not design composition,
colour, graphics, motion, or rewrite copy. A fresh eye in typography-proof mode sees only
desktop/mobile specimens plus sanitized copy and typography requirements. It never sees
authorship, references, rationale, page structure, colour, or code and never edits.

The selector gets a fresh context and sees anonymous renders plus the sanitized frame, copy
deck, and the same approved typography contract. It judges structural accommodation without
typography rationale and never sees candidate prose, author identity, reference attribution,
or the production plan. The glance receives only squint renders. It never sees sharp renders,
frame, decisions, references, or rationale. The general eye receives only a sanitized
review brief: primary task, costliest error, generator/register, renders, and deterministic
check/probe output. It must not read frame, decisions, references, or attribution rationale.

## Divergence and checkpoints

Structural divergence is conditional, not ceremonial: default to two independent sketches;
use three for showpiece work or high structural uncertainty/impact. Skip only when structure
is already supplied (for example, a Figma frame or explicit visual target), and record why.

The hand builds once. During that build it must render real content and record two craft
checkpoints: semantic layout, then the visual system before motion. After semantic structure
and before the visual checkpoint, it re-proves the approved typography inside the selected
production container at desktop and mobile. Each checkpoint names a concrete observation
and the resulting change. Human approval checkpoints are separate:
`.omd/config.json` defaults to `checkpoint: none`; concept, structure, or both are opt-in.

## Safe probe policy

Probe only an explicit plan under `.omd/probes/*.json`. Plans are non-destructive and may
use only declared click, fill, and keypress steps with declared expectations. Probe only a
local file or localhost/loopback URL; reject remote, authenticated, credential, destructive,
or undeclared actions. Never discover controls and auto-click them. A probe warning can
come only from an expected tab order or a declared post-action expectation.

Squint rendering is a hierarchy-isolation aid: conservative blur plus grayscale. It is not
a colour-vision simulation and does not reproduce a literal timed first impression.

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
- After the second clean copy check and before sketches, a fresh `omd-typesetter` creates
  actual-copy specimens at 1280x900 and 390x844 plus `.omd/type-proof.md`. A fresh eye reviews
  only sanitized typography requirements and specimens; the typesetter revises and rerenders
  until the proof passes. The proof records roles, source/licence, target glyph coverage,
  requested and computed family/weight evidence, axes, fallback/loading, wraps/clips, rejected
  alternatives, and its invalidation fingerprint.
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
- Final evidence includes sharp desktop and mobile renders, plus applicable filmstrip,
  `omd check`, humanize review, declared probe, and project tests/build. Findings must be
  clean or deliberately overruled with written evidence; silence is not an overrule.
