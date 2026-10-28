# Native visual measurements

## Declaration

A `visual-measurement-v1` packet records browser observations, not a beauty score. A selected type or composition contract mismatch, unreadable contrast, clipped control, missing required view, or incomplete required contract/accessibility coverage cannot be overridden by a reviewer score. A below-12px observation alone is advisory, not a WCAG minimum.

New measured review contracts use `design-quality-contract-v2`. Every axis needs current packet SHA plus measurement IDs covering its mandatory inventories, subjects, view, state, and capture. Typography, spacing rhythm, contrast/color roles, density, hierarchy, and composition are separate axes. Hierarchy, composition, and beauty each retain floor 4; the other eight floors are 3. Historical v1 review parsing remains a compatibility API and is not a conversion to measured evidence.

## Owner procedure

1. Typesetter and Composer place exactly one JSON fence in `## Measurement contract` in `.omd/type-proof.md` and `.omd/composition.md`. Use the closed contracts in `core/measure/contracts.ts`; the offline fixtures show complete inputs. Type families are ordered stacks, assignments are selectors, role sizes are exact px or bounded interpolation between tested breakpoints. Composition declares color consumers, task/utility regions, optional spacing scale and optical exceptions, required order, and viewport claims. `frequentAction` is a committed selector or null. Existing token commits are parsed with the shared token validator.

   Composer judges which visible UI/state paint is necessary to identify a control or state.
   Bind those existing color rows with `contrastKind: "non-text"` and a `background`, `border`,
   or `outline` property. Optional `viewIds` is a nonempty subset of the contract's required
   views, for example a focus-state view; omit it only when the role applies in all measured views.
   Code does not infer necessity from a role name. Undeclared decoration receives no universal
   3:1 requirement. Existing text pairs retain 4.5:1 or the applicable large-text 3:1 threshold.
   Native `contrast-pair` rows identify the declared role and measure actual composited paint
   against adjacent backgrounds at 3:1, preserving inactive-control exceptions. Missing paint,
   complex backgrounds, unsupported colors, border images or unsupported outline geometry remain
   unmeasured rather than passing. SVG/icon strokes and other opaque content require independent
   scoped evidence; computed text color does not prove their non-text contrast. Color alone cannot
   communicate state: the state/access owner still proves a visible or accessible alternate cue.

   Existing region rows may additionally bind a positive `minimumTargetPx` project promise.
   It checks both actual visible control dimensions, not a stylesheet minimum or child icon.
   The saved DOM includes five same-state pointer hit samples for those selected controls;
   missing/blocked samples, noninteractive wrappers and unsupported geometry refuse measurement.
   Inactive controls are explicitly not applicable. These bounded samples do not prove every
   pixel of an irregular hit region, keyboard behavior or touch-device behavior. Independent
   access evidence remains required for those claims and WCAG spacing/inline/equivalent
   exceptions. No default 44px requirement is inferred for every component.
2. The production owner runs:

   ```sh
   omd measure --entry dist/index.html --json
   omd measure --entry http://127.0.0.1:5173 --json
   omd measure --entry dist/index.html --scope .omd/.cache/measure-scope.json --json
   omd first-render check --page dist/index.html --json
   ```

   `--input` cannot import measured numbers or a first-render interpretation. Scope adds probes; it cannot replace required baseline/contract views. A scope is `{ "schema": "visual-measurement-scope-v1", "views": [...] }`; each view has `id`, `viewport`, `browserZoom` (1 or 2), and optionally the existing `ViewState` action/assertion object.
3. Native local HTML is served from an immutable read-only project tree in fresh browser contexts. PNG, precise IR, geometry projection, decoded-pixel hashes, and stability checks belong to the same live state. Failed fonts, unsupported content, budget exhaustion, and unstable pixels are explicit incomplete coverage. An SVG whose sole limitation is opaque internal paint records a subject-bound advisory for independent scoped pixel review, without invalidating unrelated DOM metrics. Its internal paint and salience remain unmeasured, not passing; selected non-text contrast and target contracts still refuse unsupported proof. Canvas, iframe, other unsupported SVG conditions, missing views and unstable capture remain blocking. Model-led integrated final review must judge this advisory from authenticated whole captures; mechanical eligibility alone does not resolve it. Localhost/public URLs are diagnostic-only, even when their pixels resemble a local build. Public requests use the public-network proxy boundary; localhost is same-origin and read-only.
   Native input/select/textarea value glyphs and option paint likewise carry subject-bound advisory limitations only when native text is their sole unsupported condition. Their glyph geometry and text contrast remain unmeasured, not passing; explicit native-text type/color contracts still refuse unsupported proof. Independent review must inspect the authenticated controls. Additional unsupported conditions, real occlusion, clipping, low contrast, budget exhaustion and instability remain blocking. Text with a zero-area CSS paint clip is not visually eligible, including accessible-only labels; this does not exempt required control presence or accessibility behavior. Native fallback/default text is not painted glyph evidence and must not consume its measurement budget.
