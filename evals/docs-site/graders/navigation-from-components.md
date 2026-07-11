# Grader: Navigation Pattern From components.md

Check that the navigation structure of the documentation site was chosen with reference to `core/theory/components.md` rather than applied as a default pattern.

## Pass criteria

- `.omd/decisions.md` contains at least one entry citing `components.md` (or `core/theory/components.md`) for the navigation decision.
- The navigation pattern chosen (top bar, left sidebar, or breadcrumb trail) matches the type of content and user task: a multi-page CLI reference warrants a persistent left sidebar for cross-page scanning; a single-page guide does not require one.
- The navigation provides the user with orientation — current page is highlighted, top-level structure is visible, depth is legible.
- Interactive targets in the navigation meet the 44×44px minimum hit area (`omd check` A11Y-HIT-AREA must not fire on navigation items).
- The navigation structure is consistent across all three pages (home, Getting Started, Commands reference).

## Fail criteria

- No `components.md` citation for the navigation decision in `.omd/decisions.md`.
- The navigation pattern is the same on a single-page guide as it would be for a 200-page API reference — the pattern was applied as a default rather than chosen for the content.
- Current page is not indicated in the navigation — the user cannot tell where they are.
- Navigation items fail the 44×44px hit area check on mobile (375px viewport).
- The Commands reference page omits a navigation element that would allow the user to return to the Getting Started guide — the pages are isolated rather than connected.

## Why this matters

Navigation is infrastructure. When it fails, everything else becomes harder — the user cannot orient, cannot cross-reference, cannot tell where they are in a larger structure. `components.md` provides the condition → choice → reason reasoning for navigation patterns: why a sidebar belongs in multi-section documentation, why a breadcrumb trail matters for depth > 2. Citing it means the decision was made, not assumed.

## Severity

FAIL if current page is not indicated in navigation. FAIL if navigation targets fail hit-area checks on mobile. WARN if components.md was not cited.
