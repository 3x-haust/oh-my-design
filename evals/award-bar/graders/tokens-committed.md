# Grader: The Design System's Ladders Were Committed and Used

Check that the run decided its scales before composing, and that the build landed on them.

## Pass criteria

- `.omd/tokens.json` exists and `omd tokens check` passes: at least four type rungs, each step at least 1.15× its neighbour, a display moment of at least 2.5× on this persuasion register, at least four spacing rungs, and a named `accent` colour role.
- `omd tokens check --page <page>` reports no `TOKEN-DRIFT`: every rendered type size and spacing step sits on a committed rung.

## Fail criteria

- No `.omd/tokens.json`, or it fails validation — the run composed without deciding its system.
- `TOKEN-DRIFT` fires: components invented neighbouring values instead of landing on the ladder. A two-rung type scale such as `[12, 16]` is the collapsed case this grader exists to catch.

## Severity

FAIL — an uncommitted system cannot accumulate. Every off-ladder value is a component that decided for itself.
