---
name: ultradesign
description: Designs from a one-line request - a new marketing page, a new multi-screen product or a redesign of an existing service. Each cycle makes the work, has a cold outside eye look at it, and stops to show you; reply "one more" or "continue".
---

# Ultradesign

## Goal

Work that reads as a real senior designer's. A cycle makes it, a cold eye with no context looks at it, a short memo
carries what was learned, and the next cycle starts from scratch carrying only that memo and what survived.

## Workflow

Run OMD commands with `omd` (on Pi, through `omd_cli`). They are yours to run; the human only ever types this skill's
name and their words. Start with `omd thin status`; it says where the loop is.

- **No loop yet.** Read the request and the folder. No product source: a new marketing page or a new multi-screen
  product, by what the request asks for. An existing service whose screens the request changes: a redesign. Then
  `omd thin start --kind marketing|product|redesign --request "<the request, verbatim>"`, adding `--continue` only
  when the human said to keep going without stopping (`continue without stopping: <request>`; the request is what
  follows the colon). Make cycle 1 (A cycle, below).
- **Being made.** You are resuming after a break or compaction. Read the memo and carry on with the cycle from where
  the files stand.
- **Next cycle due.** A cycle starts only in a fresh conversation. If this invocation is the first message of the
  conversation, run `omd thin begin` (it archives the last cycle's source out of the tree and restores the starting
  state), then make the cycle. Otherwise end your turn in one line: on Pi a fresh session opens by itself; on Claude
  Code or Codex the human starts a new session (`/clear` or a new chat) and runs this skill again.
- **Stopped.** The human's reply decides. "one more": `omd thin go --say "<their words>"`. "continue":
  `omd thin go --continue --say "<their words>"`. Put everything they said about the work into `--say`, verbatim.
  Then follow "Next cycle due". A question is answered and the loop stays stopped.

When `omd thin close` stops the loop, show the human, in this order: where the result is and how to open it; the cold
eye's answer, verbatim; this cycle's memo; and what the next cycle would throw away and rebuild (`omd thin status`
lists it). Then name the replies, typed after this skill's name: "one more" runs one cycle and stops again,
"continue" runs on until the cold eye finds no tell or cycle 3 is reached. End your turn.

## A cycle

This work is yours. It ships under your name and you will maintain it. If what you made is ordinary, do not polish
it: throw it away and recompose. The target: the key screens of the request, built in the project's real code (React,
Vite and strict TypeScript for new work), that a senior designer would sign, rendered at desktop and phone width.

If `.omd/thin/memo.md` holds earlier cycles, read it first; the last cycle's largest tell is what this one rebuilds
around, not a spot to patch. It is all that survives of them, together with the assets it names, the chosen work in
`.omd/thin/reference/` and, for a redesign, `.omd/thin/before/`. Do not try to recover anything else.

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
   `oh-my-design:internal-cold-eye` agent (the session's model; never name one) with only the packet folder path, and save its
   answer verbatim with `omd thin eye --record "<answer>"`. Do not explain the work to it.
4. Add this cycle to `.omd/thin/memo.md` under `## Cycle <n>`, in a few lines: what was learned, which assets survive,
   what not to do again. Put the cold eye's largest tell in your own words as what the next cycle rebuilds around; its
   smaller tells and verdict are context, not a fix list.
5. `omd thin close --keep <each surviving asset> --open "<how to open the result>"`, then continue with the Workflow.

## Rules

- The human decides only whether to go on. Every design choice is yours; never ask which idea, asset or layout.
- Tools are offered, never required. Use what the work needs, in the order it needs.
- Fonts and images only under free, unrestricted licences: OFL-1.1 fonts with their licence, images the project's
  own, generated for it, drawn in code or CC0.
- Never open `.omd/thin/archive/`. A new cycle carries the memo, the surviving assets, the chosen reference in
  `.omd/thin/reference/` and, for a redesign, the before-state and behaviour contract in `.omd/thin/before/`.
- No route, stage or review records: `omd thin` holds the whole state. A pass that finds nothing to improve changes
  nothing.

## Verification

What you tell the human matches `omd thin status`. The quality is not yours to grade: the cold eye says whether a tell
remains; the human says whether to go on.
