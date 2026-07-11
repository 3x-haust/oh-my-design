# Expressive — decision material

An award-winning site is not one that does more. It is one where every choice points at the same thing. Awwwards puts the scoring on record: Design 40%, Usability 30%, Creativity 20%, Content 10% (awwwards.com/about-evaluation). The arithmetic is the argument. Creativity — the axis where spectacular effects live — accounts for one-fifth of the score. Usability accounts for thirty percent. A site that trades navigability for spectacle is betting against the judges' own rubric. The sites that win do so on Design and Usability combined, which means art direction that holds up under use, not technique that demands admiration.

This file is decision material for the register axis. It is not a catalogue of cool things to do. It is a condition→choice→reason map for when expressive technique earns its place and when it does not.

---

## The register decision

Every brief implies a register. The register is not the visual style — it is the intensity of the directed experience. Three positions on the axis:

**quiet**: The interface recedes. The user's work or content is the event. Dashboards, documentation, tools, reading-first products. Motion is near-zero. Typography is functional. Restraint is not timidity; it is the correct reading of what the user came to do.

**confident**: A position is visible but the interface does not perform. Brand sites, editorial products, most portfolio work. One thing is done well — a considered type scale, a deliberate palette — and nothing else competes. This is where most good work lives.

**showpiece**: The interface is the event. Brand campaign microsites, agency portfolios, product launches with a single CTA, experiential landing pages. The user came partly to experience being here. Awwwards SOTD, FWA, GDWEB — these are showpiece contexts. The register commits to one signature moment and builds everything toward it.

The error is applying showpiece technique to quiet or confident contexts. A dashboard with split-text entrances is not ambitious; it is misread. The thirty-percent Usability weight does not become a thirty-percent weight only when the judges disagree with your taste — it applies regardless of intent. Usability 30% is the reason showpiece technique must still serve navigation and clarity, not just aesthetic ambition.

---

## The anatomy of award-level sites

### The hero does the work typography would normally defer to images

On a showpiece site, the hero is often typographic rather than photographic. Display type at 90–200px (or equivalent viewport-relative value) acts as the hero image: it fills the viewport, it sets the tone, it contains the entire conceptual gesture in one glance. The technique works when the type decision is made on purpose — a face chosen for its editorial weight, a size chosen to fill not to approximate.

The size must be responsive. `clamp()` with viewport-relative values is the only correct implementation: `font-size: clamp(3rem, 12vw, 10rem)` scales continuously between breakpoints without the abruptness of a media query step. A hardcoded `96px` that collapses to `48px` at a breakpoint is not a display type decision — it is a pixel value with a fallback.

### Scroll is the narrative axis

On a showpiece site, sections are not containers — they are scenes. The order of scroll is the order of a story: exposition, complication, turn, resolution. If the sections could be reordered without loss, there is no scroll narrative, only content in a column.

The structural implication: the first scene commits to the register, the middle scenes develop it, and the footer scene closes it. A footer that reverts to default template styling breaks the narrative as certainly as a film that ends with stock footage.

CSS scroll-driven animations (the `animation-timeline: scroll()` and `view()` properties, now available in Chromium and WebKit as of 2024) enable scroll-linked motion without JavaScript. The correct fallback for unsupported browsers is the static layout — which must be designed to stand without the motion. An experience that is illegible when still is not a scroll narrative; it is content that depends on JavaScript to exist.

### The first three seconds declare the register

A loader or entrance animation on a showpiece site is not a technical necessity — it is the opening sentence. It tells the user: this is what kind of experience you are in. A loader that runs longer than the asset load time is a loader that is costing more than it earns. The outer bound is three seconds; under one second is the performance target. Beyond that, a fast site is made to feel slow, and the Usability score suffers before the user has seen a single thing.

What the entrance must do in those seconds: commit the palette, declare the type register, establish the motion vocabulary. A loader that is only a spinner followed by a page reveal has wasted the three seconds it consumed.

### The concept must survive to the footer

A showpiece site that loses its nerve in the footer — reverting to small-print-grey, default columns, four generic links — reveals that the expressive register was applied to the hero and nowhere else. Applied design covers the whole surface. The footer is a scene. It may be quieter than the hero, but it is not absent.

---

## Technique catalogue

Each entry names the condition under which the technique earns its place and the condition under which it does not.

### Split-text entrance (character- or word-level stagger)

**Condition for use**: The hero type is the primary visual event and the words are part of the concept — something is being said, not just displayed. The split reveals meaning progressively: each word or line lands with intent.

**Condition against**: Body copy, UI labels, secondary headings, any text the user will need to skim. Split-text on body copy turns reading into waiting. It is the most common technique deployed too broadly. GSAP SplitText and SplitType both require JavaScript; the fallback state (no JS, or reduced-motion) must show the complete text, not an empty space.

**Implementation constraint**: Stagger between siblings at 40–80ms. Beyond 80ms the entrance becomes a waterfall the user watches rather than reads.

