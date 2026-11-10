# A marketing page, made the way a senior designer makes one

A page that is only well set (good type, correct spacing, the product in a frame) reads as competent and
anonymous. The pages people remember rest on one authored idea, made as one asset, with the page composed
around it. Work in this order; each step produces something you can look at.

## 1. The idea, before any reference

Read the project (name, mark, what it does, what its output looks like) and write
`.omd/studio/concept.json`. Sketch at least six rough ideas in words or quick renders (`omd imagegen`). Each
must be a different object, not one object from another angle.
An idea comes from one of four places:

- **name**: a letter or word of the name made into a thing and put to work.
- **mark**: the logo's own shape built as a physical object that does something.
- **mechanism**: what the product does, acted out by objects rather than explained by a diagram.
- **material**: the product's real output used as the picture, at a scale where it is the page.

Keep the one that still reads with the logo removed and argues one claim without words. Record the kept idea,
the object, where it came from, the claim, at least two places the object returns down the page, and the
ideas that lost with why. `omd stage next` will not move on to references until this exists.

## 2. References, each for one job

Choose them to make the idea well, not to supply one: a primary for layout rhythm (named in `system.json`),
one for material and light when the idea is an object, one for type. Record the others under `"jobs"`.
`omd studio refs <url>... --json` captures and measures each; open the captures and look at them.
`omd studio blueprint` writes the primary's skeleton (section order, heights, what leads each) with no copy,
colour or image, as slots for this project's content.

## 3. Reference board, direction, then the key asset alone

Follow `guides/assets.md`: pin image-level references per section and element (`omd studio board`),
generate concept boards and choose one direction, then generate the key asset (the object the idea names,
and any icon set or badges the page needs) as several candidate sets, compare them in pairs and ship the
winner with `omd studio asset`. Or build the object in code: `omd studio rig` gives a lit stage (see
`guides/material-stage.md`); record that choice in `.omd/studio/skips.json`.

Put the asset inside an element marked `data-product`, at least half the first screen wide, before any
page exists. Shoot it alone and put it beside a crop of the best work you studied. Refine it until the
crop does not embarrass it: silhouette first, then material, then light, then motion. Only then compose.

## 4. Compose around the asset

Several first screens that differ in structure, set side by side with `omd studio sheet`, then one.

- Type and graphic interlock: the headline and the object share an edge, overlap, or answer each other's
  shape. A headline above a centred picture is two things stacked.
- The first screen hooks: one thing far larger than everything else.
- The device returns: the object, or a part of it, comes back at least twice more (a section ground, a
  divider, a cropped detail, the footer), changed each time.
- Sections follow the primary's measured rhythm, each with its own composition; chapters read as parts of
  one page, not a stack of equal blocks.

## 5. A pass that adds, then a pass that removes

Add: hover, focus and pressed states; the order and timing of motion (what leads, what follows, the curve);
type refinement (tracking on large sizes, line breaks, optical alignment); the small crafted moment only a
person who cared would add. Then remove everything that does no job.

## 6. Conventions are defaults

`omd studio check` separates three things. Defects (content off the edge of a phone, unreadable body text,
a logo on an accidental box) are always fixed. Conventions are this studio's defaults: brand colours kept,
no small label above a heading, no explanatory line under a section heading, plain section names, weights
400 to 600 with hierarchy by size, no decorative arrows, a slider for a quantity, no player controls. When
the idea needs to break one, record it in `system.json`:

```json
"deviations": [{ "convention": "weight-range", "instead": "the wordmark's own 800 for headlines", "because": "the object is cast from the heavy wordmark and thin type beside it reads as a caption" }]
```

The check then holds the page to the choice: a deviation used in two places out of seven is an accident.
Taste (is the idea good, does the page feel made) is never measured; you judge it by putting `omd studio look`'s
side-by-side beside the originals and choosing between two versions of your own work.

Things that mark a page as generated (highlighter swipes, sticky notes, pastel section blocks, avatar pills,
box-and-arrow diagrams, tilted cards) are never deviations: replace each with the product or the idea.
