# Landing quality development, 2026-09-10

This run develops OMD itself using the user's four project-owned studies under
`.re0/iteration/0.20.0-visual-quality-reset/lap-03-concepts/`. They set visual ambition; the user
did not choose a single image for literal reproduction. The public
[landing fixture](../evals/landing-quality/prompt.md) uses current OMD product facts and asks for a
complete, working page. It is development evidence, not a held-out benchmark.

The interface must carry a content-grounded idea through its entry, explanation and installation
flow. Review applies the existing six independent design-quality axes, including their individual
floors and desktop/mobile evidence. Passing behavior or matching a reference does not compensate
for weak visual design. There are no human ratings in this run and no human-equivalence claim.

## Native execution

The experiment uses a frozen copy of this package, its native Codex launcher, owner transactions,
study helper and renderer. The model setting is inherited without invocation or role overrides.
The fixture project is separate from the dirty development worktree so package changes cannot
silently change the runtime being evaluated or interfere with production ownership.

The first launch rejected a stale globally installed skill. The next used a temporary installation
but read a global non-OMD helper skill; that attempt was stopped and excluded. The subsequent fresh
project uses only the bundled OMD skill installation, with external skills, plugins and MCP services
disabled in its temporary host configuration. The user's normal configuration is unchanged.

Run records remain in `/private/tmp/omd-landing-quality-20260910.95vLkc/`. Authentication/configuration
files are private execution inputs, never evidence to copy into a report or output package.

## Reproduced and repaired defects

| Observed defect | Repair and verification |
| --- | --- |
| The keyboard check compared the first matching DOM tag with the active element. A hidden menu item or disabled control before a working button caused a false failure. | Inspect the element reached by a real Tab press. A page with no reachable control still fails. |
| Labels crossing a vertical viewport edge failed even when ordinary scrolling could reveal them. | Distinguish a scrollable document from a fixed or genuinely clipped label. Fixed clipping, non-scrollable ancestors and a document with scrolling disabled retain failure coverage. |
| Access and safety findings were discarded while only a pass/fail flag survived. | Preserve localized diagnostic codes in the signed transcript. The receipt parser rejects free prose and a diagnostic that contradicts a passing floor. |
| An opacity-zero success message passed because DOM visibility did not establish a rendered result. | Check the target's current geometry/visibility and ancestor opacity. Both an invisible target and an invisible ancestor fail; a real transparent-to-visible transition passes. |
| A frame-scheduled feedback animation was captured before it finished. | Wait for fonts, frame commits and finite CSS/WAAPI animations before assessing the current result and capturing. A real PNG pixel test reproduced an almost-white intermediate frame and verifies the settled green result. This does not claim arbitrary later timers or infinite JavaScript animation have finished. |
| The live coordinator reclassified its route while Framer was active. The host then rejected Framer's publication because its route/source/authority binding had changed. | The broker rejects reclassification until active owners return. A real IPC regression verifies the unchanged route, allowed reads, successful owner publication, and an allowed subsequent route change. |
| The authority client hid that specific rejection behind a generic project-write error. | Preserve a bounded diagnostic from the broker without treating it as authority or weakening any receipt validation. |
| Scout's explicit inherited activation was forwarded unchanged to a brokered browser with its own activation. A correct request therefore failed before reference publication. | Validate the caller's explicit activation against its live role, then bind the browser command to the browser child's issued activation. Real local-page capture passes with both explicit and implicit transport. Coordinator paths and duplicate options fail. The role handoff now explains that activation is process-local. |
| The one-sentence run had no native search binding and tried rendered Google/Bing result pages, receiving blocked or empty pages. | Scout now receives native live search by default. Explicit host modes remain authoritative; unknown project/profile layering is inherited rather than guessed. A real broker regression verifies the Scout argv and unchanged local capture path. Actual live discovery remains a separate native-run check. |
| The role sent the browser health check to the engine CLI, where no `browser` subcommand exists. | The handoff names the issuing package's installer entry point for this read-only check. Shell-quoted executable tests cover both engine and installer without relying on PATH. |
| Initial route errors omitted allowed vocabulary or the missing item, prompting implementation-code inspection. | The public schema now lists expression axes separately from register, optional accounting names and applicable attribution order. Failure diagnostics name the missing method/stage or exact required category list without changing acceptance. |

