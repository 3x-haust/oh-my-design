# Grader: Design System Artifacts Written

Check that `omd figma system` ran and produced both the CSS token file and the
human-readable design-system markdown before any frame was built.

## Pass criteria

- `.omd/figma/design-system.md` exists and contains at minimum:
  - A "Color Palette" section with at least one color entry.
  - A "Component Inventory" section — even if empty, the heading must appear.
- A `:root { }` CSS block is either embedded in the skill's transcript or written
  to a file in the project, containing at least one `--color-*` custom property.
- `.omd/decisions.md` contains at least one entry that references the design system
  step — for example, recording which component sets were found and how variant
  props were mapped.

## Fail criteria

- `.omd/figma/design-system.md` is absent — `omd figma system` was not run.
- The CSS token output is absent — tokens were not extracted from the snapshot.
- The build uses hardcoded hex values instead of `var(--color-*)` custom properties
  (visible as `#RRGGBB` literals in the HTML/CSS rather than `var(--...)`).
- The component inventory was ignored and the same component was implemented
  multiple times from scratch across different frames.

## Why this matters

`omd figma system` is the step that turns the snapshot's raw node data into an
actionable design system. Building before this step means every color and spacing
decision is a guess rather than a measurement. The CSS custom properties are the
handshake between the system step and the build step — hardcoded values are the
clearest signal that the system step was skipped.
