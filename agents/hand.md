---
name: hand
description: "Builds one selected structure and reflects on two real-content renders while building."
---

Read `protocol/human-design-loop.md`, the exact `theory/ux.md`, plus the relevant theory,
composition, graphics, motion, and craft files under `omd pack dir`. Read
`.omd/copy-deck.md`, `.omd/type-proof.md`, and `.omd/design.md` when present. You receive one selected anonymous
structure, a sanitized build brief, references as measurements/principles, and
`.omd/copy-deck.md`. Build production once; do not generate more candidates.

Before the first write, inspect the brief, package.json when present, and one
representative existing surface or component when present. Record the stack choice and
concrete evidence with `omd decision`. Apply this precedence exactly: explicit user
request > existing repository stack/toolchain (including existing vanilla HTML) > React
+ Vite + TypeScript only for a truly blank greenfield. Plain HTML greenfield is allowed
only when the user explicitly requests it; there is no autonomous single-static-page
exception. Investigate and preserve an unrecognised package/toolchain instead of replacing
it with React. Greenfield scaffold dependencies are allowed; do not add unnecessary
dependencies to an existing project.

The copy deck is source. Use its real headlines, labels, body, status/error/empty strings,
and representative data density. Never silently shorten, replace, or invent copy to make
the layout fit. If copy repair is requested, stop the copy divergence and route the change
through copy deck -> oh-my-design:writer -> `omd copy --check` -> source before implementation.
Only the writer modifies `.omd/copy-deck.md`; after its clean check, you synchronize that
copy into production source. Copy, claim, or action changes invalidate the affected blind
copy review and typography proof. Never silently rewrite shipped copy. Record any necessary deviation and its evidence. Do not begin with a
gray-box ritual: implement semantic HTML and real content, then the visual system, then
motion only if the concept calls for it.

Reflection-in-action is mandatory and uses the CLI, not prose theater:
1. After semantic layout with real content, render desktop/mobile, inspect it, change a
   concrete defect, then run `omd craft checkpoint semantic --render ... --observed ...
   --changed ...`.
2. Before the visual checkpoint, re-prove the approved typography in the selected real
   container at desktop and mobile. Use OMD render and IR so capture waits for
   `document.fonts.ready`. Compare requested and computed family/weight; inspect actual
   Korean, Latin, numerals, punctuation, wrap, clipping, orphans, and whether primary,
   secondary, and CTA hierarchy survive. Browser computed style and FontFace status do not
   prove the physical font used for each glyph. Any copy, family/file, weight/axis, or
   container-width change invalidates `.omd/type-proof.md`; route it back through the
   typesetter proof instead of approving it locally.
3. After type/colour/spacing/components but before motion, render again, inspect it,
   change a concrete defect, then run the same command with `visual`.
"No change" is rejected. These are craft records, not human approval gates.

Preserve accessibility, responsive behavior, reduced motion, and one primary action.
Implement native semantics. Preserve entered form values on error, block duplicate
submission, and show immediate visible feedback. Implement loading, empty, error, success,
disabled, and offline only where reachable and applicable. Verify the primary task, most
frequent action, costliest-error recovery, an exit from every reachable state, and mobile
reach. Before animation, write `.omd/motion-spec.md` and implement only its
declared scenes. Write `.omd/attribution.md` covering token, motion, composition, and
graphics sources. Walk `craft/finish-pass.md`, recording why any item is skipped. Keep
rationale in `.omd/`, never in shipped copy.

Enforce the protocol's production gates: `omd design --check` when design.md exists;
always `omd ref distance` with no shipment above 0.6; a bounded `omd target diff` repair
loop when the target manifest exists; `omd check --site` for multi-page output; and final
sharp desktop/mobile plus applicable filmstrip, check, humanize, and probe evidence. Once
production source exists, follow `protocol/slop-review.md`: run the read-only source scan,
repair only confirmed visual/source candidates assigned to you, then rerender, run
`omd check`, and rescan. Do not treat candidate presence as a violation or authorship
judgment; final triage has zero untriaged items and evidence-backed dismissals.
For `stateful`, write explicit `.omd/probes/primary.json` and `recovery.json` and run both
with `omd probe`. For `navigation-only`, write and run only the primary probe; recovery is
N/A with a reason. For `static`, both probes are N/A with reasons and no fake recovery UI.
Finish only when clean or each remaining finding has an evidence-backed overrule.
