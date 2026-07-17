# Public regression fixture protocol — product-ux

Scenario 01 is the development task. The repository-visible Scenarios 02 and 03 are public
regression fixtures: they may be read, run, and updated as ordinary versioned fixtures, and
must not be described as sealed or unseen held-outs.

True held-outs, when used, live outside implementer context. Identify them only with opaque
IDs or content hashes; keep their prompts, generated outputs, and scorer feedback sealed from
implementers. If no such external held-out run exists, report that absence explicitly rather
than claiming repository-visible fixtures are held out.

Score with graders/blind-rubric.md at `1280x900` and `390x844`, walking the scenario's
Core user tasks in a real browser (probe plans or manual interaction), never from a
single static screenshot. Publish per-dimension scores with observation evidence rather
than a total alone. Reference-synthesis dimensions apply only to scenarios that supply
user references; report them as N/A elsewhere and renormalize nothing — an N/A is not a
free 25 points.

Regression guard: alongside any product-ux improvement, re-run one marketing-surface
eval (e.g. korean-showpiece or motion-showpiece) to verify the landing-page quality did
not degrade.