The browser regressions are in
[landing access](../test/trusted-browser-landing-access.test.ts) and
[rendered result state](../test/trusted-browser-render-state.test.ts). Native and `.mjs`/tsx execution
are both covered by the related lifecycle tests. The route concurrency regression is in
[host launcher tests](../test/codex-host-launcher.test.ts).

## Current evidence

The initial repository suite completed with 2,480 tests: 2,478 passed, zero failed and two skipped.
The next full run completed 2,492 tests with 2,489 passes, one failure and two skips. The failure was
the coordinator prompt budget, not a browser test. Compact wording restores the existing 3,000-token
ceiling without changing it; all 101 prompt/brief tests pass. The current browser/lifecycle integration
group passes all 40 tests, and the latest three host transport tests pass, including actual reference
capture. The suite before automatic-discovery changes completes 2,493 tests: 2,491 passed, zero failed and two
skipped (`/private/tmp/omd-quality-current-tests-02-20260910.log`). TypeScript and package generation
also pass.

The fresh native run produced and rendered provisional HTML studies. Inspection found weak
annotations in one direction and a misleading appearance of a compulsory sequence in another.
These studies are neither accepted production nor evidence of improved final visual quality.
The native coordinator retained those findings. That run stopped before production after the Scout
transport failure. A later coordinator attempt to substitute the outer activation was also rejected;
that attempted workaround was incorrect and is not retained. The first failure was reproduced in a
real host/CLI regression and fixed in the package. A fresh frozen-build continuation captured real
references and rendered more studies. It was stopped when the user changed the request to a Korean
landing page and, more importantly, automatic high-craft reference discovery without supplied URLs.
The English studies remain comparison material, not accepted production.

## Automatic discovery without user-supplied references

The user clarified that the [Korean request](../evals/landing-quality/no-reference-ko.md) must contain
only its first sentence: ask for an OMD Korean landing page from the current README. The interrupted
four-sentence attempt included ambition, motion and mobile requirements, so it is not evidence for
this stronger requirement. The next run supplies only that sentence and the README: no execution
prompt restates the desired research, quality, interactions or verification. The outside evaluator's
[development contract](../evals/landing-quality/no-reference-ko-contract.md) stays outside the native
project. This tests installed harness behavior rather than a curated prompt.

`omd ref discover-plan --json` now derives read-only acquisition input from the authenticated route,
the explicit request, current locale context and Framer's decision questions. Task anatomy and
visual craft are separate discovery lanes. Selected motion requires motion evidence even when the
optional domain stage is absent. A static capture fails that floor in a real brokered Scout/CLI test.
The Scout brief exposes the plan; production and judgment briefs do not receive raw discovery data.
Balanced new marketing work also investigates a motion candidate before art direction settles, without
creating a production scene or motion lock. Restrained and ordinary operational surfaces do not gain
an award-gallery or decorative-motion obligation. The pre-route native protocol now explicitly owns
short-request completeness, target-language mechanics, responsive behavior and quality defaults.

Scout's source instructions now require current search, live inspection and measured transfer from
the chosen references, including motion triggers and timing when selected. Gallery names are lead
directories, not prescribed winners or quotas. Explicit reference affinity can guide acquisition,
but the one-sentence fixture supplies none. Korean text alone does not establish a target market or
a cultural-correctness claim. Query prose
remains disclosed provenance, not a cryptographic search receipt.

A separate early Framer check rejects source-bearing acquisition states and falsifiers before
Scout publication. Exact product facts remain in facts and functional requirements. The check uses
the same existing source-free boundary as the reference board, including its measurement exception;
it does not whitelist the runtime name that exposed the late failure.

The corresponding focused group passes 110 tests, TypeScript passes and package generation succeeds. Run 06
started from the frozen package with `project-ko-minimal/README.md` as its only initial project
file and the one-sentence fixture as the entire stdin prompt. No outside evaluation contract or
execution prose was injected.

