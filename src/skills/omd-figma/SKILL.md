---
name: omd-figma
description: >-
  Implement a Figma design end to end: pull the file, synthesize the design system,
  build each frame pixel-faithfully with an iterative diff loop, match responsive
  pairs, and ship with a fidelity report. Use when a figma.com link is present in
  the brief — the design decisions were already made in Figma; the job here is
  faithful implementation and systematization, not concept invention.
  Triggers: 피그마, figma link, 피그마 그대로 구현, any figma.com URL in the brief.
---

# OMD-figma

When Figma exists, the design is already decided. The frame/concept/reference steps
of the design loop are not needed — someone made those choices, and they are visible
in the file. The job here is different: read what was designed, build it faithfully,
systematize it so the implementation can be maintained, and tell the user honestly
how close the build got.

Read `protocol/reference-assembly.md` under `omd pack dir` to preserve its boundary:
the Figma structural-bypass route is not a substitute reference assembly. Figma snapshot
frames and their attribution are the supplied design source, not LEGO fragments; do not
create candidate assemblies, a chat candidate table, a selection record, a clean-room
composite, or a reference-usage report for them. If the user separately asks for external
visual reference research, run that work through the normal chat-first LEGO protocol rather
than mixing raw external captures into the Figma route.

The slop linter still runs. If the *original Figma design* fires slop rules, report
that to the user as information — never silently "fix" their design. The user hired
a faithful implementation, not a corrected one.

---

## Before anything: check the environment and the token

```bash
omd doctor
```

Run `omd doctor` first, quietly. If any check fails, surface the failure in one
sentence and stop. A missing Playwright installation or an unwritable `.omd/` will
break every subsequent step, and discovering that mid-loop is wasteful.

`omd figma pull` is the Figma API path, not interactive visual research. If a separate
user-directed external-region capture is needed, initialize `browser-rs` first; only an
observed initialization/capability failure permits headless, reduced-motion `omd render`
or `omd probe` as the deterministic Playwright fallback. Never open a reference board UI,
HTML, PNG, showcase, or `omd-board` for this route.

`omd figma pull` requires a Figma personal access token. This is the **one allowed
user interaction** in the skill. Check for it before pulling:

```bash
echo $FIGMA_TOKEN
```

If `FIGMA_TOKEN` is absent, tell the user exactly how to create one and where to set
it, then stop:

> To use `omd-figma`, you need a Figma personal access token.
>
> 1. Open Figma → **Account settings** (your avatar, top-left) → **Security** tab.
> 2. Under **Personal access tokens**, click **Generate new token**.
>    Scopes: **File content** (read) is sufficient.
> 3. Copy the token and set it in your shell:
>    ```bash
>    export FIGMA_TOKEN=figd_...
>    ```
>    To persist it, add that line to `~/.zshrc` or `~/.bashrc`.
> 4. Then re-run the skill.

Do not attempt to proceed without the token. Do not invent a workaround.

---

## 1. PULL — read the Figma file

```bash
omd figma pull <figma-url>
```

This writes `.omd/figma/snapshot.json` — the normalized page → frame → node tree —
and prints a page/frame inventory so the implementer can see what they are building.
The snapshot includes a `responsive` section: frames grouped into breakpoint sets by
the name-suffix and structure-similarity heuristics. Read this section before
building. It is the answer to "which frames go together."

The pull also computes responsive pairs (F4). Read the `responsive.breakpointSets`
section to understand which frames are desktop/tablet/mobile variants of the same
screen. Unpaired frames are in `responsive.unmatched` — they will fall back to the
dual-viewport rule (build once, diff at the frame's own width; record that the
pairing was a fallback).

---

## 2. SYSTEM — design system before any frame

```bash
omd figma system
```

This reads the snapshot and writes two artifacts:
- `.omd/figma/design-system.md` — color palette, type scale, spacing, radii,
  shadows, and the component inventory as a human-readable table.
- A `:root` CSS file with all tokens as custom properties, ready to paste into
  the build's stylesheet.

**Build the design system before any frame.** Components with variants become React
components (when the project is React) or standalone CSS classes with modifier
variants. Build each component set once; every frame that uses it is an instance,
not a copy. A component that appears in three frames is implemented three times
only if you did not read the inventory.

Record the component decisions:

```bash
omd decision "Button component: 3 variants (Size=sm/md, State=default/hover)" \
  --why "component set from snapshot; variant props map directly to CSS modifiers"
```

---

## 3. BUILD LOOP — per-frame, pixel-faithful, max 4 iterations

For each frame in the inventory (name-matched responsive pairs count as one build
target with multiple viewports):

**① Build the frame** — using the design system tokens from step 2, not hardcoded
values. Every color is a `var(--color-*)`, every spacing is a `var(--spacing-*)`,
every radius is a `var(--radius-*)`.

**② Diff**

```bash
omd figma diff <frame-id> <rendered-page> --json
```

