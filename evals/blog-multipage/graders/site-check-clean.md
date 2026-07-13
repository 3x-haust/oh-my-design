# Grader: omd check --site Ran and Returned Clean

Check that the cross-page site check was run on the output directory and produced no SITE-* findings, or that any firing site-level finding has a recorded decision overrule.

## Pass criteria

- The transcript or `.omd/` records show `omd check --site <dir>` (or `omd check index.html post.html` with both pages explicit) was executed after the build completed.
- The command returned no `SITE-LADDER-DRIFT` or `SITE-TOKEN-DRIFT` findings, OR every finding has a corresponding entry in `.omd/decisions.md` naming the rule ID and the reason it was overruled (not "it looked fine").

## Fail criteria

- `omd check --site` was not run — the build produced multiple pages and only a per-page check was run.
- `SITE-LADDER-DRIFT` fires and is not overruled — one page uses a 4-step type scale and another uses a different number of steps with no recorded reason.
- `SITE-TOKEN-DRIFT` fires and is not overruled — one page uses design tokens throughout and another falls back to inline values.
- The two pages visibly belong to different design systems (different font families, different radius vocabulary, different spacing ladder) with no recorded intent.

## Why this matters

A blog and its article page were designed together. The user will feel the drift between them before they can name it. `omd check --site` is what makes cross-page consistency measurable rather than approximate. The step 8 gate in `oh-my-design:ultradesign` exists for exactly this case.

## Severity

FAIL if `omd check --site` was skipped entirely. WARN if it ran and findings were not addressed.