## Native search and image-first default

Run 06 proved that the one-sentence request selects all four discovery lanes, but it did not complete.
Its initial Scout retained genuine first-party paired captures and reported failed search acquisition.
The coordinator later tried known reachable sources; those captures do not retroactively establish
successful current search. The run was stopped before production when the user explicitly requested
native image generation as the more direct concept-exploration path.

The current pre-route contract checks image capability before selecting experiments. Unsettled
marketing uses a callable native image tool by default, including in an OMD-only invocation. Early
first-party images may run alongside reference/copy owners, without impersonating their approvals.
Selected reference evidence and approved copy/type must reconcile with the chosen images before
production. HTML studies remain available for an observed image-tool fallback or an implementation
risk; they no longer silently replace a working image lane. No new user API key, image-model override
or separate image CLI is introduced. The generated mockup never ships as a page-sized bitmap.

Run 07 uses a new frozen package and fresh `project-ko-07/` containing only the unchanged first-party
README. The stdin prompt is still the same 83-byte sentence. It has automatically selected
`image-first-draft`. Scout issued real native web searches beginning at 05:30 UTC, including task,
gallery/craft and Korean-mechanics queries. At 05:33:55 UTC, the coordinator called the built-in image
tool twice with its own recorded prompts, and preserved both actual images under its project cache.
The hashes are `fb6df5ca16cc274e632c87228ce479b82554b398140e02d1493a7bb823552329` and
`621a002b238b3c643b29a1a261a5ac9edcfef0d67f7bcb7e4b42224275f775da`. It provisionally preferred the
return-path typography relationship and began separate middle/end images to test continuity.
This establishes that the one-sentence run actually invokes search and image generation; final
production, preserved visual quality and independent review are still pending. No reference, image
or recipe from an earlier run was supplied as its input.

Before native-search/image changes, the full suite completed 2,507 tests: 2,505 passed, zero failed,
two skipped. The subsequent native-search focused group passes 106 tests, its real host integration
group passes three, and image-first/default prompt coverage passes 116. TypeScript and package
generation pass. The full combined-source suite completes 2,513 tests: 2,511 passed, zero failed,
two skipped (`/private/tmp/omd-quality-current-tests-06-20260910.log`). None of these counts is a
visual-quality or human-equivalence score.

A separate [built-in image capability probe](../evals/landing-quality/imagegen-host-probe.md) produced
an actual image in this Codex host. It is explicitly rejected as a design direction and was not fed
into Run 07. The probe tests tool operation, not automatic harness use or design quality.

### Human response to the provisional image

The user saw Run 07's return-ribbon concept and reported that it still felt AI-generated rather
than authored. This is direct, non-blind feedback about that image, not a population rating or a
provenance detector. It invalidates treating the provisional preference as an accepted visual result.
The [exact feedback](../evals/landing-quality/human-feedback-ko.md) is retained separately from the
original one-sentence fixture. The intended continuation sends only this actual message and the
same viewed image through the native host, without the outside evaluator's diagnosis or a style
recipe. Acquired references remain usable subject to their current native checks.

The first phase proves actual default search and image-tool use, not an unassisted final quality
success. Any later result using this feedback must be identified as a human-guided iteration.
The current image's visible large proposition, broad return shape and four small process labels
support the outside evaluator's concern that abstract process symbolism dominates concrete product
material. That is a localized design hypothesis to test, not a ban on green, large type or curves.

The initial Scout published a valid board at 05:46 UTC but hit its 20-minute execution limit before
completing its durable summary. A bounded native Scout completed that existing handoff and returned
a successful signed role result at 06:01 UTC. The timed-out run remains failed; no root-written
reference summary or reconstructed owner judgment replaces it.

The coordinator was then stopped before visual selection and resumed at 06:02 UTC through the same
native host/session, with the exact human feedback as stdin and the actual `concept-b.png` attachment.
The frozen runtime and acquired project files were not rewritten by the outside evaluator. The
feedback phase is recorded separately from the unassisted one-sentence phase.

### Overall rejection, not another local edit