### CSS scroll-driven animations / IntersectionObserver reveals

**Condition for use**: The content is a scroll narrative — sections have a sequential logic, and the reveal of each section reinforces the sequence. The animation is `transform` and `opacity` only; nothing that touches layout.

**Condition against**: Product UI that the user came to operate. Navigation elements. Any element the user needs to see immediately on scroll — a reveal that delays reading is a usability failure regardless of how well-timed it is.

**Implementation**: CSS scroll-driven animations (`animation-timeline: scroll()` / `view()`) are the first choice — they run off the main thread and require no JavaScript. IntersectionObserver is the fallback for broader browser support. The static layout must be complete and functional without the motion layer.

### Viewport-filling marquee

**Condition for use**: The marquee carries a message that is part of the concept — a repeated claim, a rhythmic brand phrase, a counter. The motion is continuous and low-velocity; it does not compete with adjacent interactive elements.

**Condition against**: Navigation areas, any context where the user is reading or interacting with nearby content. A marquee adjacent to a form field splits attention between peripheral motion and the focal task — vestibular disruption for users with motion sensitivity, even when `prefers-reduced-motion` is honoured. In reduced-motion contexts, the marquee must stop.

### Custom cursor (desktop, pointer media query)

**Condition for use**: The cursor reinforces the concept in a way no other element can — it follows the user's intent, so it is always in the interaction zone. Effective on portfolio and agency sites where the cursor is part of the brand vocabulary (Awwwards, awwwards.com/customize-your-mouse-cursor).

**Condition against**: Touch devices (the cursor does not exist). Any context where the interactive affordance of links and buttons needs to be clear without hover cues — custom cursors routinely break the expected `cursor: pointer` signal. Must be scoped with `@media (pointer: fine)` so it never activates on touch. On mobile it is invisible; its absence must not degrade the layout.

### Image hover distortion / filter

**Condition for use**: A gallery or portfolio grid where the hover state deepens engagement with a piece before the user clicks. The distortion (WebGL ripple, CSS filter shift, GSAP hover tween) must complete in under 150ms for hover onset and under 200ms to settle. Anything slower reads as broken.

**Condition against**: Product images where accuracy matters (e-commerce, documentation). Navigation thumbnails where the user is trying to read text.

### Grain / noise texture

**Condition for use**: Flat backgrounds or smooth gradients that read as too digital — noise adds the tactile quality that solid fills lack. The CSS-Tricks SVG filter technique (an `feTurbulence` filter composited at low opacity over a background) adds texture without weight. Particularly effective over mesh gradients, where it reduces banding.

**Condition against**: Over photography or video (redundant). On text (degrades legibility at small sizes). At high opacity on any element (reads as low-resolution encoding, not design).

### Asymmetric / diagonal grid

**Condition for use**: The concept requires tension — an editorial feeling where elements do not settle into comfortable columns. One diagonal or off-grid element is a decision; a page full of diagonal elements is entropy.

**Condition against**: Data-heavy layouts where scanability is the primary requirement. Tables, forms, anything the user reads in order.

### Section colour inversion (dark ↔ light transition)

**Condition for use**: The scroll narrative has a turn — a moment where the register shifts to mark a conceptual pivot. The inversion makes the change visible and felt, not just read. One inversion per page is usually correct; more than one is a rhythm, not a pivot.

**Condition against**: Arbitrary decoration. The inversion must correspond to a narrative event, not to a desire for visual variety. When the colour switches back without a corresponding conceptual return, the technique has been used as decoration and should be removed.

### Sticky stage / scene sequencing

**Condition for use**: A multi-scene showpiece where each scene requires the user's full attention before advancing — a product demo, a feature walk-through with animated states, a narrative with distinct chapters. The stage (`position: sticky`) pins the viewport while scroll advances the timeline inside the scene.

**Condition against**: Sites where the user is goal-oriented and is scrolling to find something specific. Sticky stages are navigation debt — the user cannot scroll past to scan; they must watch the scene play. If they have seen it before, it is friction. If there is any chance of return visits, the stage needs an explicit skip or fast-forward affordance.

### Editorial number / index labels (01, 02, 03)

**Condition for use**: The content has a genuine sequence — steps, chapters, items in an ordered argument. The large number (set at display scale, often 10–15% opacity as a background element) reinforces the ordered reading without becoming the dominant visual.

**Condition against**: Fake sequences — content that is enumerated to look like it has order but does not. Numerical labels that carry no sequential meaning are decoration, and decoration at display scale is noise.

### Blend-mode typography

**Condition for use**: Text that must maintain legibility and contrast across a moving or textured background — `mix-blend-mode: difference` inverts the pixel values at each point of contact, guaranteeing contrast regardless of what is behind the type. Effective on full-bleed images or video backgrounds where fixed colour choices will fail in some regions.

**Condition against**: Static backgrounds where the contrast can be calculated and set directly — `difference` on a static background produces a predictable result that could be a fixed colour choice, but with more browser overhead. Not appropriate for body copy (the visual complexity of difference blending at small sizes degrades legibility).

