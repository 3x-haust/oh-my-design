# Grader: Figma Snapshot Written

Check that `omd figma pull` ran and produced the normalized snapshot artifact.

## Pass criteria

- `.omd/figma/snapshot.json` exists and is valid JSON.
- The snapshot contains a `pages` array with at least one entry.
- The snapshot contains a `componentSets` field (may be empty if the file has no
  component sets, but the field must be present).
- The snapshot contains a `responsive` field with `breakpointSets` and `unmatched`
  arrays — indicating that responsive matching was performed after the pull.
- `capturedAt` is present and is a valid ISO 8601 timestamp.

## Fail criteria

- `.omd/figma/snapshot.json` is absent — `omd figma pull` was not run, or the
  pull failed and the skill proceeded anyway.
- The file exists but is not valid JSON, or is an empty object `{}`.
- The `responsive` field is absent — responsive matching was skipped.

## Why this matters

The snapshot is the source of truth for the entire build. A skill that builds
without pulling first is working from its training distribution, not from the
Figma file. The `responsive` field being present confirms that breakpoint matching
was performed and the skill knows which frames are viewport variants of the same
screen.