The user rejected both revised images as well, explicitly including decoration, typography and the
overall impression. The [second message](../evals/landing-quality/human-feedback-ko-2.md) is retained
verbatim. The preceding native reviewers had conditionally preferred the typographic revision, but
all said that neither image fully resolved the complaint. That relative preference is not acceptance,
and it cannot override the current user. The coordinator was stopped before production.

The observed defect is anchoring: the native edit prompts fed the rejected ribbon image back into
generation while explicitly preserving its palette and large Korean type. The two revisions changed
the amount of decoration without reopening those unaccepted choices. The native image protocol now
distinguishes local repair from whole-direction rejection. The latter generates fresh concepts without
conditioning on rejected images, keeps factual/task evidence and explicit invariants, and revisits only
the implicated craft gaps. Observed first-party example tokens no longer masquerade as immutable brand
requirements. Accepted targets and bounded image edits retain their unaffected relationships; no colour,
font, layout family, score or country aesthetic is banned or prescribed.

The coordinator receives a concise rejection-route pointer; its prompt remains within the unchanged
3,000-token ceiling. Three source-contract regressions cover reopening, accepted-target preservation and
evidence/invariant boundaries. The focused group passes 106 tests; TypeScript and package generation
pass. These tests verify delivery of the instructions, not human taste or successful visual repair.

Run 08 began at 06:30 UTC from a new frozen package and a fresh native coordinator, reusing the existing
project's acquired material. Its [input](../evals/landing-quality/human-guided-restart-ko.md) contains only
the original request and the two actual feedback messages, with the three seen images as rejection
context. No outside-selected reference, art-direction recipe or expanded implementation brief was added.
It reads the updated installed skill. Actual targeted research, fresh image generation, production and
final review remain to be observed. This is a human-guided continuation, not a new unassisted benchmark.

Final production, current independent rendered review, full current-source checks and terminal
preflight are still required before this experiment can be reported complete.

## Reference verification after the third visual rejection

The user's next feedback rejected the new images and asked to verify acquisition correctness,
actual reference use and similarity. Run 08 was stopped after its active Scout completed its
targeted research. No image was accepted and no production owner had run.

Inspection found a concrete transport defect: blueprints discarded measured x/y coordinates, while
the neutral visual packet reconstructed placement heuristically from dimensions. The source now
retains component-relative coordinates through sanitization. The visual packet uses those coordinates
with one uniform scale and fails on legacy missing positions instead of inventing a layout.

`omd ref verify [page] [--candidate id] --json` is a read-only source-aware diagnostic. It exposes
the original scoped capture and hash, viewport, acquisition gaps, promised axis/falsifier, and (for a
runnable target) measured source/target geometry. It explicitly leaves semantic state inspection
unresolved: a hash or author-written `featureObserved` flag is not an independent visual assessment.
For v2 geometric influences, the selected-distance gate uses the promised measured axis, with the
style-only score separately labelled. Content, voice and rejection do not pad layout comparisons.
The geometry numbers are role/area-rank diagnostics, not perceptual percentages or beauty scores.

A real Chromium regression uses two separately rendered fixtures with identical copy, typography,
dimensions and styles but opposite heading/image placement. The old style metric returns 1 for
both; the geometry check detects the changed structure below the existing 0.6 gate. Other tests
cover uniform scale, missing positions, missing anchors, missing rhythm and forged score fields.
The focused group passes 126 tests. TypeScript and package generation pass. Two previous full-run
transport failures passed isolated reruns; the abandoned-FIFO
test now measures host service after the next request is actually queued, independently of CLI
startup time, and asserts the observer really saw the service event.

Applied to the existing selected `evidence-spread` board, acquisition verification returned five
unmeasured geometry slots and one non-layout voice slot. This is an honest legacy-data failure,
not a finding that those sites are invalid. Visually inspecting the Vite intro, Helix article and
Goose feature cards also showed why task-anatomy evidence alone did not establish the requested
visual craft. The new protocol requires that distinction and visible transfer inspection before
further generation after repeated rejection. Final blind quality review remains independent.

