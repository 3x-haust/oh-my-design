# Grader: motion-spec.md Exists and Cites Cookbook Recipes

Check that the build produced a motion spec before writing animation code, and that each scene cites a recipe from the cookbook.

## Pass criteria

- `.omd/motion-spec.md` exists and has at least one `## Scene` header.
- Each scene entry includes a `trigger:` field (load, scroll, or hover).
- At least one scene cites a recipe from `core/motion/recipes/` by file name (e.g. `split-text-entrance.md`, `scroll-reveal.md`, `stagger-orchestrator.md`) or explicitly names the cookbook as the source.
- At least one scene cites a `duration` and `easing` drawn from a motion study reference (not from recipe illustrative defaults — the value should match or reference a measured invariant from the board's motion studies).

## Fail criteria

- `.omd/motion-spec.md` does not exist.
- The spec exists but has no `##` scene headers (empty or preamble-only).
- No scene cites a cookbook recipe — animations were improvised without the spec-as-contract.
- Duration/easing values are purely default (e.g. `500ms ease-in-out` with no study citation) across all scenes.

## Severity

FAIL if the spec is absent or entirely uncited. WARN if scenes exist but recipe citations are thin.
