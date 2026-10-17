---
name: omd-ultradesign
description: The single OMD entry. Builds new products from scratch, extends or redesigns existing projects, or implements a Figma link, using inspected references and verified real renders.
---

# Ultradesign

Preserve the original request and user-selected model. Keep scope and allowed paths/dependencies.
The model chooses stages/methods. Delegate bounded tasks; sequential passes are not independent review.
Pi uses omd_cli; /ultradesign aliases /skill:omd-ultradesign, not quoted/inline mentions.

Inspect stack/route. Use the applicable route-input, product-route-input or design-route-input schema;
validate then classify. Run `omd stage next --json`.

## One entry: read the situation first

`/ultradesign` is the only OMD entry point. Inspect the actual project and the full request
before choosing the work; never ask the user which mode to use.

- **Empty project or no product source:** greenfield. Build the complete requested product from
  scratch (route `projectMode: greenfield`). Inspect strong references before inventing a direction.
- **Existing project:** read its stack, routes, components, tokens and current renders first, then do
  what the request actually asks. A new feature or surface extends the existing system. A redesign
  first captures the current desktop/mobile screens as the baseline, keeps every function, route
  and data contract, and changes the visual and structural system. A fix stays local. Do not
  restyle untouched areas, replace the stack or drop behavior unless the request says so.
- **Figma link in the request:** the frames are the target. Follow `omd pack guides/figma.md`.
- **Images or URLs supplied by the user:** they are user references. Use the best task fit as the
  primary original; do not replace them with your own discovery unless they cannot serve the task.
- **Interaction states matter as references:** hover, focus, pressed and open states of buttons,
  rows, tabs, menus and inputs carry much of a reference's craft. Capture and compare them, not
  only the resting screen.

Internal guides, read only when they apply (`omd pack <path>`): `guides/references.md`,
`guides/figma.md`, `guides/copy.md`, `guides/critique.md`, `guides/audit.md`, `guides/coach.md`.

## Default native Pi workflow