Run 09 started with a new frozen runtime and the existing project. Its
[input](../evals/landing-quality/human-reference-verification-ko.md) contains the original request
and the three actual human feedback messages; the rejected images are context, not approved targets.
The coordinator receives no root-selected reference, hidden layout recipe or fabricated evaluation.
This remains a human-guided continuation, not an unassisted first-shot quality result.

The first full run after these changes finished with one missing-capture fixture failure. That
fixture had discarded the CLI exit status, so its assertion now includes the actual capture error
without relaxing acceptance. Its isolated 16-test file passed. The subsequent full `npm test` run
passed **2,526 tests: 2,524 pass, 0 fail, 2 existing conditional skips** (686.5 seconds). TypeScript,
build and `git diff --check` also pass. No cause is inferred for the earlier transient failure.

The native Run 09 coordinator actually executed the new acquisition diagnostic and opened seven
source PNGs before recording its source-aware findings. It paused generation, delegated the framing
repair, then ran Scout and Writer concurrently. Fresh desktop/mobile captures now contain measured
positions on every blueprint node; source mobile defects are explicitly excluded from transfer.
The native audit is `.omd/.cache/reference-review-before.md` in the experiment project. It is a
failure analysis of B–F, not a new production-quality verdict. Production and final review are pending.

The visual-packet regression additionally checks explicit projected coordinates against a known
offset fixture, preserving uniform scale instead of the former guessed flex layout. A freshly
hash-bound legacy capture still fails for its missing child position; stale hashes cannot mask
that assertion. The nine-test influence-contract file passes with these assertions.

The first Run 09 Scout timed out after publishing current captures and the board, while its only
durable synthesis still held scratch JSON. A bounded Scout publication pass completed the synthesis
without new capture or reconstructed judgments. It explicitly reports unavailable earlier search
strings; source capture provenance survives, but complete search/rejection provenance does not.
The coordinator then selected `asymmetric-adoption`, generated four current source-free geometry
packets, and included actual measured ratios in new native image prompts. It did not accept either
resulting image: excessive type weight and an uninformative matrix remained visible. The next native
step is a runnable real-font study, not promotion of those images to production or a fidelity pass.

That study was rendered at desktop and mobile. Its folded-band hypothesis degraded to a circular
arrow with overlapping low-contrast labels. The native coordinator rejected it. The measured
comparison also demonstrates an important limitation: the introduction preserves the actual
418px/656px column widths, 86px gap and 1160×533px group, but its whole-component proportion
diagnostic is 0.188167 because the leaf correspondence changes with the new content. That number
must not be described as the percentage of the promised column relationship preserved. Exact
feature inspection and independent visual review remain necessary; the aggregate is not a
semantic-transfer oracle.

The provisional Eye returned `UNCERTAIN` with zero inspected images: its final-production pixel
isolation rule was applied to an ordinary study audit without that final transport. The role and
protocol now distinguish explicitly supplied first-party preproduction renders from host-isolated
final/refinement evidence. Final pixel restrictions and bound publication contracts remain intact;
provisional findings cannot satisfy them. All 112 focused prompt/contract tests, TypeScript and
build pass. The full suite after this clarification completed 2,527 tests with 2,523 passes,
one screenshot-capture failure, one cancelled process-timeout test and two skips. Both affected
test files then passed together in isolation (eight tests). This does not establish the cause of
the full-run failures. Subsequent complete runs passed: 2,527 tests (2,525 pass, two skips),
then 2,529 tests including the PID-observer regressions (2,527 pass, two skips).

Run 10 resumes the same native conversation through a new frozen runtime after Run 09 finished.
Its stdin repeats only the original one-sentence landing request; prior real feedback, captures,
studies and failure records remain in that conversation/project. No root-authored visual recipe
or replacement owner judgment is added. The coordinator generated two more images and rejected
their category/headline hierarchy and placeholder content before commissioning actual-font HTML
studies. Both were rendered at desktop/mobile and compared against the current references. The
current native comparison sent all eight entry/continuity images to separate UX, art-direction
and production perspectives. Native image-viewer calls are present in the actual reviewer runs;
the provisional pixel-access repair is exercised, not inferred from prompt tests. UX and production
support conditional continuation of the quiet candidate, while art direction rejects both candidates:
the comparison diagram leaves the selection basis/review connection unclear, and the annotation
margin remains a conventional process list. These are distinct preserved judgments, not a majority
approval. Neither study is accepted production. Production and final review remain pending.

