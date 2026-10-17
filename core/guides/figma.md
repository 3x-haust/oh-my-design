# Figma target

Use this guide when the request supplies a Figma link (`figma.com/design/...` or `figma.com/file/...`).

The supplied frames already choose their represented visual properties. Do not run a concept
exploration or silently "correct" the user's design. Absence in Figma is a gap, not approval:
behavior, accessibility, missing responsive views and missing states still need real work.

1. Run `omd doctor`. Check only whether `FIGMA_TOKEN` is configured; never print it. If it is
   missing, ask the user to configure a read-only file-content token locally. Do not invent a workaround.
2. `omd figma pull <figma-url>` saves `.omd/figma/snapshot.json`; `omd figma system` derives
   tokens and the component/variant matrix. Inspect frames, variants and responsive pairs.
3. Interaction states: when a component set has hover, focus, pressed, open or disabled
   variants, implement those exact states. When a needed state has no variant, record it as a
   Figma state gap and design it from the represented system rather than claiming fidelity.
4. Implement with ordinary scoped tools inside the current route. Reuse only needed components.
5. For each supplied frame/view run `omd figma diff <frame-id> <rendered-page> --json`, repair the
   observed mismatch and re-diff. A missing paired viewport needs truthful interpolation plus real
   render checks, not a claimed match. A failed diff never becomes PASS by attempt count; after three
   failed repairs of the same defect, report it.
6. Keep the Figma target separate from external references. Other references may inform only what
   Figma does not represent.

Finish through the normal `omd first-render check` and `omd lifecycle finish` path. Report
per-frame fidelity, responsive and state gaps, and exact limits.
