---
name: ultradesign
description: >-
  Design and build an interface through a human design loop: interrogate the brief,
  research evidence, write real copy first, compare isolated structural sketches, build
  reflectively, test hierarchy and interaction, critique blind, reframe, and ship.
  Use for UI, page, app, dashboard, blog, landing-page, and redesign requests.
---

# Ultradesign

> **Figma routing**: when the brief contains a figma.com link, hand off to `oh-my-design:figma`
> instead of running this loop. The design decisions — concept, colour, type, layout —
> were already made in Figma; the frame/concept/reference steps here are not needed.

Give the user the working interface they asked for. Do not expose internal quotas or ask
them to operate the harness. Run host-native agents in fresh contexts; do not create a
workflow engine, queue, model router, or session runtime.

Read `protocol/human-design-loop.md` from `omd pack dir` first. It owns phase order, state,
evidence precedence, blindness, isolation, checkpoints, and probe safety. Use the relevant
theory/cookbook files (`theory/`, `composition/`, `graphics/`, `motion/`, `craft/`) instead
of duplicating their rules here. `.omd/` records are English; the interface and handback use
the user's language.

## 0. Preflight and routing

Pin the absolute working directory and run `omd doctor`. Stop on a failed prerequisite.
If the user supplied a Figma frame or exact visual target, route to `oh-my-design:figma`/target
convergence for structure; this loop still uses content, craft, glance, probe, and critique.

Apply stack precedence exactly: explicit user request > existing repository stack/toolchain
(including existing vanilla HTML) > React + Vite + TypeScript only for a truly blank
greenfield. Plain HTML greenfield requires an explicit user request; there is no autonomous
single-static-surface exception. Preserve and investigate unrecognised package/toolchain
evidence instead of replacing it with React. Greenfield scaffold dependencies are allowed;
existing projects receive no unnecessary dependencies.

Run `omd config show`. `checkpoint: none` is the default and means no approval waits.
Only `concept`, `structure`, or `both` opt into a human pause at that named point.

Run `omd taste profile` and pass only that explicit-user profile to the framer. Never use
`--all` for design decisions. Current brief beats current explicit feedback, which beats
prior explicit taste, which beats agent choices. Record conflicts.

## 1. Frame and concept hypothesis

Spawn `oh-my-design:framer` with the brief, explicit-user taste profile, and working directory. It
records the primary task, frequent action, costliest error/recovery, evidence, hypothesis,
and trade in `.omd/frame.md`.

Read the frame and relevant theory. Form one concept hypothesis: generator/metaphor,
colour direction, typography register, quiet/confident/showpiece register, and one memorable
moment. Ground it in the brief/evidence and record it with `omd frame generator` plus
`omd decision`. Pause only when config explicitly includes the concept checkpoint.

## 2. Research and copy before structure

Spawn `oh-my-design:scout` with the concept, component inventory, user references first, and working
directory. Require coverage across domain, competitors, user/community evidence,
typography, voice, relevant motion, and every required component. Accept no count theater,
pixel copying, low-trust laundering, slop contamination, or kinship.

The coordinator does not author copy. Spawn `oh-my-design:writer` with the brief, scout's cited
voice/audience evidence, working directory, `protocol/copy-deck.md`, and `theory/voice.md`.
It writes only `.omd/copy-deck.md`. Run `omd copy --check`; on failure stop divergence and
send the deterministic findings back to the writer for autonomous repair without waiting
for the user.

After the first clean check, spawn a fresh `oh-my-design:eye` in copy-editor mode with only the
sanitized brief, copy deck/fact ledger, and cited voice/audience evidence. Do not pass renders,
layout, code, build rationale, frame, decisions, or authorship. Send its findings to the
writer for deck-first revision, rerun `omd copy --check`, and start sketches only after it
passes again. Every shipped claim traces to a verified fact ID; fixture/open facts never
ship. Status/error/empty/recovery copy exists only where applicable.

For multi-surface products, run `omd design` and complete the durable design contract. A
one-surface run may skip only this design-contract artifact with a recorded reason; that
skip never changes stack routing.

## 3. Typography proof before structure

After the second clean copy check, spawn `oh-my-design:typesetter` with the copy deck, scout's cited
typography evidence, `protocol/human-design-loop.md`, and `theory/typography.md`. It creates
layout-neutral actual-copy specimens in `.omd/.cache/type-proof/`, renders 1280x900 and
390x844, and writes `.omd/type-proof.md`. It does not design composition, colour, graphics,
or motion and does not rewrite copy.

Spawn a fresh `oh-my-design:eye` in typography-proof mode with only the two specimens plus sanitized
copy and requirements. Do not pass authorship, reference rationale, page structure, colour,
or code. Return the blind findings to the typesetter, require revision and both renders
again, and start sketches only after the proof passes. Large type may pass when concept-
bearing and proof-clean; size alone is neither success nor failure.

The proof fingerprint is invalid after any copy, font family/file, requested weight/axis, or
proof container-width change. Rerun the proof instead of carrying an obsolete approval.

