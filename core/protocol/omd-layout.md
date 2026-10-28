# Project `.omd/` layout and retention

`.omd/` is the durable design and evidence record. `.omd/.cache/` is reproducible scratch.

| Family | Examples | Retention |
| --- | --- | --- |
| Route and request authority | `route.json`, native run records, locale context | Keep while the task or its evidence is current |
| Reference context | `refs/`, `discovery/`, consulted-reference records and whole images | Keep every cited source receipt and pixel |
| Figma target proof | `figma/snapshot.json`, authorized exports/renders, `figma/diffs/*.json` | Keep while the linked Figma target is current |
| Browser execution | lifecycle plans, trusted browser receipts, captures, observations | Keep immutable lineage |
| Review | `first-render/`, `final-review/`, measured terminal records | Keep immutable lineage |
| Completion | `source-seal.json`, `final-evidence-v2.json`, content-addressed runs | Keep |
| Scratch | `.cache/` plans, temporary renders, generated previews | Remove only when no durable record cites them |

Every new writer must use the project writer adapter, stay inside the project root, and name the
retained reader or decision use. A current pointer may be replaced only by authorized current-task
work; immutable content-addressed records are never edited in place.

Do not delete a file merely because it looks generated. Check whether a current route, receipt,
observation, review, or final manifest cites it. Unclassified paths remain an audit finding until
their ownership and retention rule is explicit.
