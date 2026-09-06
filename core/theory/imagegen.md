# Imagegen — image-first art direction (decision material)

Adapted for OMD from the image-direction discipline in lazycodex's `frontend` skill
(`imagegen-frontend-web`, `image-to-code`; Apache-2.0, github.com/code-yeongyu/lazycodex). This is
an OMD-native synthesis bound to OMD's evidence and anti-fabrication rules — not a copy.

**A generated image is a design reference, never a shipped asset.** It plays the exact role a Figma
export or a hand mockup plays: a visual contract the build implements against. You transfer its layout
grammar, token relationships, and
composition decisions, not pixels. A generated mockup never ships as a page `<img>`. Shipped imagery
still obeys `asset-sourcing`: a factual carrier (team photo, product screenshot, real person, logo)
is NEVER AI-generated; only an abstract or atmospheric zone may ship generated imagery, and only with
committed provenance recorded via `omd decision`.

## Draft seeding and the shipped surface

The raw reference board is scout-only evidence. An image-first draft may be seeded from the selected
`reference-assembly-v1`, the selected references, a project rough built on the committed design system,
and project-owned concept material (the brief, real product content, committed palette/type/material,
and local design decisions). Use only the candidate bound by the current hash-bound selection. The
assembly supplies measured evidence; it does not choose the concept or outrank explicit first-party
direction. Drafts live under `.omd/.cache/imagegen/` and are design references only.

Do not confuse an external reference with a **current-user-selected, project-owned concept target**.
External competitive and gallery material keeps the scout-only, sanitized handoff above. When the
current user explicitly says that their own concept image is the target to carry forward, that image is
first-party design direction: concept-making and production owners may receive the exact target, and
the reference assembly cannot neutralize or outvote it. Merely attaching an image does not make it a target; the user's explicit
selection does. Before typography or structure freezes, record the target's few load-bearing visible
invariants in the existing decision/composition record: dominant mass and spatial topology, relative
type scale, colour/material roles, reading path, signature relationship, and responsive transformation
only where each is actually present. Record what visible loss would falsify each invariant. Blind
selectors and reviewers receive those bound invariants and falsifiers, not target pixels or authorship. This is not a new
artifact, a style checklist, or permission to copy external source material.

Images supplied only to communicate ambition calibrate experimentation, surprise, and finish; they are
not a style recipe. Keep content-grounded spatial, media, interaction, typographic, or metaphorical
ideas available until visible experiments show what serves the brief. These are possibilities, not a
taxonomy or technique quota, and a new concept may depart from every example.

`omd ref distance` measures the SHIPPED build against every saved reference as an advisory fidelity
signal — it reports closeness and never blocks shipping. The shipped surface obeys the committed design
system, not the raw draft, and a factual carrier is never AI-generated.

## When image-first applies

Image-first is for confident/showpiece register work where the visual composition is a first-class
deliverable — landing pages, marketing sites, portfolios, brand/editorial pages, redesigns where the
look is the point. For a quiet register (dashboard, docs, tool) it is usually unnecessary; the content
is the event and a mockup adds nothing. Skip it and record why.

When the host provides an image-generation capability and image-first applies, the order is
**mandatory**:

1. **Generate** — before composer starts, the coordinator/host derives the generation directions and
   independent prompts from the hash-bound selected assembly, the selected references, any project
   rough, and the permitted project-owned inputs. Before generation, record the candidate count and
   its evidence-based reason in the existing decision record. Unresolved competing concepts need
   comparison; one candidate is appropriate only when the brief or current evidence already settles
   the direction. Do not lower the count after seeing results to excuse a cheap implementation.
   Keep genuinely different conceptual hypotheses alive through the smallest useful visible experiments;
   prose labels, scores, and metadata cannot select a winner before the ideas are rendered. It generates
   the selected independent drafts concurrently and chooses one from visible evidence only when it
   clears the applicable task, concept, craft, and ambition floors,
   and stores them under `.omd/.cache/imagegen/`. The composer never contributes an upstream prompt or
   art-direction decision. One horizontal image per section for a multi-section page — never one tall
   board with unreadable text. Do not crop an old image for a detail view; regenerate that section
   fresh, keeping the same palette/type/radius/treatment.
   A project-owned rough — a quick pass built on the committed design system — is a permitted seed:
   feed it plus the committed palette/type/material so the draft fleshes out ("구체화") that rough. The
   build then redesigns the draft back onto the design system's tokens, spacing, and component rules;
   the draft is a reference, never shipped, and the shipped surface obeys the system, not the raw draft.
2. **Analyze** — after the coordinator has chosen the draft, composer analyzes and translates it into
   the composition contract: extract tokens, layout geometry, spacing rhythm, type-scale relationships,
   component anatomy, interaction affordances, and each section's job.
3. **Feed** the chosen draft into `.omd/composition.md` as the reference-fidelity direction, then build
   against it and run `omd ref distance` as an advisory signal. If the host has no image capability,
   composer follows the evidence-based CSS/SVG composition path using the selected sanitized assembly,
   `theory/expressive.md`, and the graphics recipes.

Not shipping a generated image is not a reason to skip image-first thinking. The draft is decision
material by definition. Select or skip the method for the actual visual uncertainty, current supplied
direction, and host capability; keep that decision separate from whether any generated asset ships.

## Choose a concept that survives implementation