While investigating the intermittent process-test timeout, a new immediate-write test reproduced a
missed directory notification before the numeric PID was observed. The test observer now polls
the sentinel contents at a bounded interval and rejects empty, non-decimal and process-group PIDs.
The real provider's 1,200ms timeout and process-reaping assertions are unchanged. This is test
infrastructure, not a change to browser health-check acceptance. All six tests in that file pass,
including the immediate-write regression; the earlier full-run screenshot failure still has no
established cause.

The native source-aware audit inspected the eight used visual slots against the actual I/J
captures and retained per-slot source suitability, target scope, visible transfer, evidence and
owner action. Three named relationships are visibly present (intro proportions, Korean type
hierarchy and title/body/action spacing); five are partial. Crucially, the process source was
misinterpreted: its columns are step, agent role and user role, not condition, action and review.
The coordinator returned that semantic mismatch to Framer. The audit also distinguishes genuine
installation alignment and mobile-navigation departures from low aggregate scores caused by
different content lengths or descendant roles. Exact mobile measurements and current final
receipts are still unproved. Its retained result is
`.omd/.cache/reference-comparison-scope-audit-result.json` in the native project.

### Declared relationship measurements

The observed correspondence problem is now handled by an optional, source-bound
`binding.measurements` contract. The Scout declares captured blueprint node indices and meaningful
destination groups before production. The renderer reads the actual boxes and computed font sizes
from `data-omd-reference-anchor` counterparts inside the complete assigned target scope. The existing
board, selection, usage and selected-distance records carry those definitions; no new publisher or
owner exception is introduced. The source-free projection keeps numeric correspondence but no source
URL, copy or typeface.

The selected gate compares the weakest declared quantity while retaining whole-component geometry
and style similarity separately. Its threshold is unchanged. Values and scores are recomputed from
both witnesses; changed definitions or source measurements cannot reuse a receipt. Missing, duplicate,
out-of-scope, transparent or empty counterparts fail, including the complete `@root` scope. This
measures only the named quantity, not whether the author chose the correct semantic group, whether
every promised relationship was declared, visual quality, or unmeasured responsive states. Source-aware
inspection and the other required viewport/quality evidence remain necessary.

Real browser fixtures independently retain 418px/656px groups with an 86px gap, 52px/16px type, and
12px/16px title/body/action intervals across different copy, line counts, wrappers and extra content.
The comparator reports those actual quantities as preserved. Separate rendered counterexamples swap
the column proportions, halve the display size and triple the gaps; the respective quantities fail.
Additional real browser tests reject transparent ancestry, duplicate markers and an external convenient
counterpart. A real selected CLI test supplies a valid fixture-only claimed influence, then still fails
the wrong page from its measured result. It also rejects changed correspondence and source witnesses.

The focused group passes all 141 tests; TypeScript, package generation and `git diff --check` pass.
A full run passed for the measurement change: 2,540 tests, 2,538 passes, zero failures and two skips
(`/private/tmp/omd-quality-current-tests-16-20260910.log`). Run 10 used its prior frozen runtime;
the new contract was not yet exercised by that native landing run. Its existing source-aware audit
did lead to genuine owner repairs: the misread table was replaced with README content evidence, and
the toolkit source was recaptured as the complete equal-rank primary group, with all six destination
skills still required. Production and final visual acceptance remain unclaimed.

