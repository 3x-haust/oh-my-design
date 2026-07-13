# Copy deck protocol

`.omd/copy-deck.md` is the sole durable source for copy that ships. Analytical metadata
and headings are English. Actual surface copy and verbatim audience/source quotations stay
in the target language. The writer owns this file; layout and implementation agents consume
it without silently rewriting it.

Use these H2 sections exactly and keep every section non-empty.

## Sources and fact ledger

Use an explicit ledger. Every factual claim that ships references a `verified` ID. `fixture`
rows exist only to test layout density and must never ship as achievements, customers,
prices, certifications, or testimonials. `open` rows are unresolved and cannot support
shipped claims. If evidence is unavailable, write action, label, or recovery copy that needs
no factual claim instead of inventing one.

| ID | Status | Source | Fact |
| --- | --- | --- | --- |
| F-001 | verified | User brief or cited URL | Exact supported fact |
| F-002 | fixture | Density fixture | Clearly fictional layout-only value |
| F-003 | open | Evidence needed from owner | Unresolved fact, not for shipping |

## Audience language

Record cited or verbatim audience language, its source, and the implication for wording.
Keep quotations in the audience's language; never translate them into analytical English.

## Voice contract

Declare exactly one of each required field, then record vocabulary, sentence breath,
terminology, and words to avoid:

- **Audience**: the specific reader and situation
- **Language**: target language code, such as `ko`
- **Register**: the chosen register, such as `해요체`

For Korean, choose one register, read every line aloud, and keep one breath per sentence.

## Surface copy

Give every page or surface its own H3 block with exactly one `Main message`, `Supporting fact`,
`Next action`, and `Claim refs` field. Include real title, body, label, CTA, and representative
data. Do not repeat the same proposition across title/body/CTA. A CTA predicts what happens
immediately after activation. `Claim refs` is exactly `none` or a comma-separated explicit ID
list such as `F-001, F-004`; commentary or garbage suffixes are invalid.

Portfolio and landing heroes state audience value or proven work; they do not narrate the
document or design process with lines such as “과정을 남깁니다” or “순서대로 씁니다.”

## Navigation and actions

List destination, visible label, immediate result, and return/next action for every primary
navigation or case-study path. Labels describe the destination rather than generic intent.

## States and recovery

Declare one field exactly:

- **Interaction scope**: `stateful` | `navigation-only` | `static`
- **Primary copy**: shipped primary-path text
- **Recovery copy**: shipped recovery text, or `N/A — explicit reason`
- **Primary probe**: `.omd/probes/primary.json`, or `N/A — explicit reason`
- **Recovery probe**: `.omd/probes/recovery.json`, or `N/A — explicit reason`

Each of these five fields appears exactly once; duplicates are ambiguous and fail the gate.

`stateful` requires primary and recovery copy plus both probes. `navigation-only` requires
primary copy and a primary probe; recovery copy/probe are N/A with reasons. `static` requires
primary copy; recovery copy and both probes are N/A with reasons. Write error, empty,
disabled, offline, and recovery strings only where the product can actually reach those
states. Never fabricate error or empty UI to satisfy a checklist.

## Humanize audit

Record fact fidelity, five-second scan, one thing per surface, new information versus
repetition, CTA prediction, terminology, read-aloud/register, emotion, and applicable
error/empty/recovery/accessibility checks. This is a review record, not a style score.

The deterministic gate rejects only missing structure, invalid scope/state applicability,
unresolved exact sentinels, and broken explicit fact references. It never judges AI-ness,
sentence variance, common words, perplexity, or whether a claim is semantically true.
An unresolved sentinel is a whole value or marker such as `TODO`, `Label: TBD`, `[TODO]`,
`[PLACEHOLDER]`, or a placeholder comment. Normal copy such as `TODO 목록 보기` or
`TBD라는 약어를 설명합니다` is not a sentinel.
