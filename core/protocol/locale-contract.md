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
