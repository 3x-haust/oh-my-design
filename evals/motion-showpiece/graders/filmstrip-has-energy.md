# Grader: Filmstrip Frames Differ (Energy > 0)

Check that the filmstrip captured visible motion — at least one frame pair shows pixel-level change, confirming animation actually ran.

## Pass criteria

- `.omd/.cache/filmstrip-energy.json` (or any `*-energy.json` in `.omd/.cache/`) exists.
- `peakEnergy` in the energy JSON is greater than 0.01 (more than 1% of pixels changed between at least one frame pair).
- At least one `regionFraction` entry (top/mid/bottom) in any pair is non-zero — the motion is spatially locatable, not a metadata artifact.

## Fail criteria

- No energy file found in `.omd/.cache/`.
- `peakEnergy` is 0 or below 0.01 — the filmstrip frames are identical, meaning no animation fired during capture.
- The frames file count is fewer than 2 (only one frame captured, no pairs to compare).

## Severity

FAIL — a showpiece page with zero measured motion is not a showpiece page. The one memorable moment must produce a pixel-level signal in the filmstrip.

## Note on GSAP

If the page uses GSAP/rAF exclusively, `getAnimations()` will report zero animations (a known probe limit), but the energy curve will still show non-zero `peakEnergy` as long as the animation actually ran during the filmstrip capture window. A GSAP-only page with peakEnergy > 0.01 passes this grader.
