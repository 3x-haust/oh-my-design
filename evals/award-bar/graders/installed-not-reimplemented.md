# Grader: Techniques Were Installed, Not Reimplemented

Check that motion and composition techniques arrived as real source rather than as a from-prose approximation.

## Pass criteria

- `.omd/decisions.md` records at least one `omd recipe add` install for the motion or composition technique the page ships.
- The installed files are present in the project and referenced by the build.
- `omd craft-capture <page> --selector <the installed part>` measures the installed part as `scrollLinked: true`, or with `peakEnergy` above the floor for a load scene.

## Fail criteria

- The page's motion was hand-written from a recipe document with no install recorded — the reimplementation path that reliably degrades to a static approximation.
- An install is recorded but the measured part shows neither scroll-linkage nor load energy: the source landed and was never wired.

## Severity

FAIL — installing is the step that removes the reimplementation gap. A recorded install with no measured motion is a claim without evidence.