Read the `cells` array. Find the worst cells (highest `mismatch`). The cell
coordinates are in the reference image's pixel space — they tell you *where* the
divergence is, not just how much.

**③ Fix** — address the worst cells. Typical causes: wrong component size, wrong
spacing token, missing border, wrong font weight. Fix the specific region the diff
named; do not guess.

**④ Re-diff** — repeat until `score ≥ 0.97` or the iteration ceiling is reached.

**Ceiling: 4 iterations per frame.** After 4, record the final score and move on.
A frame that reaches the ceiling with score < 0.97 is not a failure of the loop —
it is honest data. The fidelity report will show it.

Record each frame's final score:

```bash
omd decision "Hero frame: final score 0.983 (3 iterations)" \
  --why "font rendering divergence on large display text; within antialiasing tolerance"
```

---

## 4. RESPONSIVE — paired frames, honest fallbacks

For each breakpoint set in `responsive.breakpointSets`:
- Build each variant at its own viewport width.
- Diff each variant against its own Figma export (the diff tool renders at the
  frame's declared width).
- Report scores per variant in the fidelity table.

For frames in `responsive.unmatched` (no Figma-side viewport partner):
- Apply the dual-viewport rule: build once, render at 1280px and 375px, check both,
  record that the responsive pairing was a **fallback** (no Figma reference for the
  missing viewport).
- The fallback is not a gap in the implementation — it is an honest statement that
  the design did not specify a mobile layout, and the build interpolated one.

```bash
omd decision "Contact page: no mobile variant in Figma — dual-viewport fallback applied" \
  --why "responsive.unmatched; mobile layout interpolated from desktop, not diffed"
```

---

## 5. SLOP CHECK — the original design, honestly reported

After all frames are built, run the slop linter on each page:

```bash
omd check <page> --category slop --json
```

If the slop linter fires on findings that trace back to the original Figma design
(the indigo gradient that was in Figma, the three identical feature cards that were
in the design), **report them to the user as information, not corrections**:

> The original Figma design has these slop findings: `SLOP-GRADIENT` (hero
> background), `SLOP-TRIPLE-CARD` (features section). The build implements the
> design as specified. If you want these addressed, update the Figma file and
> re-pull, or override them with a written reason.

Never silently "fix" the design. The user's Figma file is the source of truth.

If findings arise from the *implementation* (a gradient the build introduced that
was not in the Figma file), fix them — those are build errors, not design choices.

---

## 6. SHIP — fidelity report, attribution, deliver

Run the full check suite:

```bash
omd check <page> --json --viewport 1280x800
omd check <page> --json --viewport 375x812
```

Then deliver the working implementation plus a fidelity report table. The table is
not a decoration — it is the honest record of how close the build got to the design.

**Fidelity report format:**

| Frame | Viewport | Score | Iterations | Notes |
|---|---|---|---|---|
| Hero | 1440px (desktop) | 0.983 | 3 | Font AA delta on display heading |
| Hero | 375px (mobile) | 0.978 | 2 | — |
| Features | 1440px | 0.997 | 1 | — |
| Contact | 1440px | 0.965 | 4 | Ceiling reached; map embed diff |
| Contact | 375px | — | — | Fallback: no Figma mobile frame |

Include the attribution map. The frame IDs are the sources. `.omd/attribution.md`
should record which Figma frame each token group was extracted from:

```
| Decision              | Source                     | Reason                           |
|---|---|---|
| --color-bg: #ffffff   | snapshot frame:1:2 (Hero)  | dominant fill, luminance=1       |
| --type-scale-1: 48px  | snapshot frame:1:2 (Hero)  | display heading fontSize         |
| Button component      | component set "Button"     | variant matrix from system step  |
```

Everything lands in `.omd/figma/` and `.omd/attribution.md`, committed with the repo.

---

## Relationship to omd-ultradesign

When a Figma file is in the brief, the design decisions — concept, colour, type,
layout — were made in Figma. The ultradesign loop's frame/concept/reference steps
(steps 1–3) are not needed and should not run. Hand off here.

The discipline of the ultradesign loop that *does* carry over:
- The slop linter runs. If the original design fires findings, report them honestly.
- Attribution is tracked. Frame IDs are the source entries.
- Motion: if the Figma file includes motion prototyping, read it and record a
  `.omd/motion-spec.md`; if not, the motion decision falls to the implementer and
  must be recorded.

---

## Constraints

- **Never ask the user for the token twice.** If it was set, `$FIGMA_TOKEN` is there.
- **Never fix the original design silently.** Report slop findings that trace back
  to Figma; let the user decide.
- **Never hardcode a hex value from the snapshot.** Use `var(--color-*)` from the
  design system output.
- **Never copy a component implementation across frames.** Build it once, use it
  everywhere.
- **Never stop the loop before running the diff.** An unverified build is not a
  faithful implementation — it is a guess.
- **Never claim a score you did not measure.** Read the diff output; do not estimate.
