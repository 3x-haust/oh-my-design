# Locale contract

More than one locale is not a translation task. The same page in another language changes line
length, control width, reading order emphasis, and what a visitor already believes before the first
sentence. This contract states what a multi-locale run owes, and what it may not claim.

## Modes

- `language-only` — same market, same offer, same proof. Only the language changes. Copy is
  rewritten for the language, never machine-translated, but the message ladder is shared.
- `regional` — same product, different operating conditions: currency, address, phone, date, and
  legal notices differ. The message ladder may reorder; it may not gain claims.
- `market-specific` — different offer or audience per market. Each locale gets its own frame and
  its own copy deck, and shares only the design system.

A run declares exactly one mode. Escalating mode mid-run invalidates the copy deck, because the
lower mode's deck was written under an assumption the higher mode removes.

These copy/operational modes do not authorize cultural art direction. Cultural design uses the
separate `.omd/locale-design-context.json` contract. It records conversation language, surface
locale, explicit market region, audience, domain, surface, desired fit, and brand invariants as
distinct fields. A language is not a country, and a locale or likely script never implies a market,
audience, register, or national aesthetic.

An explicit request to study a region's websites or award galleries is a reference-acquisition
preference, not by itself a claim about the destination's market or that audience's cultural fit.
Preserve that preference in current discovery queries. Do not drop it, infer it from language, or
turn it into a country-wide style preset. Script mechanics and the existing target audience remain
separate; a genuine market-fit request still follows the research route below.

## Cultural design routing

The derived locale-design route has exactly three decisions:

- `ask` — explicit market or audience authority is missing. Cultural framing and production stop.
- `mechanics-only` — only script-aware copy and type mechanics are authorized. It makes no market
  or cultural-fit claim.
- `research` — explicit market and audience exist, so current evidence may inform bounded design
  mechanisms for the named domain and surface.

Research produces a content-addressed `cultural-design-profile-v1` bound to the exact context,
brand invariants, type proof, and four evidence lanes: standard, global equivalent or recorded
unavailability, native first-party category evidence, and counterexample. Each design axis is
`supported`, `shared`, `contested`, or `unknown`. Only `supported` and `shared` mechanisms transfer
automatically. `contested` requires an explicit downstream choice; `unknown` transfers nothing.

Evidence-lane names are semantic obligations, not URL labels. A global equivalent is the same
institution or product serving the same named task/category in another locale. A generic home,
news, or institutional page does not qualify merely because its owner matches. Native-category
evidence must expose the same user task in the target market, not merely the same industry noun.
Current bytes prove capture and currentness; they do not by themselves prove task equivalence.

A Scout-selected native reference is a research choice, not a fixed subject constraint. If it has
no verified same-task counterpart in another locale, make a bounded search for another native
first-party source and its genuine cross-locale task pair before declaring the evidence lane
exhausted. Preserve user-required references and the named task, market, and audience; do not replace
those constraints to obtain an easier pair. An English-looking URL that serves the same untranslated
page is not an equivalent. Search results are leads only: reacquire both pages through the native
source commands and inspect their actual language, task, and field groups. Record attempted pairs
and why they failed; one chosen company's missing counterpart does not establish universal absence.
Neither an unavailable lane nor a newly found URL authorizes promoting an unknown decision to
supported or shared without the required captured evidence and mechanism assessment.

A URL and digest typed into a profile are not evidence. Every retained source is first fetched
through `omd locale source-capture`; the host-owned command records the current final URL or exact
unavailability, capture time, context identity, immutable source bytes, and content-addressed
receipt. When a successful source changes bytes across immediate currentness checks, use
`omd locale source-stability`: it captures twice and is the only lane that may record observed byte
instability as canonical unavailability. A later remote check accepts that receipt only while two
immediate responses still disagree; a newly stable source becomes stale and must be reacquired.
Profile publication re-reads those receipt and source bytes. It also hashes the current
`.omd/type-proof.md` bytes rather than trusting the submitted type-proof digest. Missing, changed,
cross-context, or self-attested evidence blocks publication before either profile pointer is written.

Composer, hand, and blind reviewers consume only the source-free current cultural design
projection. They do not receive source URLs, source identities, or the research rationale. This
limits source imitation and prevents a country label from becoming a style preset. Conformance to
the projection means evidence-grounded adaptation, not native cultural correctness. Only blind
ratings from the named target audience may support a cultural-fit claim.

When reference assembly is selected, `.omd/reference-locale-binding.json` additionally proves which
candidate slot uses which supported/shared profile decision. Its private companion binds the exact
captured source receipt; downstream roles receive only the source-free projection. A market-grounded
board with no positive native-category binding does not pass merely because a cultural profile exists.

## Beat binding

Beats are locale-independent. A Beat is the argument the page makes at that point; its wording is
not. Every locale carries the same Beat IDs in the same order, and each Beat has one entry per
declared locale. A missing entry is a hole in the page for that visitor, not a fallback: never let
one locale silently render another's string.

The primary locale is the source of truth for fact IDs. A non-primary locale may not introduce a
fact the primary deck does not carry, because a fact that exists in only one language cannot be
verified by the same evidence.

## Layout expansion

Language changes physical length. The build must hold at the widest declared locale, not the one it
was designed in. Korean to English typically expands; German and Finnish expand further; Japanese
and Chinese contract in character count but need different line-breaking.

The obligations are measurable and belong to the build, not to copy review:

- No fixed-height control may clip its longest declared label.
- No single-line heading may overflow its container at the narrowest declared viewport.
- A control that wraps in one locale must wrap legibly in all of them; a locale-specific hack that
  fixes one language by breaking another is a defect.

## Control state

A locale switch is a preference control, not navigation. It must:

- carry an accessible name that states what it switches, in the language currently rendered;
- expose the active locale by something other than colour alone;
- be reachable and operable by keyboard;
- persist across reload, and survive a hard refresh without resetting to the default locale.

The same applies to a theme control when the run declares one. Preference controls are grouped and
independently reachable; neither may be the only way to reach the other.

## Document signals

Every rendered locale sets the document language on the root element, and each localized route
declares its own title and description. In `regional` and `market-specific` modes the run also owes
alternate-language links between the equivalent routes, and locale-appropriate formats for date,
currency, address, and phone number.

## What a locale run may not claim

- It may not claim a market it has no evidence about. Audience evidence is per locale; a Korean
  audience study does not license a claim about a Japanese buyer.
- It may not present machine translation as authored copy.
- It may not use a flag to denote a language.
- It may not treat the primary locale as complete while another declared locale is a stub.
