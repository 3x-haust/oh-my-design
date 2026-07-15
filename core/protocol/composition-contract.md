# Composition contract protocol

`.omd/composition.md` is the durable bridge between research and isolated structural
sketches. `omd-composer` owns it. The artifact records composition decisions; it does not
copy a reference page or prescribe one visual answer.

The composer receives a sanitized frame/concept, clean copy deck, sanitized approved type
contract, and the scout's distilled transferable principles/invariants with source trust.
It does not receive or reproduce screenshots, assets, pixels, literal tokens, copied text,
full-page descriptions, or a source page's complete sequence. Read `theory/layout.md` and
`theory/ux.md` exactly before writing.

Use these H2 sections exactly and keep each non-empty. When the project has user-provided
references (`omd ref add --from-user`), the additional `## Reference synthesis` section is
required as well; `omd composition --check` enforces it.

Before writing any section, read the frame's `uxSurface` classification. It selects the
grammar (see `theory/ux.md` §Surface types): a `marketing` surface composes as a message
ladder; a `product` work surface composes as a task loop over screen regions; `editorial`
composes as a reading sequence; `mixed` names which screens follow which grammar. The
section names below stay the same across grammars — what changes is what a "section" is:
on a product surface it is a screen region or reachable state with a job in the task
loop, not a scroll chapter.

## Input fingerprint

Record exactly one line for each input:

```text
- Frame SHA-256: <64 lowercase hex>
- Copy deck SHA-256: <64 lowercase hex>
- Type proof SHA-256: <64 lowercase hex>
- Scout SHA-256: <64 lowercase hex>
```

Hashes cover `.omd/frame.md`, `.omd/copy-deck.md`, `.omd/type-proof.md`, and
`.omd/scout.md`. When `.omd/scout.md` does not exist, the scout line is instead
`- Scout SHA-256: N/A — <specific reason>`. Never invent a scout hash. Any frame, copy,
type-proof, or scout-summary change invalidates the contract; rerun composer and the check.

## Experience spine

For a `marketing` or `editorial` surface: for every section, record the entering user
question, exactly what new answer/evidence this section adds, its primary action, and why
the next section depends on it. This is a message ladder, not a list of fashionable
section names.

For a `product` surface: write the spine as the task loop — orient → locate → act →
feedback → next/recover. For every screen region (shell/navigation, work object, supporting
panels, state surfaces), record which loop step it serves, the frequent action it carries,
and why the region's position follows task order. Include the reachable states (loading,
empty first-run, filtered-to-zero, error/recovery, success) as spine entries with their
copy source; a work surface without designed states has an incomplete spine. Do not write
a persuasion ladder for a tool: a hero section above a queue is a grammar defect, not a
style choice.

## Section dependency

Run the reorder/removal test. If adjacent sections can swap or disappear without weakening
meaning, revise their dependency or record the evidence-backed reason independence is useful.

## Grid and alignment

Define the shared alignment/grid skeleton and the limited, intentional breaks that express
meaning. Do not choose a break because a reference used it.

## Density and visual mass

Describe how density, visual mass, and negative space progress across the whole experience.
Relate every change to attention, evidence, action, or recovery.

## Focal hierarchy

Define one dominant anchor in the first viewport and its visual-mass budget relative to the
value statement, proof, and visible primary CTA. On a `product` surface the dominant anchor
is the work object itself — the table, queue, canvas, form, or data view the task loop
operates on, at representative data density — and the "value statement" is at most one line
of orientation; a display-scale headline or decorative hero claiming the first viewport of
a work surface is a rejection condition, not an anchor. The CTA plus a predictable completion path
satisfies task reach; the terminal form or control surface does not have to appear in the
first viewport and earns no credit merely for being visible there. State a visible rejection
condition for a candidate whose anchor loses dominance, crowds the task cue, or becomes
detached from the concept.

The anchor may be lawful product/evidence media, an explanatory graphic, real interaction or
data, or concept-bearing typography. A photo is never mandatory. Do not invent product facts,
assets, or evidence to manufacture an anchor.

## Domain form grammar

Derive recurring relational properties from the product's mechanism, material, or workflow.
Assign them to functional UI roles and state their limits. A metaphor that becomes decorative
shape instead of useful relationship fails this section.

## Media roles

For each section, assign media one job: evidence, explanation, orientation, or action. When
the domain mechanism, material, or workflow is central, assign a lawful carrier for it or
name an explicit alternate non-media mental-model carrier and its limitation. `none because
no approved photo` is insufficient: a photo is not required, and absent assets do not excuse
an absent mental model. Do not invent product facts/assets or weaken the clean-room transfer
boundary.

## Responsive recomposition

Use a desktop/mobile table. Preserve semantic DOM and focus order, the anchor's morphology
and relationship to value/proof/CTA, and an uninterrupted primary-task cue and completion
path while explaining how each relationship reframes. Do not write only `stack` or `hide`.
The full form need not occupy the first viewport. Account for reflow at 320 CSS px, while
production evidence still renders 1280x900 and 390x844.

## Candidate axes

Define at least two genuinely different structural axes that can satisfy the same spine,
copy, type, and acceptance criteria. Axes vary spatial relationships, not content truth.

## Transfer boundary

Permitted transfer: attributed relationships, measured invariants, and principles abstracted
from trusted evidence. Forbidden transfer: source identity in shipped UI, copy, assets,
literal tokens, full section order, pixels, recognizable silhouette, or unique interaction
and motion. An exact transplant is allowed only when the user explicitly requested that
specific transplant; record the request and attribution.

## Reference synthesis

Required exactly when user-origin references exist (`omd ref add --from-user`); omitted
otherwise. This is the explicit synthesis plan that separates structural synthesis from
mood imitation. For every user reference, record one row/entry:

- **Source**: the reference label (hostname or file name — the validator matches it).
- **Trait taken**: the concrete unit adopted — information architecture, navigation model,
  page layout, content density, typography, spacing rules, color system, component anatomy,
  search/filter interaction, form interaction, data display, feedback/state vocabulary,
  motion, mobile behavior, or an overall design principle. "그 느낌" is not a trait.
- **Where it lands**: the screen or component it applies to.
- **Adaptation**: how it is reshaped for this product's content, stack, and constraints.
- **Conflict resolution**: when two references disagree on the same unit, which wins where,
  and why — the shipped result must still read as one product and one design system.
- A reference the plan deliberately does not use is declined with a reason, not ignored.

The transfer boundary below still governs: traits are attributed relationships, measured
invariants, and principles — never pixels, copy, literal tokens, full section order, or a
recognizable silhouette, unless the user explicitly requested that transplant.

`omd composition --check` validates only section structure, fingerprint format, freshness,
and — when user references exist — the presence of a Reference synthesis section that
mentions every user reference.
It does not score taste, aesthetics, or whether a composition is good. Completion means the
artifact exists and the validator succeeds; a status report alone is not completion.
