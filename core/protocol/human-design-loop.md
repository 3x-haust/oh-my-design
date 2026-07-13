# Human design loop protocol

This is the durable contract for an OMD run. Host prompts may explain it, but may not
reorder it:

`preflight -> frame -> concept -> research -> copy deck -> structural sketches -> blind
selection -> production build -> semantic checkpoint -> visual checkpoint -> squint glance
-> sharp critique/probe -> reframe -> ship`.

## State boundary

Durable, reviewable state lives directly under `.omd/`: `frame.md`, `copy-deck.md`,
`decisions.md`, `design.md`, `attribution.md`, `motion-spec.md`, `craft.jsonl`,
`config.json`, `probes/*.json`, `refs/*.json`, and explicit taste records. Reusable intent
belongs here; generated screenshots and raw execution output do not.

Ephemeral state lives under `.omd/.cache/`: IR, renders, filmstrips, structural candidates,
probe results, and scratch output. It can be deleted without erasing a design decision.

## Evidence and taste precedence

When evidence conflicts, apply this order and record the conflict:

1. the current brief;
2. explicit feedback from the current user in this run;
3. prior explicit project taste recorded with verbatim evidence;
4. agent choices and legacy/unknown records.

Never infer user taste from an agent selection, silence, an unchanged screen, or legacy
choice data. Coach remains taste-blind.

## Blindness and isolation

Each sketch receives only a sanitized frame/concept, the copy deck, an anonymous candidate
id, and one structural axis. It cannot read or reuse another candidate and writes only to
`.omd/.cache/sketches/<id>/`.

The selector gets a fresh context and sees anonymous renders plus the sanitized frame and
copy deck. It never sees candidate prose, author identity, reference attribution, or the
production plan. The glance receives only squint renders. It never sees sharp renders,
frame, decisions, references, or rationale. The general eye receives only a sanitized
review brief: primary task, costliest error, generator/register, renders, and deterministic
check/probe output. It must not read frame, decisions, references, or attribution rationale.

## Divergence and checkpoints

Structural divergence is conditional, not ceremonial: default to two independent sketches;
use three for showpiece work or high structural uncertainty/impact. Skip only when structure
is already supplied (for example, a Figma frame or explicit visual target), and record why.

The hand builds once. During that build it must render real content and record two craft
checkpoints: semantic layout, then the visual system before motion. Each checkpoint names a
concrete observation and the resulting change. Human approval checkpoints are separate:
`.omd/config.json` defaults to `checkpoint: none`; concept, structure, or both are opt-in.

## Safe probe policy

Probe only an explicit plan under `.omd/probes/*.json`. Plans are non-destructive and may
use only declared click, fill, and keypress steps with declared expectations. Probe only a
local file or localhost/loopback URL; reject remote, authenticated, credential, destructive,
or undeclared actions. Never discover controls and auto-click them. A probe warning can
come only from an expected tab order or a declared post-action expectation.

Squint rendering is a hierarchy-isolation aid: conservative blur plus grayscale. It is not
a colour-vision simulation and does not reproduce a literal timed first impression.

## Production quality gates

These gates are part of every applicable production run, not optional polish:

- Before structure, review the copy deck against `theory/voice.md` and the humanize
  checklist; revise it until the real copy is ready to shape layout.
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
