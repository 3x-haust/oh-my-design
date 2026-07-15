# Held-out protocol — product-ux

Use Scenario 01 as the development task. Keep Scenarios 02 and 03 sealed as held-out
tasks: never tune prompts, rules, recipes, or theory against their observed outputs.
A release evaluation runs all three once with fresh generation and fresh blind-review
contexts. A held-out scenario may move into development only when a new generic
product-surface task replaces it and the replacement is frozen before results are
observed.

Score with graders/blind-rubric.md at `1280x900` and `390x844`, walking the scenario's
Core user tasks in a real browser (probe plans or manual interaction), never from a
single static screenshot. Publish per-dimension scores with observation evidence rather
than a total alone. Reference-synthesis dimensions apply only to scenarios that supply
user references; report them as N/A elsewhere and renormalize nothing — an N/A is not a
free 25 points.

Regression guard: alongside any product-ux improvement, re-run one marketing-surface
eval (e.g. korean-showpiece or motion-showpiece) to verify the landing-page quality did
not degrade.
