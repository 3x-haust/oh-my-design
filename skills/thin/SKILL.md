---
name: thin
description: Thin design loop. Takes a one-line request for a new marketing page, a new multi-screen product or a redesign of an existing service, and works in cycles - one owned design pass, a cold outside eye, a short memo - each cycle starting clean.
---

# Thin

## Goal

Work that reads as a real senior designer's. A cycle makes it, a cold eye with no context looks at it, a short
memo carries what was learned, and the next cycle starts from scratch carrying only that memo and what survived.

## Workflow

Run OMD commands with `omd` (on Pi, through `omd_cli`). Start with `omd thin status`; it says where the loop is.

- **No loop yet.** Read the request and the folder. No product source: a new marketing page or a new multi-screen
  product, by what the request asks for. An existing service whose screens the request changes: a redesign. Then
  `omd thin start --kind marketing|product|redesign --request "<the request, verbatim>"`, adding `--continue` only
  when the request itself says to keep going without stopping. Make cycle 1 with `oh-my-design:thin-make`.
- **Being made.** You are resuming after a break or compaction. Read the memo and carry on with `oh-my-design:thin-make`
  from where the files stand.
- **Next cycle due.** A cycle starts only in a fresh conversation. If this invocation is the first message of the
  conversation, run `omd thin begin` (it archives the last cycle's source out of the tree and restores the starting
  state), then make the cycle with `oh-my-design:thin-make`. Otherwise end your turn in one line: on Pi a fresh session opens by
  itself; on Claude Code or Codex the human starts a new session (`/clear` or a new chat) and invokes this skill again.
- **Stopped.** The human's reply decides. "one more": `omd thin go --say "<their words>"`. "continue":
  `omd thin go --continue --say "<their words>"`. Put everything they said about the work into `--say`, verbatim.
  Then follow "Next cycle due". A question is answered and the loop stays stopped.

When `omd thin close` stops the loop, show the human, in this order: where the result is and how to open it; the cold
eye's answer, verbatim; this cycle's memo; and what the next cycle would throw away and rebuild (`omd thin status`
lists it). Then name the two replies: "one more" runs one cycle and stops again, "continue" runs on until the cold
eye finds no tell or cycle 3 is reached. End your turn.

## Rules

- The human decides only whether to go on. Every design choice is yours; never ask which idea, asset or layout.
- Never open `.omd/thin/archive/`. A new cycle carries the memo, the surviving assets, the chosen reference in
  `.omd/thin/reference/` and, for a redesign, the before-state and behaviour contract in `.omd/thin/before/`.
- No route, stage or review records: `omd thin` holds the whole state.

## Verification

What you tell the human matches `omd thin status`.