4. Baseline views are 1280x900 and 390x844. Selected machine contracts add 320px and browser-zoom claims. The disposable Chromium extension uses automatic per-tab layout zoom, then checks the actual layout viewport, DPR, media-query result, and unchanged pinch scale. Unsupported zoom produces a blocking `ZOOM_UNSUPPORTED`; it is never replaced by DPR, CSS zoom, pinch zoom, or a half-width viewport.
5. The reviewer consumes native measurement inventories alongside the exact production images. Numbers do not award a subjective score. A slop dismissal cites current relevant measurements and either measured absence or an applicable owner-authorized exception. `confirmed` means `repair-required`; `dismissed` cannot use `repair-required`. Static pixels cannot disprove behavioral failures.
6. First-render v3 derives task count, task/utility geometry, headings, and findings from verified packets. Empty canvas is not utility area. Purpose comprehension and trust remain qualitative questions. This is feedback, not production-entry authority.

## Executable refusal boundaries

- `measureProject` requires an invocation-bound immutable `ProjectWriteAdapter`; it snapshots source/contracts/build, captures natively, rechecks currentness under the project mutation lock, and moves the current pointer atomically.
- `publishMeasurement` rejects imported/modified capture transactions and recomputes metrics before signing. `loadMeasurement` verifies canonical bytes, native signature, current inputs, PNG/IR receipts and decoded-pixel hashes, then replays metrics and findings.
- `assertMeasuredDesignQualityGreen` requires a verified `MeasurementIndex` and trusted observation/view/policy context. Scores, prose, stale/unrelated IDs, omitted inventory/views, unresolved advisory dispositions, and deterministic RED cannot pass.
- `validateSlopMeasurementDecision` is the read-only integration boundary for the slop publisher. Validate before saving a review or updating a pointer.
- `deriveReviewPolicy` uses the authority-validated source route: ordinary 1 blind; high risk 2 blind plus 1 fidelity; authorized benchmark/release 2 in each of three lanes. Every tier needs deterministic protocol validation. Unmigrated purpose conservatively retains the full legacy quorum. Changing a submitted count does not change policy.
- `selected-with-debt` adaptive graph entries bind the current confidence-debt ledger and expose exact `not-verified` limitations. They preserve stage selection and cannot masquerade as skipped work or approved evidence.

## Storage and interpretation

The atomic `.omd/visual-measurement.json` pointer names an immutable `.omd/visual-measurements/sha256-<byte-sha>.json` record. PNG and raw IR receipts use `.omd/visual-measurement-captures/` and `.omd/visual-measurement-ir/`. All are durable state. IDs bind method, views, PNG/IR hashes, subjects, and metric kind; finding IDs cite those measurements. JSON is canonical with one trailing LF. Artifact hashes and decoded-pixel hashes are distinct.

Exit 0 means complete mechanical eligibility, not terminal approval. Exit 1 means deterministic RED or incomplete coverage. Exit 2 means invalid input/authority or capture failure. No aggregate aesthetic score is emitted.

Current v1 limits are explicit: physical glyph identity is unmeasured; complex backdrops, opacity, transforms, pseudo-content, shadow/opaque content, and native form-value text can require more coverage. Occupancy is a clipped rectangle union; paint ownership is a 16-CSS-pixel grid with a conservative error bound, not exact glyph pixel attribution. Ambiguous repeated subjects are not credited as cross-view matches. Current-process terminal acceptance validates the signed measured packet, independent review lanes, and deterministic protocol through `core/evidence/final-v2-measured-terminal.ts`. Legacy final-review records remain readable but do not claim measured approval.
