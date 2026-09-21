# Moodboard

The reference board answers "what do I assemble from?" This answers the earlier question: **what
should this feel like?** A moodboard is the weakest evidence in the system by construction, and it is
useful precisely because it is not asked to prove anything structural.

## The two axes

A mood item is always `scope: whole` + `evidence: visual-only`:

| scope | evidence | what it is | may transfer | pixels in production |
| --- | --- | --- | --- | --- |
| whole | visual-only | **moodboard** — a whole rendered artifact, looked at | declared felt qualities | never |
| whole | measured | a whole page measured as the unit of study | measured invariants, page composition | never |
| part | measured | **the reference board** — component anatomy and geometry | measured invariants, geometry, anatomy | never |
| part | visual-only | a crop or supplied image, looked at | declared geometry, principles | never |

`core/ref/reference-scope.ts` owns this table. A **visual-only** capture may never support a
structural claim — a screenshot does not measure that a padding is 16px, and a design built from "the
spacing looks 8-ish" is the derivative failure the transfer boundary exists to prevent. Mood
`qualities` are therefore felt qualities ("warm, printed, dense but quiet"), and a value carrying a
measurement is rejected with `MOOD_STRUCTURAL_QUALITY`.

## What it produces

`.omd/moodboard.json` (`moodboard-v1`) plus a human-readable `.omd/moodboard.md`:

- **direction** — one line: the felt direction these captures were gathered to fix.
- **items** — 1..16 captures, each with `source`, `qualities`, `imagePath`, `sha256`, `capturedAt`,
  and the two axes.

Captures live under `.omd/refs/mood/`. An item whose `imagePath` points anywhere else is refused with
`MOOD_OFF_STORE_PATH`, because a mood record must not be able to point at a shipped asset.

## The rights gate is hard from day one

Unlike the slop and distance gates, which start advisory, this one is a hard failure:

```
MOOD_BYTES_IN_PRODUCTION
```

Production source must not carry a mood capture's bytes, its path, or its digest. Seeing a page is
not a licence to ship its pixels, and a moodboard is study material for direction. OMD does not
scrape, hotlink, or download remote source images; the capture is a local, user-directed record used
to make a decision, and the delivered design must be your own material.

## How it relates to the board

A moodboard is not a substitute for parts. It selects a direction before composition; the board then
supplies the parts that direction is built from. A route that fixes its direction from a supplied
reference or an existing brand may skip it with a written reason — that is the normal case for
contract work, and `omd route` records it like any other optional stage.
