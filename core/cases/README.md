# Designer source cases

These are attributable worked examples, not universal design rules or destination
visual references. Keep the designer's native quotations, original whole video
frames and source timestamps together. Analyst context and transfer limits are
separate from the quoted speech. Automatic captions can contain transcription
errors; sampled frames do not establish continuous viewing or measured outcomes.

Read the catalog with `omd pack cases`, then open relevant cases with
`omd pack cases/<id>`. The native Pi tool supplies the actual original images as
image parts, not only filenames. Cases explain a decision in its original
context. They do not approve a new design, authorize copying source assets into
a product, or replace current task requirements and selected visual originals.

Look at both the problem and the revised relationship before choosing whether
the case applies. The same designer can remove containment in one context and
add it in another. A zoomed work-in-progress frame is not a whole finished page.

Source credits and limits accompany every case. Source pixels and quotations
remain attributable to their respective creators; OMD's MIT license does not
relicense those materials. They are studied locally for source-specific design
analysis and comparison, not as a production asset collection.

## Private by construction

Only this README and the loader (`index.ts`) are public. Case records
(`*.json`) and frames (`media/`) are excluded from Git (`.gitignore`) and from
the npm package (`core/.npmignore`), and consultations record only their
digests in a project's `.omd/` — never the frames. A local install may keep its
private copy here or point `OMD_DESIGNER_CASES_DIR` at another directory. An
install without originals has an empty catalog, and the route does not
advertise one. Tests use first-party synthetic fixtures
(`test/helpers/designer-cases.ts`), never real creator material.
