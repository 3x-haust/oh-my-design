---
name: thin-make
description: One cycle of the thin design loop. Own the idea, gather image references and one real finished work, make the assets, compose the key screens around them, look beside the real work, subtract, then hand the captures to a cold eye.
---

# Make

This work is yours. It ships under your name and you will maintain it. If what you made is ordinary, do not polish
it: throw it away and recompose.

## Goal

The key screens of the request, built in the project's real code (React, Vite and strict TypeScript for new work),
that a senior designer would sign, rendered at desktop and phone width.

## Workflow

If `.omd/thin/memo.md` holds earlier cycles, read it first. It is all that survives of them, together with the assets
it names, the chosen work in `.omd/thin/reference/` and, for a redesign, `.omd/thin/before/`. Do not try to recover
anything else.

Work in a designer's order. Read the project's real material: README, logo, words, data, the product itself. For a
redesign, capture the before state first (`omd thin shoot <url> --before` for every screen the work touches) and write
the behaviour contract in `.omd/thin/before/contract.md`: screens, routes, data, what every control does. The existing
screens, routes, data contract and behaviour stay unless the request says otherwise.

Gather references at image level, one job per image: a type pairing, a grid, an object treatment, a way of showing
data. Look through galleries and real sites (`omd thin refs dribbble|behance|pinterest "<one job>"` shows the results
as one image; `omd thin refs keep <image-url> --job "<the job>"` keeps one). In cycle 1, choose one real finished work
and capture it (`omd thin shoot <url> --reference`). Keep it beside your own to the end.

Decide your own idea and your own assets: an object family that code cannot draw well, recurring across the screens.
Generated images may ship as assets (`omd imagegen --kind asset`, then cut the background with
`omd studio asset <candidate> --out public/assets/<name>.png --cut`); logos, UI chrome and per-row data stay code.
Compose the key screens around the asset so it changes their structure, not their decoration. Render, and look at
your screens beside the chosen work at desktop and mobile (`omd thin shoot <page>`,
`omd studio sheet --name beside <yours.png> <theirs.png>`, `omd measure`). Subtract.

When the screens are done:

1. Capture every key screen, at its final state, with `omd thin shoot <page|url>`; it writes desktop and phone
   captures into this cycle's `result/`. Remove captures there that are not the final result.
2. Run `omd thin check <page|url>` once, for what nobody intends: broken layout, text off the edge, dead controls.
3. `omd thin packet`, then ask the cold eye. On Pi: `omd thin eye --run`. On Claude Code or Codex: spawn the
   `oh-my-design:cold-eye` agent (the session's model; never name one) with only the packet folder path, and save its answer
   verbatim with `omd thin eye --record "<answer>"`. Do not explain the work to it.
4. Add this cycle to `.omd/thin/memo.md` under `## Cycle <n>`, in a few lines: what was learned, which assets survive,
   what not to do again. Keep the cold eye's point in your own words if it changes what you would do next.
5. `omd thin close --keep <each surviving asset> --open "<how to open the result>"`, then return to `oh-my-design:thin`.

## Rules

- Tools are offered, never required. Use what the work needs, in the order it needs.
- Fonts and images only under free, unrestricted licences: OFL-1.1 fonts with their licence, images the project's
  own, generated for it, drawn in code or CC0.
- A pass that finds nothing to improve changes nothing.

## Verification

Not yours to grade. The cold eye says whether a tell remains; the human says whether to go on.
