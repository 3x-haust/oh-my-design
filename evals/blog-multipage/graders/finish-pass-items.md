# Grader: Finish Pass Items Present

Check that the finish-pass checklist was applied to the built pages — specifically the items that are most visible in a personal blog context: favicon, `::selection` colour, and OG meta tags.

## Pass criteria

- **Favicon**: at least one `<link rel="icon">` tag is present in the `<head>` of both pages, using an inline SVG data-URI (no separate asset file dependency). A missing favicon is a FAIL — a personal blog without one reads as a template, not a publication.
- **`::selection`**: the page CSS contains a `::selection` rule that sets `background-color` to a value other than the browser default (`Highlight` keyword or bare system blue). The colour should be derived from or consistent with the page's accent token.
- **OG meta tags**: both pages contain `<meta property="og:title">` and `<meta property="og:description">`. The OG title is specific to each page — the article page's OG title is the article title, not the blog name. The OG description is a concrete sentence, not a tagline.
- **`omd decision` entries**: `.omd/decisions.md` contains at least one entry related to the finish pass (favicon, ::selection, scrollbar, OG, or optical alignment). The finish pass was walked, not assumed.

## Fail criteria

- No `<link rel="icon">` tag in either page — the build shipped without a favicon.
- `::selection` is absent from the CSS — the default browser highlight colour was left in place.
- `og:title` is identical on both pages — the article page does not have its own OG title.
- `og:description` contains AI stock phrases ("powerful", "seamless", "next-level", "도움이 됩니다") that would fail SLOP-COPY.
- No finish-pass decisions recorded in `.omd/decisions.md`.

## Why this matters

A blog is a publication. Publications have favicons, branded highlights, and sharing metadata because real people share them. The finish-pass checklist is what separates a build that passes `omd check` from a build that reads as published.

## Severity

FAIL if favicon is absent. FAIL if OG tags are absent. WARN if `::selection` is missing or OG copy is generic.
