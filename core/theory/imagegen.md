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
and local design decisions). The selected assembly is the authority: use the candidate bound by the
current hash-bound selection. Drafts live under `.omd/.cache/imagegen/` and are design references only.

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
   2–3 independent prompts from the hash-bound selected assembly, the selected references, any project
   rough, and the permitted project-owned inputs. It generates those drafts concurrently, chooses one,
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

Reasoning the layout in the abstract is exactly what produces the symmetric, boxed, template output
`expressive.md` § "Slop-free is not the same as distinctive" warns about. A generated draft forces a
concrete art direction to react to instead of a reasonable-sounding description.

## Break the AI defaults (aggressively)

Standard image generation and abstract layout-reasoning both collapse into the same tells. Name the
one a draft is drifting toward and reject it:

- centered dark hero with a purple/blue glow; floating meaningless blobs
- **left-text / right-image hero** — the single most overused AI pattern; allowed only when it is
  genuinely the strongest fit, never the default first instinct
- generic dashboard/card spam; cards inside cards inside cards; giant rounded containers everywhere
- weak typography hierarchy; boring default web-type energy
- "luxury" that is only beige serif text; "creative" that is actually messy and unreadable
- text-heavy layouts with too little imagery; over-packed sections with no breathing room
- tiny pills, tags, and fake interface jargon used as decoration

## The variation engine

Commit to ONE strong option per axis and execute it consistently — do not mash everything together,
and do not repeat one anchor down the whole page. Bias toward stronger visual concepts, but the brief
always overrides: "clean/minimal/swiss" lowers density and variance; "editorial/creative/bold/개쩔게"
raises them.

- **Theme**: pristine light · deep dark · bold studio solid · quiet premium neutral
- **Hero scale (per page, decisive — do not split the difference)**: giant statement · mid editorial ·
  mini minimalist (mini is confident restraint, not weakness)
- **Hero architecture**: cinematic centered · asymmetric split · editorial offset · image-first with
  restrained text · inline typographic behemoth
- **Section system**: modular bento rhythm · alternating editorial blocks · poster-stacked storytelling ·
  gallery-led cadence · swiss grid · asymmetric marketing flow
- **Composition anchor (per section)**: centered statement · top-left lead / bottom-right support ·
  bottom-left over image · off-grid editorial offset · stacked-center minimalist · image-as-canvas with
  text in a safe area. Across a page at least 3 different anchors must appear; never repeat one anchor
  more than twice in a row; vary the hero so the page does not open on the AI default.
- **Background mode (per section)**: solid + inline asset · textured/paper/grid · full-bleed image with
  tonal overlay · editorial side-image · duotone-treated image · cinematic tonal gradient (low-chroma,
  palette-matched) · color-blocked diptych · micro-noise over solid. Be confident with backgrounds —
  for a non-minimalist brief, at least one full-bleed/duotone/atmospheric background should appear;
  never all-inline-asset unless the brief asks for restraint.
- **Narrative spine (per page)**: artifact/specimen · journey/waypoints · precision instrument · living
  system · stage/spotlight · archive/dossier. Thread it through visuals and short copy.

Register still governs restraint: one signature moment, not a catalogue. The engine varies the
composition; it never stacks five techniques into chaos.

## The bar

Not clean-and-correct — work a senior designer at Linear, Stripe, or Supabase would ship. Correct-but-flat
is a failure, not a finish.
