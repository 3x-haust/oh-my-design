# Layout — conditional decision material

Layout is a hypothesis about reading order, task order, and relationships. No single scan
pattern, hierarchy signal, grid unit, density, or breakpoint is universally correct. State
the condition, predict the effect, render real content, and revise from evidence.

## Start from the experience spine

Before choosing a visual arrangement, write the dependency chain: what the user must notice,
understand, compare, decide, and do. The DOM and keyboard order should follow that meaningful
sequence even when CSS creates a different spatial composition. W3C Focus Order and technique
C27 both make this source-order relationship an accessibility requirement, not a stylistic
preference.

Use hierarchy signals in combination. Size, weight, contrast, position, grouping, imagery,
and motion can all attract or suppress attention; their effect depends on surrounding mass,
content, language, viewport, and user intent. There is no authoritative universal ranking
among them. Predict the first three attention stops, then inspect fixed-viewport squint and
sharp renders.

## Gestalt as testable grouping hypotheses

- **Proximity:** closer items may be perceived as a unit. Keep an internal relationship
  distinguishable from the gap to neighboring groups, then test at actual density.
- **Similarity:** shared treatment may imply shared function or category. Deliberately vary
  treatment when the semantic role differs.
- **Closure:** space, background, edge alignment, or an incomplete contour may establish a
  group without a border. Add containment only when the boundary is otherwise ambiguous.
- **Common fate:** elements moving together may be interpreted as related. Choreograph only
  relationships the content supports.

These are predictions, not pixel prescriptions. A compact data table and an editorial story
can need very different gaps while preserving the same grouping logic.

## Scan behavior is conditional

NN/g's F-shaped pattern describes a recurring behavior on text-heavy web content, especially
when people scan rather than read every word. It is not a universal template and does not
prove that every key action belongs at a particular coordinate. Use it as a warning: weak
front-loading, uninformative headings, and long undifferentiated text make important content
easy to miss. Strengthen information scent and meaningful headings before forcing an
F-shaped composition.

Other tasks produce other paths: comparison can move across aligned rows, search can jump to
landmarks, and sparse storytelling can follow media or an explicit sequence. Do not claim a
"Z-pattern law" without task-specific evidence. Record the expected path and verify it with
content, hierarchy, focus order, and interaction evidence.

## Grid and alignment

A grid coordinates edges, columns, and intervals so relationships remain legible. Carbon's
2x Grid is one documented system that combines a 2x mini unit, 8px base unit, columns,
gutters, and margins; it is an example of a coherent system, not proof that every product
must use those values. Apple similarly frames layout through platform context, safe areas,
readability, and adaptation rather than a single web grid.

Choose a base interval that fits the existing system, platform, type metrics, target density,
and device-pixel behavior. Optical corrections, borders, glyph geometry, and compact control
anatomy can legitimately fall outside it. The useful rule is traceability: repeated values
belong to a scale; deviations name the visible problem they solve.

An alignment break earns its cost when it reinforces the experience spine or concept. If
several elements break different edges without a shared reason, the result usually weakens
relationships. Compare an aligned and a deliberately broken candidate rather than treating
either as inherently sophisticated.

## Density and visual mass

Density depends on frequency of use, expertise, task speed, content volume, screen size, and
error cost. High density can support scanning and comparison for expert, frequent workflows;
lower density can support comprehension, onboarding, reading, or infrequent decisions.
"More whitespace" and "more information" are not goals by themselves.

Map visual mass, not just element count. Large dark areas, saturated media, dense type,
borders, and repeated cards can outweigh their semantic importance. Predict which regions
dominate at desktop and mobile, render real copy/data, and correct accidental competition.

## Responsive recomposition

WCAG Reflow requires content to work without loss of information or functionality and
without two-dimensional scrolling at the specified narrow equivalent, except for content
that genuinely needs two dimensions. This is an outcome requirement, not a mandate for a
particular breakpoint set.

Add breakpoints where content, controls, relationships, or readable measures fail—not at a
fixed list of device labels. At each transition decide explicitly whether regions:

- stack while preserving dependency;
- change order while keeping DOM/focus order meaningful;
- collapse behind a disclosed control;
- become horizontally scrollable because two-dimensional context is essential;
- switch from simultaneous comparison to a staged flow.

Test widths between named targets as well as the targets themselves. Fixed viewport renders
show hierarchy and cropping; optional full-page renders show page continuity but cannot
replace viewport evidence.

## Cards and repeated modules

Cards are appropriate when each item is a portable unit with a meaningful boundary. They are
not a default composition. Repeated modules should expose the information users compare and
distinguish true priority without manufacturing a featured item. One containment signal may
be enough; borders, shadows, and tinted backgrounds used together can add noise, but dense or
low-contrast contexts may need more than one signal.

Ask whether section dependency would be clearer as a list, table, annotated narrative,
split view, or continuous document before choosing cards.

## Forms and task order

A single vertical flow often reduces ambiguous traversal, but compact, semantically coupled
fields can share a row when their relationship and responsive order stay clear. Labels,
instructions, errors, and controls must remain associated programmatically and visually.
Choose label placement from available width, translation length, scan burden, and error
recovery—not from a universal completion-time claim.

Build only reachable states. Empty, loading, error, success, disabled, and offline layouts
must preserve the primary task, explain what changed, and provide an applicable next action.
Do not invent states to make a checklist appear complete.

## Media and memorable moments

Assign media a job: establish domain, carry evidence, explain structure, demonstrate state,
or create a concept-bearing moment. Decorative media should not claim hierarchy needed by
the task. Distinctiveness can aid recall, but "exactly one memorable element" is not a law;
the number and intensity depend on page length, narrative beats, and competing tasks.

## Composition recipes are hypotheses

The files under `core/composition/` are candidate mechanisms, not templates or defaults.
Their breakpoint values and token slots are demonstration values. A composer may cite a
recipe only after its condition gate matches the experience spine and must rewrite its
structure, values, and responsive transitions for the actual content. Candidate sketches
should compare meaningful axes rather than merely choosing different recipes.

## Decision record

For every consequential layout choice record:

1. condition and user task;
2. predicted attention/dependency effect;
3. chosen mechanism and rejected alternative;
4. desktop and mobile recomposition;
5. fixed-viewport evidence and resulting correction.

## Authoritative sources

- [NN/g — F-Shaped Pattern of Reading on the Web](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/)
  — conditional behavior for scanning text-heavy content, not a universal page template.
- [W3C — Understanding Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
  — responsive outcome and exceptions for genuinely two-dimensional content.
- [W3C — Understanding Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html)
  — meaningful sequential navigation.
- [W3C Technique C27](https://www.w3.org/WAI/WCAG22/Techniques/css/C27)
  — matching DOM order to visual order.
- [Carbon Design System — 2x Grid](https://carbondesignsystem.com/guidelines/2x-grid/)
  — one documented grid system and its parts.
- [Apple Human Interface Guidelines — Layout](https://developer.apple.com/design/human-interface-guidelines/layout)
  — platform-aware layout and adaptation guidance.
