# Grader: Finish Pass Applied

Check that the finish-pass checklist was walked after the build, and that at minimum the favicon and `::selection` colour were implemented — the two items that are most visible on a showpiece page.

## Pass criteria

- **Favicon**: a `<link rel="icon">` tag is present in the `<head>` using an inline SVG data-URI. The favicon is not a broken path, not a missing asset, and not absent. A showpiece landing page without a favicon reads as a prototype in the browser tab.
- **`::selection`**: the page CSS contains a `::selection` rule that sets `background-color` to a value consistent with the page's colour system — not the default browser-blue highlight. On a brand-forward Korean fintech landing page, the selection colour is a design decision.
- **`omd decision` entries**: `.omd/decisions.md` contains at least one entry related to the finish pass. The checklist was walked and each item was either implemented or explicitly skipped with a reason.
- **OG meta tags**: `<meta property="og:title">` and `<meta property="og:description">` are present. The OG description is in Korean (matching the brief language) and does not contain SLOP-COPY-KO patterns.

## Fail criteria

- No `<link rel="icon">` tag in the page — the build shipped without a favicon.
- `::selection` is absent from the CSS — the default browser highlight was left in place.
- No finish-pass entries in `.omd/decisions.md` — the checklist was skipped entirely.
- OG tags are absent or the OG description is a placeholder, a tagline, or contains AI-prose patterns that would fail the copy rules.

## Why this matters

A showpiece page is built to impress. The favicon appears in the browser tab before the user has scrolled once. The `::selection` colour appears the moment the user highlights text. These are the surfaces that announce whether the page was finished or abandoned at "checks pass." The finish-pass checklist is what closes the gap between "the eye approved it" and "a person could publish this."

## Severity

FAIL if favicon is absent. FAIL if finish-pass was not walked (no decisions). WARN if `::selection` is missing.