---

## The restraint clause

The techniques above are a catalogue, not a checklist. A showpiece site uses two or three of them, chosen because the concept requires them, and executes each one with precision. A site that uses eight of them is an effects catalogue, not a design. It is what the Awwwards guide calls "randomness without microinteractions" — stimulation without meaning.

The selection discipline: before adding any technique, ask whether the concept — the governing metaphor — would do this. A concept framed as "a deep-sea research vessel" would animate precisely, with technical legibility, and would never distort images playfully. The same concept would not use a pastel grain texture. If the technique does not follow from the concept, it is decoration.

**Performance is not a category below craft** — it is part of Usability, which is 30% of the score. Animating only `transform` and `opacity`, honouring `prefers-reduced-motion`, and staying within 60fps on mid-range hardware are not concessions to accessibility; they are the conditions under which the expressive register earns its score. An animation that causes layout jank has failed the Usability criterion. A motion that does not honour `prefers-reduced-motion: reduce` has failed both Usability and Accessibility.

---

## The Korean market: GDWEB and Hangul display constraints

GDWEB (gdweb.co.kr), operating since 2005, is the leading Korean web design award. Winning categories skew toward agency brand sites and campaign microsites — seasonal brand launches, product campaign pages, experiential brand activations — rather than application UI. The showpiece register is the expected register on GDWEB, not the exceptional one. This means the baseline for expressive work in the Korean market is higher; mid-level expressive execution that would earn attention internationally passes unnoticed against the GDWEB field.

Hangul display typography carries a specific constraint that Latin display type does not: the syllable block structure of Korean text means that each character cell already contains between one and four strokes in a fixed-width space (W3C Korean Layout Requirements, klreq). At display scale — 90px and above — Latin typefaces tolerate aggressive negative letter-spacing because the open apertures between letters benefit from compression. Korean syllable blocks have no equivalent aperture: compressing letter-spacing below −0.05em at display size causes strokes within adjacent syllables to collide visually, creating a density that reads as a typesetting error rather than a design decision. The practical limit for display Hangul is letter-spacing in the range of −0.03em to 0em; for Latin, −0.05em to −0.08em at equivalent scale is standard. This constraint is not a limitation of Korean type design — it is a consequence of the structural density that makes Hangul read efficiently at small sizes. At display scale, the density that aids legibility in body text resists compression.

---

## Graphics recipes

The background and image treatment techniques referenced in this file — grain texture,
gradient mesh, geometric patterns, CSS illustration primitives, duotone image presets —
are implemented as working CSS recipes in `core/graphics/`. The placeholder policy
(grey box is a defect; typographic block, pattern fill, or generated gradient instead)
is documented in `core/graphics/placeholder-policy.md`.

## Sources

- Awwwards, Evaluation System (awwwards.com/about-evaluation) — Design 40% / Usability 30% / Creativity 20% / Content 10%, confirmed from the official criteria page
- Awwwards Academy, "Art Direction Secrets to Create Unique Web Experiences" (awwwards.com/academy) — concept as the primary variable in SOTD awards; effects as amplifiers of concept, not substitutes
- Streza, "A Guide on Building Awwwards Worthy Websites" (medium.com, via awwwards.com search results) — one signature moment per page; microinteractions and randomness as distinguishing factors
- MDN Web Docs, CSS scroll-driven animations (developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations) — `animation-timeline: scroll()` / `view()` specification and browser support
- WebKit, "A Guide to Scroll-Driven Animations with Just CSS" (webkit.org/blog/17101) — Safari support for scroll-driven animation spec
- Codrops, "Custom Cursor Effects" (tympanus.net/codrops/2019/01/31/custom-cursor-effects/) — pointer media query scoping; hover zone behaviour
- Lea Verou / CSS-Tricks, "Grainy Gradients" (css-tricks.com/grainy-gradients/) — SVG feTurbulence filter technique for noise texture; banding reduction on smooth backgrounds
- W3C, Requirements for Hangul Text Layout and Typography (w3.org/TR/klreq/) — syllable block structure; spacing constraints and the fixed-width character cell at display scale
- Awwwards, "Customize your mouse cursor" (awwwards.com/customize-your-mouse-cursor) — cursor as brand vocabulary on award-winning sites; pointer-fine scoping requirement
- GDWEB Design Awards, About (gdweb.co.kr/sub/about.asp) — Korean award context, judge composition, selection categories dominated by agency and campaign microsites
- Motion theory cross-reference: see `core/theory/motion.md` — duration windows, reduced-motion requirement, transform/opacity constraint, and the attention budget argument all apply in the showpiece register without exception
- Motion cookbook: working implementations of every technique catalogued above (split-text, scroll-reveal, sticky scene, section inversion, marquee, magnetic hover, and more) are in `core/motion/recipes/`; easing token vocabulary is in `core/motion/easing.md`