The host defaults to model-led design. Understand the whole request, inspect the existing project,
inspect strong finished-product visual references before inventing a new visual direction,
use domain research where it helps, then build with ordinary scoped tools.
Match references to the requested surface: populated task screens for product UI,
finished service websites for marketing/landing work, and populated reading/browsing
surfaces for content work. A marketing shell does not prove a product workflow, and an
admin workspace does not establish a landing's composition. Judge actual complete surfaces,
not gallery thumbnails or functional similarity alone. Keep whole original images; browser captures are complete 2x
viewports, not cropped details. Transfer visible composition, hierarchy and control craft
deliberately without importing source branding, copy or product capabilities.
Resolve a coherent primary visual direction from complete, task-fit finished surfaces before
styling. Give supplemental references limited named jobs; do not average incompatible
palettes, density, shapes and control systems. Prefer complementary states within the same
system when available. Domain similarity alone does not establish aesthetic fit.
When you consult external originals, preserve those exact whole PNGs through
`omd ref context --input <json> --json` before the first-render check:
`{schema:"consulted-references-input-v2",requestSha256:<original route request digest>,
images:[{path:<whole PNG>,sha256:<exact file digest>,sourceUrl:<actual source URL>,
role:"primary"|"supplemental",component:<compared destination component, e.g. "booking card">,
state?:"default"|"hover"|"focus"|"pressed"|"open"}]}`. Exactly one image is primary.
Capture reference interaction states with `omd ref add <url> --preparation <json>`
(`hover`, `focus`, `press-start` or a disclosure `click`; never submit, sign in, pay,
delete, download or navigate away), one whole capture per state. For every primary state,
author a matching `hover`/`focus`/`press-start` action with `captureState` in the
trusted lifecycle manifest so the final review compares the same component and state.
Completion refuses without a request-scoped primary original unless the request links a
Figma target, which is proven by its own frame diffs instead. This lightweight reported comparison context is not
reference admission, candidate selection or approval; do not create a board merely to use it.
The harness delivers these exact originals privately to contextual early/fidelity review,
separately from first-party candidate targets and rejected output baselines.
Compare the first actual render directly with the primary original: macro proportions,
hierarchy, density, typography and small-control anatomy must visibly carry through, not
just generic list/detail relationships or one motif such as offset pictures. First describe
what gives the original its visual identity, then compare the actual render; do not define
fidelity by the few qualities you happened to implement. Keep explicit destination
constraints, but do not use them to discard unrelated reference qualities by default.
For a faithful-reference task, reproduce the primary's actual visual system before
introducing a new style: type family character and weight, type-to-space ratios,
macro geometry, content density, surface tones and complete control anatomy.
Do not translate a light sans-serif original into an invented serif "editorial"
system, or preserve only its broad list/sidebar relationship. Work from the actual
whole pixels; inspect source runtime styles when available rather than guessing.
Adapt product content and functions inside that system, with explicit destination
constraints governing only the departures they actually require. Recheck the whole
render after adaptation. A reported primary is comparison material, not approval,
but its comparison-only status does not waive this reproduction obligation.
Inspect inputs as complete systems: borders, inner
spacing, focus/disabled states, resizing, overflow and adjacent actions. Native resizing
must be deliberate; an accidental grip is not finished craft. Preserve keyboard access,
visible focus, content recovery and usable multiline entry when refining controls.
Present the actual consulted originals and source URLs alongside generated desktop/mobile
screens. Identify the transferred structure and its limits. If none were inspected, say so;
do not attach references retrospectively or ship their pixels as product assets.
Preserve exact user rejection and the rejected renders as the next comparison baseline.
A broad aesthetic rejection calls for reconsidering the integrated direction and craft,
not merely hiding the one highlighted edge or changing an accent color. Do not invent a
preferred style, human rating or improved satisfaction from a model's own review.
When a render fails, diagnose the competing relationship before choosing a treatment:
what should be read, compared or acted on together, and what currently interrupts that?
Separate working parts from defects and uncertain assumptions. Keep a sound structure
when the defect is local; change the composition when token polish would preserve the cause.
For repeated content, try one complete representative unit with real contrasting values
before propagating it. For example, rebuild a plan's name, price, billing terms, differences
and action as one comparison unit, then place unlike plans beside it. Do not validate only
one short placeholder or remove terms to make it fit. Preserve distinct component roles.
If an attempted repair creates another failure, discard or recompose that treatment:
change an unreadable photo/text relationship rather than endlessly adding overlays.
Choose these working techniques as useful; they add no document, candidate quota or gate.
After propagation or adaptation, inspect the current whole desktop/mobile render, including
the actual long content and affected states. A better isolated unit is not a better whole
system, and a creator's or model's preference is not measured task or business improvement.
Choose methods, candidate count and delegation yourself. There is no mandatory role relay,
candidate competition, written skip or intermediate design document for an unselected method.
Check `omd guard production --json` before source work; selected methods keep their actual contracts.
After the first usable build, run `omd first-render check --page <actual-build-entry> --json`.
For qualitative rejection, keep the verbatim opinion separate from your interpretation.
Use `omd feedback report --input <json> --json` with schema
`qualitative-feedback-input-v1`, the original route `requestSha256`, `origin: reported`,
`text`, advisory `interpretation`, and actually shown whole PNG `images`
(`path`, `sha256`, `viewport: desktop|mobile`, `state`). It snapshots exact pixels for
direct authoring and independent comparison. Do not invent a shown-image history;
missing images remain a stated gap. Reconsider the whole visual system rather than
turning broad rejection into a numeric target, icon swap or removal of decoration.
These reports are comparison-only, not permission, approval or validated calibration.
Authored state labels accompany the maker only. The isolated comparison receives whole
pixels and verified viewport/dimension/digest metadata, and identifies state from those pixels.
The harness captures desktop/mobile and runs an isolated early quality review without requiring
a design-judgment document on the model-led route. Repair localized findings before spending on
the full behavioral scenario set. Judge icon optical scale, weight and silhouette together with
type, density, containment and controls; exchanging an icon library alone is not a design repair.
This early model judgment is neither source-fidelity proof nor human aesthetic approval.
When a primary consulted original is present, the early reviewer must separately
return capture-bound referenceComparisons for both production viewports. A missing,
failed or insufficient comparison cannot be replaced by generic quality passes or
relative repair progress. Repair the cited mismatch and recapture.
After implementation, author one `trusted-lifecycle-manifest` from the real controls, covering
every requested outcome and desktop/mobile state. `omd lifecycle finish --json` runs package
checks, actual browser evaluation, isolated visual/outcome review and final publication together.
The host invokes it automatically when that proposal is ready and follows concrete repair findings.
Repair actual failures without reducing the request. Execution records are harness facts, not
invented design judgments; independent model review is not human aesthetic approval.
Preserve source scope, external-action consent, unknown-fact boundaries and honest evidence.