## 4. Independent structural divergence and blind selection

Gate divergence by structural uncertainty and impact:

- default: two independent `oh-my-design:sketch` contexts;
- showpiece or high uncertainty/impact: three;
- skip only when structure is supplied (Figma/target/explicit layout), recording why.

Give every sketch the same sanitized frame/concept, copy deck, and sanitized approved
typography contract derived from `.omd/type-proof.md`, plus a different anonymous candidate
id and structural axis. Include approved roles, family, weight, size/measure, and wrapping
constraints; omit rejected-alternative rationale and authorship. Sketches preserve that
contract and vary structure only. They cannot invent a new type scale, see one another, or
read the full proof, and write only under
`.omd/.cache/sketches/<id>/`. Their real-content low-fi renders contain structure and type
scale, never colour, motion, graphics, production edits, or sales prose.

Spawn a fresh `oh-my-design:eye` in sketch-selector mode with anonymous renders, sanitized frame,
copy deck, and the same sanitized approved typography contract only. It judges whether each
structure accommodates the approved type roles and constraints, not candidate or typography
rationale.
Record the winner and rejected tradeoffs. Pause only when config explicitly includes the
structure checkpoint.

## 5. Production build with reflective craft

Spawn `oh-my-design:hand` once with the selected structure, sanitized build brief, copy deck,
`.omd/type-proof.md`, and reference measurements/principles. The hand builds semantic real-content layout first,
then the visual system, then motion. It must record two concrete reflection-in-action loops:

```bash
omd craft checkpoint semantic --render <path> --observed "..." --changed "..."
omd craft checkpoint visual --render <path> --observed "..." --changed "..."
```

The semantic checkpoint occurs after desktop/mobile real-content layout. Then the hand
re-proves typography inside the selected production container at desktop and mobile after
OMD render/IR waits for `document.fonts.ready`. It compares requested versus computed
family/weight, actual Korean/Latin/numerals, wraps, clips, orphans, and hierarchy. The visual
checkpoint occurs only after that reproof and after type/colour/spacing/components, before
motion. Both checkpoints require a change; a gray-box or "no change" ritual does not count.

The build acceptance contract verifies the primary task, most frequent action,
costliest-error recovery, an exit from every reachable state, immediate visible feedback,
and mobile reach. The hand uses native semantics, preserves form values on error, blocks
duplicate submits, implements only applicable states, and honors reduced motion.

## 6. Squint before sharp, then safe interaction

Render desktop and mobile squint images before any sharp render is exposed to a critic:

```bash
omd render <page> --viewport 1280x900 --squint -o .omd/.cache/squint-desktop.png
omd render <page> --viewport 390x844 --squint -o .omd/.cache/squint-mobile.png
```

Spawn `oh-my-design:glance` with only those images. Preserve its four-line report. Squint isolates
hierarchy; never call it a colour-blind simulation or literal 50ms test.

Use the copy deck's Interaction scope. `stateful` requires explicit non-destructive
`.omd/probes/primary.json` and `.omd/probes/recovery.json`, with both run through `omd probe`.
`navigation-only` requires and runs only the primary probe; recovery is N/A with a reason.
`static` records both probes N/A with reasons. Never invent recovery/error/empty UI for an
inapplicable surface. Probe only local files/localhost, declared click/fill/press actions,
declared expectations, and optional expected tab order. Never auto-discover and click
controls; never probe remote production or authenticated flows.

## 7. Blind critique, repair, and reframe

Now render sharp desktop/mobile (and filmstrip when motion matters), run deterministic
checks, and spawn a fresh `oh-my-design:eye`. Pass only the sanitized review brief: primary task,
costliest error, generator/register, renders, check output, probe output, and the immutable
glance report. Do not pass frame, decisions, refs, attribution rationale, source authorship,
or build transcript.

For showpiece only, spawn one additional fresh eye with exactly one dominant-technique lens
chosen from typography, motion, or graphics. It reviews that technique only. Do not create
a permanent specialist or multi-lens panel.

Send prioritized findings back to the hand for the smallest repair, then rerun affected
checks/renders/probe. If rendered evidence changes the problem, run `omd frame reframe --to
... --because ...`; otherwise record why the frame survived.
If a finding requests copy repair, update the deck through oh-my-design:writer first, re-run
`omd copy --check`, and only then update source. The hand never silently rewrites shipped copy.

## 8. Ship

Verify project tests/build plus `omd check`, two clean copy checks around an independent
writer/editor pass, a blind typography proof before sketches and production-container
reproof before the visual checkpoint, responsive sharp/squint renders, applicable filmstrip, humanize review,
probe, `omd craft status`, `omd design --check` when applicable,
`omd ref distance`, bounded target convergence when a manifest exists, and `omd check --site`
for multi-page output. Everything is clean or has an evidence-backed deliberate overrule.
Deliver the working artifact and briefly state the frame,
concept, structural choice, what the two craft renders changed, glance/critique outcome,
and any deliberate overruling. Do not release, deploy, or wait for further approval unless
the user asked for it.