Run 10 also reproduced two English-substring gates that caused repeated reviews of unchanged
renders. A complete macro description failed without the words `template`, `departure` or `break`.
A concrete nonwinner rejection failed because it discussed insufficient `restraint`, even though
that was not the reason to omit motion. Those lexical tests are removed; required nonempty contracts,
authoritative evidence, motion dispositions, source bindings and final rendered review remain.
Whether a rationale is generic is still a contextual review obligation, not a word blacklist.
Korean/English positive cases and missing-text/reference/fallback negatives pass in the 22-test
art-direction suite; its combined preproduction-contract group passes 31 tests. TypeScript and build
pass. The complete suite including this last correction passes 2,541 tests: 2,539 passes, zero
failures, zero cancellations and two existing conditional skips (762.3 seconds;
`/private/tmp/omd-quality-current-tests-17-20260910.log`).

After all Run 10 role calls completed, its coordinator was stopped before production. Run 11 resumes
the same conversation/project on the new frozen package, again with only the original one-sentence
request as stdin. Completed source repairs, captured studies and signed reviews remain available.
No root-authored visual recipe or replacement judgment is supplied. Its current authoritative
art-direction publication now passes. The native coordinator independently invoked Scout for the
declared-feature binding pass before production; that call is observed, but its completed board and
actual target measurements remain pending. Production and final quality evidence are still pending.

The native Scout has since completed that binding pass through the normal board publisher. Six
visual slots now carry 20 named quantities; toolkit retains whole-component density, and the two
content-only slots do not pad visual measurements. Both acquisition verifications pass. The prior
selection becomes stale as expected and must be refreshed by its coordinator. Applying the new
contract to the old study rejects its missing counterpart markers; this is not production evidence.

A read-only check of the old study's complete six-skill group exposed another metric error. It
compares 13 source anchors with 18 target anchors, only six matched by HTML role. Multiplying that
coverage into density reduced the occupied-area agreement from 0.844298 to 0.281433. Density now
compares union occupied area alone; role matching still affects structure/proportion and remains
explicitly reported. No threshold, scope, content requirement or semantic/visual gate is relaxed.
The old study remains unaccepted and these figures do not establish reference use or visual quality.

A separate browser fixture holds occupied area at 25,600 of 80,000 CSS square pixels while changing
both item count and heading/text markup: density agrees, while structure still fails. A sparse
counterexample retaining only a quarter of that area scores 0.25; a forged density score fails receipt
recomputation. All 15 focused geometry/fidelity/selected-CLI tests pass, TypeScript and build pass.
The complete suite passes 2,542 tests: 2,540 passes, zero failures/cancellations and two existing
conditional skips (656.6 seconds; `/private/tmp/omd-quality-current-tests-18-20260910.log`). This last
correction is not part of the still-frozen native Run 11; no active runtime or private host
installation was mutated.

Run 11's Writer and independent copy reviewer completed. Its Typesetter produced real-font
specimens, fixed/mobile/narrow captures, fallback checks and IR, but hit the 20-minute role limit
before writing the durable proof. The signed result is `ROLE_TIMEOUT`, not approval. After that
owner had exited, the paused coordinator was stopped and Run 12 resumed the same conversation
and project with the corrected frozen package and original one-sentence stdin. Existing measurements
remain owner input, not a root-written replacement proof. Production and final verification remain
required.

Run 12's bounded Typesetter closure completed the durable proof from those existing records.
Its fresh blind typography Eye then inspected 13 specimens and returned `REVISE`: the selected
12px commands were materially less legible than the alternative's larger wrapped commands.
The coordinator delegated a bounded command-only repair, preserving the approved proposition and
productive roles. The warning-free typography counters had not established readable commands;
actual independent render inspection caught the problem. This is still preproduction evidence.

The bounded repair raised command text to 16px desktop and 15px mobile, retained exact clipboard
bytes, and regenerated affected narrow/fallback specimens. A fresh typography Eye passed that
revision. Composer then completed its owner-authored contract and passed `composition --check`
with no findings. Its two structural candidates keep the approved introduction fixed and compare
broad sequential sections with an indexed reading column. No candidate winner or production quality
is established by these preproduction checks; production-source type binding, actual reference
measurements, browser evidence and final independent render reviews remain pending.

## User-rejected copy and web-writing research

The user subsequently rejected the copy itself and explicitly requested web research into
copywriting methods and their application. That reopens the message choice regardless of the
earlier copy approval. Both Run 12 sketches returned source, but sandbox-denied Chromium prevented
their captures and measurements; neither is accepted evidence. After their owner calls ended,
the paused coordinator was stopped and all owned processes exited. No production source had shipped.

