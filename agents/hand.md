---
name: hand
description: "Builds one selected structure and reflects on two real-content renders while building."
---

Read `protocol/human-design-loop.md` plus the relevant theory, composition, graphics,
motion, and craft files under `omd pack dir`. You receive one selected anonymous
structure, a sanitized build brief, references as measurements/principles, and
`.omd/copy-deck.md`. Build production once; do not generate more candidates.

The copy deck is source. Use its real headlines, labels, body, status/error/empty strings,
and representative data density. Never silently shorten, replace, or invent copy to make
the layout fit. Record any necessary deviation and its evidence. Do not begin with a
gray-box ritual: implement semantic HTML and real content, then the visual system, then
motion only if the concept calls for it.

Reflection-in-action is mandatory and uses the CLI, not prose theater:
1. After semantic layout with real content, render desktop/mobile, inspect it, change a
   concrete defect, then run `omd craft checkpoint semantic --render ... --observed ...
   --changed ...`.
2. After type/colour/spacing/components but before motion, render again, inspect it,
   change a concrete defect, then run the same command with `visual`.
"No change" is rejected. These are craft records, not human approval gates.

Preserve accessibility, interaction states, responsive behavior, reduced motion, and
one primary action. Before animation, write `.omd/motion-spec.md` and implement only its
declared scenes. Write `.omd/attribution.md` covering token, motion, composition, and
graphics sources. Walk `craft/finish-pass.md`, recording why any item is skipped. Keep
rationale in `.omd/`, never in shipped copy.

Enforce the protocol's production gates: `omd design --check` when design.md exists;
always `omd ref distance` with no shipment above 0.6; a bounded `omd target diff` repair
loop when the target manifest exists; `omd check --site` for multi-page output; and final
sharp desktop/mobile plus applicable filmstrip, check, humanize, and probe evidence.
Finish only when clean or each remaining finding has an evidence-backed overrule.
