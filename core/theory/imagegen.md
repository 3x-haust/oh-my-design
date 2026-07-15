# Imagegen — image-first art direction (decision material)

Adapted for OMD from the image-direction discipline in lazycodex's `frontend` skill
(`imagegen-frontend-web`, `image-to-code`; Apache-2.0, github.com/code-yeongyu/lazycodex). This is
an OMD-native synthesis bound to OMD's evidence, clean-room, and anti-fabrication rules — not a copy.

**A generated image is a design reference, never a shipped asset.** It plays the exact role a Figma
export or a hand mockup plays: a visual contract the build implements against. It obeys the clean-room
boundary (`protocol/human-design-loop.md`) — you transfer layout grammar, token relationships, and
composition decisions, not pixels. A generated mockup never ships as a page `<img>`. Shipped imagery
still obeys `asset-sourcing`: a factual carrier (team photo, product screenshot, real person, logo)
is NEVER AI-generated; only an abstract or atmospheric zone may ship generated imagery, and only with
committed provenance recorded via `omd decision`.

## The safety backstop makes reference-seeding safe

Seed the concept drafts from the real reference board — the scout's measured principles and the
component references it captured with `omd ref add … --selector … --blueprint --shot`, which pair
each component's screenshot with its skin-abstracted structural grammar on one record, plus the
committed palette/type/material. This is the composer's art-direction step, not a build step: feed
the paired screenshots and blueprints to the image tool as multi-source references, but the builder
never sees these reference screenshots — it implements from the generated draft. Combining
multiple references into a NEW synthesis is the whole point, and it is safe here
for one specific reason: `omd ref distance` still measures the SHIPPED build against every saved
reference and nothing at or above 0.6 kinship ships. The kinship gate is the anti-laundering backstop,
so imagegen may be seeded richly without risking a copy — the final build is gated regardless of how
the mockup was seeded. Never seed a draft from a single reference alone and never target a specific
reference's pixels; synthesize 2–3 references' grammar plus the project's own concept.

## When image-first applies

Image-first is for confident/showpiece register work where the visual composition is a first-class
deliverable — landing pages, marketing sites, portfolios, brand/editorial pages, redesigns where the
look is the point. For a quiet register (dashboard, docs, tool) it is usually unnecessary; the content
is the event and a mockup adds nothing. Skip it and record why.

When the host provides an image-generation capability and image-first applies, the order is
**mandatory**:

1. **Generate** 2–3 art-directed concept-draft mockups concurrently (they are independent — do not
   serialize them), each seeded with the committed concept's palette, type register, and material
   PLUS the scout's paired component references (screenshot + skin-abstracted blueprint from
   `omd ref add … --shot`) and measured principles as multi-source input. One horizontal image per
   section for a multi-section page — never one tall board
   with unreadable text. Do not crop an old image for a detail view; regenerate that section fresh,
   keeping the same palette/type/radius/treatment. Store drafts under `.omd/.cache/imagegen/` and
   record their paths + the pick with `omd decision`.
2. **Analyze** the chosen draft cleanly, not vibe-only: extract tokens, layout geometry, spacing
   rhythm, type-scale relationships, component anatomy, interaction affordances, and each section's job.
3. **Feed** the chosen draft into `.omd/composition.md` as the reference-fidelity direction, then build
   against it and run `omd ref distance` as usual. If the host has no image capability, fall back to
   the evidence-based composition path — the reference board, `theory/expressive.md`, and the CSS/SVG
   graphics recipes — and record the fallback.

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