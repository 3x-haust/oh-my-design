# Grader: Cross-Page Design Ladders Consistent

Check that the type scale, spacing ladder, and radius ladder are consistent across both the landing index and the article page — measured from the built output, not from intent.

## Pass criteria

- The landing page and the article page share the same CSS custom properties for type scale tokens (`--text-*`, `--font-*`), spacing tokens (`--space-*`), and radius tokens (`--radius-*`).
- Both pages reference a shared stylesheet, or each page's `:root` block declares the same token set with the same values.
- If the article page intentionally uses a wider measure or a different leading for reading comfort, that decision is recorded in `.omd/decisions.md` — the variation is intentional, not drift.
- `omd check --site` (or equivalent) confirms no `SITE-LADDER-DRIFT` finding.

## Fail criteria

- The landing page uses a 4-step type scale and the article page uses a different number of distinct sizes with no recorded reason.
- One page declares `--radius-card: 8px` and the other uses `border-radius: 12px` inline — the ladder is inconsistent and untokenised.
- The font families differ between pages without a recorded decision (e.g., the landing uses a display serif for headings and the article page defaults to system-ui).
- Spacing tokens are present on the landing page but absent or overridden on the article page.

## Why this matters

A design system that applies to only one of two pages is not a design system. Cross-page ladder consistency is the minimum bar for "built together" — the user reads both pages in one session and the seam between them is what they remember.

## Severity

FAIL on any single criterion above.