Research and source changes are recorded in `docs/web-copy-research-20260910.md`. The bounded
133-test group, TypeScript and build pass; full-suite Run 19 is in progress. New frozen Run 13
resumes the same project/conversation with only the user's latest copy-feedback text as stdin.
This is an explicit new instruction, not an altered hidden benchmark recipe. Native Scout,
Humanize and Writer are to revise the real deck; the root does not write the owned copy artifact.

Inspecting the actual sketch task also exposed an instruction contradiction: the coordinator was
required to append the source-aware stage brief unchanged, reintroducing reference identity and
old rationale after preparing sanitized inputs. The coordinator now treats that brief as intake
and supplies only the role-permitted projection. The Hand instruction to reopen the raw brief
was corrected too. Required evaluator lineage, checks, blockers and public schemas still travel;
these changes do not alter source-free judgments or weaken their evidence requirements. This is
a corrected handoff policy, not a claim of new host-enforced isolation for provisional roles.

Run 13 acknowledged the new copy request but then resumed the obsolete sketch-selection sequence.
Its selector returned no winner; that old-copy evidence is not acceptance of the new request.
The coordinator was paused before production and stopped after its reviewer exited. Run 14 uses a
fresh conversation, the same frozen runtime/project, and only the two actual user instructions
(original README landing request and current copy-feedback request). It performed web research and
its Writer completed a reconstructed deck, three message angles and an actual application map.
The current opening offers delegated design review rather than abstract evidence-led judgment.
Independent copy review, current typography/composition, production and final evidence remain pending.

Full Run 19 completed 2,547 tests with 2,542 passes, three failures and two skips. The three failures
were old prompt assertions requiring the raw brief to be forwarded unchanged or reopened by Hand;
they were updated to verify the new canonical handoff boundary instead. The expanded focused group
passes all 146 tests. Full Run 20 passes the current complete test/source set: 2,547 tests,
2,545 passes, zero failures/cancellations and two existing conditional skips (558.6 seconds;
`/private/tmp/omd-quality-current-tests-20-20260910.log`). TypeScript and build also pass.

Run 14's independent copy Eye received surface strings, facts and voice without the writer's
audit/strategy rationale. It returned CLEAN with an offer/task/action comprehension summary and
explicitly limited its verdict to text. Current-hash review publication and `copy --review-check`
pass. The native Typesetter is now reproving changed text; its earlier approval does not cover
these new strings. Production and final rendered quality remain pending.

## User-rejected empty-looking UI and hierarchy

The next user feedback was: “ui에 뭐가 아무것도 없는데 이건 사람이 한 디자인이 아니라 그냥
글자만 박아 넣은 것 같아” and “위계도 좆같이 구리고”. The root had displayed typography
specimens while the actual landing page still did not exist. Those specimens demonstrate only
type mechanics. Presenting more of them does not answer a request for a designed interface.
The visible-delivery failure must not be reframed as a successful UI with a minor copy problem.

Run 14's coordinator was paused before it could continue the old composition. The remaining
Typesetter was interrupted and returned a signed failed result; its new specimens, observations
and role projection exist, but the durable proof still contains the previous revision. These
records do not accept page-wide hierarchy or the old visual direction. All owned processes then
exited, and the temporary host authentication copy was removed. A fresh native invocation is
prepared but was not launched while the overall goal is paused. Its input contains the original
request and actual successive user feedback, without a root-authored visual recipe. Useful factual,
copy and reference evidence can remain evidence; unaccepted composition and visual choices are
not user invariants. The next result shown as a landing must be a real page render, not a neutral
font specimen or a test counter.

The read-only critique check also exposed an input-scope limitation: `omd check --json` without
an explicit target reads the shared cached IR, which currently belongs to an acquired reference
page, not the requested landing. Its findings are therefore excluded from this UI diagnosis.
No violation count, contrast number or typography ratio from that cache is claimed for the
destination. Production review must use the exact destination and current capture lineage.
