# Image and illustration art direction

Art direction defines what the audience sees, why it belongs to this product, and how a set stays coherent. Asset sourcing, rights, accessibility, and factual accuracy remain separate hard requirements.

## Begin with the communication job

For each image zone, write:

- surface and viewport
- message or product fact the image must carry
- subject and action
- audience and cultural context
- required factual details
- intended crop and focal point
- relation to adjacent copy and action
- source status: first-party, commissioned, licensed, generated atmospheric asset, or not yet acquired
- alt-text intent and whether a visible caption or credit is required

If no image-specific job exists, remove the zone. Decorative gradient blobs, grain, mesh, and abstract CSS shapes are not fallback art direction. They may serve a named brand role after direction exists, but they can't answer what the image should say.

Design-time placeholders never ship. Missing final art causes one of three outcomes: acquire the approved asset, recompose the surface around available real material, or remove the image zone. A labelled mock image, grey box, stock stand-in, generated fake product screenshot, and generic gradient placeholder are unfinished work.

## Shot list

A shot list is an executable asset plan. One row per needed asset:

| Field | Example |
| --- | --- |
| ID and surface | `PDP-01, product detail hero` |
| Subject | `590 mL tumbler, salt white` |
| Action or state | `lid open beside filled cup, condensation visible` |
| Setting | `neutral studio surface, no lifestyle props` |
| Framing | `three-quarter view, eye level` |
| Crop family | `4:5 master, safe for 1:1 and 16:9` |
| Focal point | `lid seal and rim` |
| Lighting | `large soft source camera-left, controlled highlight` |
| Color treatment | `accurate product color, neutral white balance` |
| Required variants | `front, detail, scale-in-hand, packaging` |
| Exclusions | `no steam, no invented accessories, no beige backdrop` |
| Rights and credit | `first-party studio shoot, product team owner` |
| Delivery | `AVIF/WebP plus source TIFF, 2400 px long edge` |

Include wide, medium, detail, context, and process shots only when each has a role. Don't create a quota-driven gallery.

## Subject direction

Name the subject with observable specificity. `A caring person` isn't direction. `A Korean case worker seated beside an older applicant, both viewing the same document, hands visible, no staged handshake` is.

- Show the product, service, place, or person that carries the claim.
- Preserve factual identity. Real staff, customers, products, interfaces, and documents come from first-party material, never synthetic replacement.
- Direct action and relationship, not mood adjectives alone.
- Remove props that imply unsupported features, wealth, profession, or location.
- For interfaces, use a real approved capture with private data removed. Don't create a plausible fake dashboard.

## Crop and aspect system

Choose a small crop family before acquisition. Example:

- `16:9` for wide narrative or product context
- `4:5` for portrait cards and mobile prominence
- `1:1` for compact lists only when a square crop preserves the subject
- `3:2` for documentary sets

Define a focal safe area in the master, usually the central 60 to 70 percent only when the subject permits it. Record exceptions instead of forcing every subject into one center crop. Art-direct responsive crops with `<picture>` or focal-position metadata. Don't rely on `object-fit: cover` to make accidental amputations acceptable.

Test each crop with real overlaid text. If text and image compete, move the text outside the image, use a controlled solid scrim, or acquire a composition with intentional negative space. Don't blur or darken a weak image until it becomes anonymous.

## Lighting

Lighting is part of the system:

- **Documentary:** available or naturalistic light, preserved environment, moderate contrast.
- **Studio product:** controlled source, accurate surface and color, repeatable shadow direction.
- **Portrait:** consistent key direction, skin tone accuracy, catchlight, background separation without artificial halos.
- **Technical detail:** raking or diffuse light selected to reveal material, edge, or texture.

Record direction, softness, contrast, white balance, and shadow behavior. A set with warm backlight, flat office fluorescence, and hard flash needs an intentional sequence or correction plan. Don't call inconsistency authenticity.

## Color treatment

Start from subject truth and brand identity.

- Product, medical, food, material, and evidence imagery keeps accurate color.
- A documentary set may share exposure, contrast, black point, and saturation without forcing one hue over every scene.
- Duotone is acceptable only when color carries no factual meaning and the treatment has a named brand role.
- Skin tones must remain credible across the represented range.
- Avoid sepia, cream, or warm paper grading as a generic signal of care, heritage, or premium quality.
- Verify text contrast over every responsive crop, not one average sample.

Write a reproducible treatment recipe, such as `neutral white balance, restrained saturation, lifted shadow detail, no hue rotation`, and inspect all assets together.

## Sequencing

An image sequence has a beginning, development, and outcome tied to the content.

- Establish context before detail when place matters.
- Pair process with result when the claim concerns how something is made.
- Alternate scale only when it helps orientation: wide, medium, detail.
- Keep chronological steps in chronological order.
- Don't repeat near-identical smiling portraits to fill sections.
- Maintain direction of gaze and movement across adjacent frames when that affects reading flow.
- The final image should close or hand off the task, not become generic footer decoration.

Contact sheets are the selection surface. Judge the set, not isolated favorites.

## Captions, alt text, and credits

Captions add facts the image cannot carry by itself. Alt text communicates the image's purpose in context. Credits satisfy license and editorial accountability.