Before rendering an unselected concept study, the coordinator binds the actual content units, their
proposed spatial relationship, and the predicted observable consequence in the existing decision record
and generation prompt. The consequence is a visible spatial/content relationship or an observed
interaction state, not an inferred comprehension or conversion gain. For a whole-page request, carry
that relationship through the beginning, middle, and end, including the relevant transition between
them. Keep one horizontal image per section: a landscape-format study render of each section, not an
image embedded in the designed section.
After rendering, hide concept names and rationales and check whether the predicted relationship and
consequence are actually visible. If they are missing, the output does not validly test that hypothesis;
it is not evidence that the concept is infeasible. This checks the experiment's execution, not its beauty.

For each alternative, identify what in the real content generates its form, its dominant visual
relationship, reading path, primary action, and mobile transformation. Multiple alternatives must
change the content-to-form relationship and macro composition; different colours or fonts alone
do not constitute different concepts. Alternatives may retain the same supplied brand colours.
One governing anchor can organize an entire page. Repetition can carry meaning and rhythm; do not
add extra anchors, backgrounds, or sections to meet a variety quota.

Before dismissing a visually strong direction as impractical, test its riskiest anchor and primary
action with real text, actual fonts, and a small renderable study at the required viewports. Record
the observed constraint. A clipping study tests lawful wrapping, container geometry, and responsive
recomposition before shrinking concept-bearing type; one implementation's failure does not silently
become the concept's type scale. Among feasible alternatives, choose for rendered concept, task fit, and
craft. Cost disqualifies only against an explicit budget or breaks a tie between equivalent options;
the easiest structure is not automatically the best design. A familiar layout family is eligible
when its rendered relationships fit the content exceptionally well.

When a current-user concept target exists, alternatives explore implementation of that target rather
than replacing its governing relationships with a safer unrelated composition. Reject every draft
that loses a target invariant. A no-winner decision names the concrete visible deficiency against the
target or brief; “familiar” alone is not a failure. Never promote the closest adequate draft. Task
correctness, accessibility, and factual fidelity remain conjunctive requirements, but they do not
convert a target-breaking or visibly under-ambitious render into an accepted one.

When examples carry ambition rather than a target, judge the visible experiments against that ambition
and the actual brief, not against the examples' common traits. A familiar layout remains eligible when
its rendered relationships meet the bar. An entire user-supplied concept study cannot be placed in
`literalPropsToReject`; that field excludes literal props, not ambition evidence.

The selected draft's few load-bearing relationships belong in the existing composition sections:
mass and negative space in `Density and visual mass`, type/content relationships in `Domain form
grammar`, action priority in `Focal hierarchy`, and mobile changes in `Responsive recomposition`.
State what must survive and what visible change would count as loss. These are production decisions,
not new UI copy or a second composition artifact. Compare those relationships in the actual render
before adding more sections or polish; fidelity checks remain distinct from independent beauty review.
Once bound, an invariant remains in force until its owning design stage revises the contract from
visible evidence or the current user changes direction. Hand cannot relax it during implementation.

Reasoning the layout in the abstract is exactly what produces the symmetric, boxed, template output
`expressive.md` § "Slop-free is not the same as distinctive" warns about. A generated draft forces a
concrete art direction to react to instead of a reasonable-sounding description.

## Anti-literal generation contract

Before selection, each non-authoritative visual study consumes its own art-direction alternative's
exact non-empty `metaphorQualities` and `literalPropsToReject`. It does not publish composition,
Sketch-candidate selection, or production approval. After selection, every refinement and downstream
consumer uses the selected decision's exact fields. In both phases, preserve the qualities through
hierarchy, rhythm, typography, imagery, and motion cues. Supply rejected props only as private visual
exclusions: drafts must not depict, spell, iconize, pattern, silhouette, or substitute a close visual
synonym for them. Neither field is image text, UI copy, a caption, or a negative sentence to render.
Reject a study that literalizes its metaphor even when its palette and polish otherwise fit. This phase
split does not relax the art-direction schema, final selection validation, privacy, or exclusions.

## Break the AI defaults (aggressively)

Treat these as diagnostic risks, not layout-family bans. Name the visible weakness and its effect on
this content before rejecting a draft:

- centered dark hero with a purple/blue glow; floating meaningless blobs
- **left-text / right-image hero** used without a content relationship between the two halves;
  a split composition with a strong relationship remains eligible
- generic dashboard/card spam; cards inside cards inside cards; giant rounded containers everywhere
- weak typography hierarchy; boring default web-type energy
- "luxury" that is only beige serif text; "creative" that is actually messy and unreadable
- text-heavy layouts with too little imagery; over-packed sections with no breathing room
- tiny pills, tags, and fake interface jargon used as decoration

## Find the visual idea before the technique

Begin with the subject rather than a menu of page patterns. Investigate what actually changes,
repeats, collides, accumulates, reveals itself, or asks for reader participation in this material.
Follow whichever observation is generative; these are prompts for inquiry, not required categories.

Express a hypothesis as a causal chain: the real operation, material, relationship, or action that
generates a visual or interaction rule, and the experience consequence that rule creates. It is a new
concept only when that chain produces a meaningfully different visible structure or behavior. Theme,
hero, section, background, and effect choices follow the idea instead of supplying it. A familiar
solution remains lawful when the rendered relationship fits exceptionally well. Register governs
restraint, and one coherent rule is stronger than a catalogue of techniques.

## The bar

Not clean-and-correct — work a senior designer at Linear, Stripe, or Supabase would ship. Correct-but-flat
is a failure, not a finish.
