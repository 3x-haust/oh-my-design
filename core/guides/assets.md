# References, direction and owned assets

Plain screens (cards and lists on a tidy system) are where a designer starts, not where they stop. The
screens become designed when the product gets assets of its own and the screens are rebuilt around them,
and the quality comes from making many candidates and choosing. Every track (marketing, product,
redesign) passes these stages before its screens are built; `omd stage next` names the one that is due
and the build is refused until it is done.

## 1. A reference board, one job per image

Collect references per screen and per element, not whole sites: a single screen's layout, one icon
style, a map, a list row, a badge, a material. Each image you keep does exactly one job.

- Search in this brief's own words, one screen or element at a time. No login or key is needed:
  `omd ref browse start --lane design --json`, then `omd ref browse search dribbble|behance "<one element>"
  --session <id> --json` (Pinterest's public results when they load; Dribbble and Behance otherwise),
  `shot --selector <the item's img>` and `keep --reason "<its job>"`, `end` to file the keeps.
- Write `.omd/studio/board.json`: `{"items": [{"image": "<kept png>", "for": "<screen or element>",
  "job": "<what you take from it>", "source": "<page url>"}]}`. No count is required.
- `omd studio board --json` composes the sheet `.omd/studio/board.png`, grouped by screen and element.
  Look at it and say back what you kept and what each is for.

## 2. Concept boards, then one direction

Before any screen, generate whole-product concept boards from the idea and the reference board:
`omd imagegen --kind board --name concept-a --prompt "<the product, its key screens with real content,
palette, type, asset style>" --reference .omd/studio/board.png` (`--viewport mobile` for an app). Make at
least three that differ in their world of assets and composition, not in colour. Set them side by side
with `omd studio sheet --name concepts <png> <png> <png> --json`, choose one yourself and write
`.omd/studio/direction.json` (`sheet`, `chosen`, `because`, `lost` with why, `carry`: what must survive
into the screens). The boards are drafts; none ships.

## 3. Asset sets: many candidates, one winner

For each asset the product owns (its icon set, the objects in its key visual, a character, rank badges),
generate several candidate sets in the chosen direction, one call each:
`omd imagegen --kind asset --name <set> --prompt "<the items, one per job, their one shared style, a
plain flat background>" --reference <chosen board>`. Generate more when the candidates are close; the
designer we studied made one icon set fifteen times.

- `omd studio sheet --name <set> <candidate pngs> --json` sets them beside the reference board.
- Compare two at a time and keep the winner of each pair until one is left. Judge the whole set: one
  form language, one light, one line weight; a set with one odd item loses.
- Record the rounds and the winner in `.omd/studio/assets.json` (`sets[].name`, `for`, `sheet`, `rounds`
  of `{a, b, winner, because}`, `chosen`).
- Ship the winner only through the publisher: `omd studio asset <chosen png> --out public/assets/<set>
  --cut --split auto [--names a,b,c] --json` cuts the background, splits the set into its items, trims
  them and records prompt, tool and candidate in `.omd/studio/images.json`. Never copy a generated file
  by hand, and never ship a page idea or concept board.
- No real people, no product screenshots, no other company's marks are generated. The project's real
  logo is its file.
- Only when no image tool works here, or the candidates lost to an object built in code, write
  `.omd/studio/skips.json` `{"assets": {"instead": "rig", "because": "..."}}` and build it with
  `omd studio rig` (`guides/material-stage.md`).

## 4. Compose the key screens around the asset

An asset that only decorates a finished layout changes nothing. Let it change the structure of the key
screens: a lesson list rebuilt as a path of blocks you climb is a different screen from a list with a
block icon on each row. For each key screen:

- Build several structurally different variants (what leads, how the content is arranged, where the
  asset carries the information), not one variant polished. Variants of colour or radius are one variant.
- Shoot them side by side: `omd studio sheet --name <screen> <url-or-html> <url-or-html> ...
  --viewport mobile --json`, pick one by comparing in pairs, and say why in your notes.
- Keep the asset's style intact on the page: shown at the size it was drawn for, on a ground it was cut
  for, never recoloured into a different set.

Then the track's own checks apply (`omd studio check`, `omd studio look`).