- Caption names who, what, where, or when only when relevant and verified.
- Alt text doesn't repeat an adjacent caption word for word. It states the useful visual information.
- Decorative imagery gets empty alt text. Functional imagery names the action or destination.
- CC-BY and CC-BY-SA assets receive the required visible attribution. All licensed assets retain source, author, license, source page, and local path in provenance.
- Don't place credits in unreadable 9 px text over a busy image.

## Cultural representation

Representation is casting, context, behavior, styling, location, and editorial power, not a demographic checklist.

- Match people and settings to the actual market and service population.
- In Korean public-service contexts, include realistic homes, community centers, documents, devices, and age ranges without reducing applicants to distress imagery.
- Avoid token grouping, staged harmony, poverty spectacle, medical stereotypes, and Western stock-office defaults.
- Show agency. A welfare applicant can review, decide, ask, and submit, not merely receive help.
- Verify names, signs, forms, uniforms, accessibility aids, and local conventions with domain sources.
- Obtain meaningful consent for identifiable sensitive contexts. A stock license doesn't settle dignity or contextual appropriateness.

If representation choices haven't been reviewed by the represented audience or a qualified local reviewer, label them unvalidated.

## Illustration style system

Define the system before drawing the set:

- geometry: angular, rounded, organic, or mixed with a rule
- perspective: flat, axonometric, or dimensional
- line: none, monoline, or variable, with exact weight range
- shape construction and corner behavior
- palette roles and maximum simultaneous colors
- texture type and intensity
- light and shadow model
- human proportions, facial detail, and pose range
- background treatment
- level of detail by output size
- animation rules if applicable

Build 3 representative tests: a person, an object, and a complex scene or abstract concept. If they look like three vendors made them, the system isn't ready. Reuse construction rules, not identical poses and props.

Illustrations must not fake evidence. A conceptual drawing may explain a process. It can't stand in for an actual product screen, customer, facility, or measured result.

## Icon language

Icons form a functional alphabet.

- Choose one base grid, commonly 16, 20, or 24 CSS px, from the product's density and target size.
- Set stroke weight per rendered size, such as 1.5 px at 20 or 24 px, then optically correct where diagonals and curves look weak.
- Define caps, joins, corner radius, terminal shape, fill policy, optical inset, and perspective.
- Draw and test at final size. Scaling a 24 px icon to 16 px often collapses detail.
- Use familiar symbols for common actions. Pair ambiguous or high-consequence icons with text.
- Selected state may use fill, enclosure, or weight if geometry doesn't shift.
- Keep touch targets at least the applicable platform and WCAG floor while the glyph stays visually smaller.
- Don't assemble arbitrary geometric glyphs as decoration. Every icon needs a stable meaning.

Audit a core set together: search, close, back, more, add, edit, delete, download, upload, settings, warning, success, and the product's domain-specific objects.

## Brand-expression contract

A brand expression contract turns identity into production choices without freezing every surface.

### Attributes

Choose 3 to 5 behavioral attributes with opposites and evidence. Example: `direct, not abrupt`; `precise, not sterile`; `warm, not cute`. Each attribute needs an observable consequence in type, image, copy, interaction, or layout.

### Recognition assets

List assets that make the subject recognizable:

- approved wordmark and symbol
- signature color roles
- typeface or type behavior
- proprietary product imagery, illustration construction, or data form
- recurring compositional relationship
- sound or haptic cue when relevant

The subject's established identity anchor outranks category defaults. A competitor palette never does.

### Behavior principles

State how the brand acts under normal, empty, error, waiting, and high-stakes conditions. Example: `Show the next recoverable action before explanation` or `Never celebrate before an irreversible operation is confirmed`.

### Motion

Define what moves, why, and what stays still. Include reduced-motion behavior. Brand motion may specify spatial character or cadence, but performance and task frequency still govern duration.

### Voice

Record speaker, listener, relationship, Korean speech level where applicable, vocabulary temperature, sentence behavior, and error tone. Include examples and counterexamples tied to real product states.

### Invariants

Name the few properties that must survive every surface, with a falsifier. Example: `The cobalt action color is reserved for committed actions. Loss occurs if it is used for decorative backgrounds or passive status.`

### Flexible zones

Name what teams may adapt: crop, layout density, campaign palette extension, illustration subject, local copy length, or motion amount. Flexibility is explicit, not accidental drift.

### Anti-expression

List choices that contradict the brand and why. Examples: infantilizing welfare applicants, fake urgency, anonymous purple glow, all-beige premium styling, rounded cards around every region, playful motion during payment failure, or stock handshakes as trust.

## Review checklist

- Does every image zone have a communication job and approved source status?
- Can the shot list be produced without inventing facts?
- Do required crops preserve the subject and adjacent action?
- Are lighting and color consistent enough to read as one set?
- Does the sequence add information rather than repeat atmosphere?
- Are caption, alt, credit, consent, and provenance resolved?
- Has cultural context been checked and uncertainty labeled?
- Do illustrations and icons share measurable construction rules?
- Does the brand contract name invariants, flexible zones, and anti-expression?
- Have all design-time placeholders been removed from the shipped surface?
