# Components — decision material

A component is not a widget. It is the materialisation of a decision about what a
particular kind of interaction should feel like. The button is not a rectangle with a
label — it is a commitment about hierarchy, risk level, and action weight. Get the
component wrong and you get the interaction wrong regardless of how well everything else
was designed.

---

## Buttons: hierarchy and the destructive case

Buttons communicate hierarchy before the label is read. The visual treatment — fill, stroke,
or text — signals importance. The order is not convention; it is a reading rule.

**Primary (filled)**: the most important action on the current view. There should be at
most one primary button per context. Two filled buttons of equal visual weight cancel each
other — the user cannot tell which to press, which is the same as not telling them at all.
Material Design and Carbon Design System both specify single primary-per-view as an
explicit constraint, not a preference.

**Secondary (outlined or tonal)**: an alternative action — not less important in absolute
terms, but less important than the primary in this context. A "Save Draft" alongside a
"Publish" is a secondary. An "Export" alongside a "Save" is a secondary. The outline
signals presence without competing with the fill for attention.

**Tertiary (text or ghost)**: low-stakes or escape actions. "Cancel," "Back," "Skip for
now" — actions the user needs available but should not be nudged toward. The absence of
visual container makes these recede from attention deliberately.

**Three tiers is the ceiling.** Four button types on one screen is four sentences spoken
simultaneously. Helios Design System (HashiCorp) and most mature design systems cap
hierarchy at three tiers. If the design requires a fourth tier, the problem is not a
missing button variant — it is too many actions on one view.

**Destructive actions sit outside the hierarchy and require explicit treatment.** A
"Delete," "Cancel Subscription," "Remove Account" action should never be styled as a
primary button unless deletion is the only thing the current view exists to do. The
destructive variant — typically a red or amber filled button — communicates risk at a
glance. Position destructive buttons away from the primary CTA: the spatial separation is
the last friction before an irreversible action. The Carbon Design System specifies a
"danger" semantic variant with its own colour role precisely because the danger cannot be
communicated by label alone — a user scanning quickly will press the large filled button.
If that button is "Delete," the fill is a trap.

Condition → choice → reason: when a view contains a destructive action, create a dedicated
destructive variant (never reuse primary styling), position it away from the primary CTA,
and consider a confirmation step for irreversible actions.

---

## Form inputs: validation timing

Inline validation — showing error or success state as the user types — changes
completion rates, but timing matters more than presence.

Validating on each keystroke is the worst option. The field fails before the user has
finished typing the correct answer. An email address field that flags an error after "user"
(before "@domain.com" is typed) teaches the user that the form is hostile. The error state
is wrong, and the user did nothing wrong.

Validating on blur (when the user leaves the field) is the standard and usually correct
timing. The user has completed their answer; now the system responds. Errors are surfaced
at the moment they can be acted upon, without interrupting the act of entering them.

Validating only on submit is appropriate for short forms (2–3 fields) where the
relationship between fields matters (password and password-confirmation must match). It is
wrong for long forms — an error at the top of a 20-field form that only surfaces on submit
sends the user back to the beginning.

The Baymard Institute's form usability research (baymard.com, "Avoid Extensive Multi-column
Layouts") documents the failure mode: inline validation errors that fire too early increase
form abandonment rates because users interpret them as the form rejecting valid input.

Condition → choice → reason: validate on blur for single-field validation; validate on
submit when validation requires cross-field data; never validate on keystroke unless the
field has a live counter (character limit, password strength meter) where the feedback is
progress information rather than error state.

---

## Navigation: Miller's Law, misused

Miller's Law — "The Magical Number Seven, Plus or Minus Two" (Miller, 1956, Psychological
Review) — established that working memory can hold approximately 7 items at once. It has
been misused as a design rule for navigation: "keep navigation under 7 items because of
Miller." This is a misapplication.

Miller's original finding was about chunking in working memory under experimental
conditions, not about navigation comprehension in visual scanning. Navigation items are
not memorised serially — they are scanned visually. The eye finds familiar labels through
pattern recognition, not sequential recall. A navigation bar with 8 items is not harder to
use than one with 7 because of working memory limits; it is harder to use if the visual
weight is too high, the labels are ambiguous, or the hierarchy is unclear.

The legitimate constraint is visual: navigation items compete for attention with the
content. Too many items reduce the available space per item, force abbreviation or wrapping,
and reduce the visual weight of each label below the scannable threshold. The practical
ceiling for top-level navigation is 5–7 items — not because of Miller, but because above
that count, the labels are too compressed to scan reliably at normal reading distance.

**Mobile: bottom tab bar vs hamburger menu.** Research (NN/g, "Hamburger Menus and Hidden
Navigation Hurt UX Metrics", 2016) measured the effect of hiding navigation behind a
hamburger icon: discoverability, engagement, and user satisfaction all dropped when
navigation was hidden. Bottom tab bars — persistent, always-visible — produce higher
engagement with navigation items than hamburger menus, because visible options are more
likely to be used than hidden ones. The tab bar is the better choice for the primary
navigation of any mobile product where the user's destination is not always the same.
The hamburger is legitimate for secondary or overflow navigation — options that the user
knows to look for but does not need on every session.

Condition → choice → reason: use a persistent bottom tab bar for the 3–5 primary
destinations of a mobile app; reserve the hamburger for secondary settings, profile, and
overflow items.

---

## Tables: density, alignment, and column locking

A table is a spatial argument. The row is a record; the column is a property. Every
decision in a table design either supports or undermines the user's ability to compare
across rows and navigate down columns.

**Column alignment follows data type.** Text columns are left-aligned — the eye enters
text from the left and left-alignment provides a consistent anchor column for scanning.
Numeric columns are right-aligned — this places the least significant digit at a fixed
horizontal position, which enables numerical comparison down the column at a glance.
Dates are right-aligned when used for sorting comparison; they may be left-aligned in
conversational contexts (an activity log) where the date is a label, not a value.
Misaligned numeric columns make comparison impossible regardless of the data they contain.
Use `font-variant-numeric: tabular-nums` to ensure digits are the same width; proportional
digits misalign even in right-aligned columns.

**Density is a tradeoff between information per screen and cognitive load.** Compact rows
(24–32px) allow more data per viewport, which is appropriate for expert users who have
trained for the task (data analysts, financial operators). Comfortable rows (40–48px) allow
the eye to identify the current row without active tracking, which is appropriate for
general-purpose tables where the user's cursor is not always near the data they are reading.
Default to comfortable; move to compact only when the reduction in scrolling genuinely
improves the task.

**Fixed columns unlock horizontal scrolling.** When a table has many columns and requires
horizontal scrolling, the first column (the row identifier — name, ID, record title) should
be fixed. Without it, the user scrolls right and loses the context that names what they
are looking at. This is not a visual preference; it is the difference between a scannable
table and one that requires memorising the row identity before scrolling.

**Zebra striping vs hover highlighting.** Alternating row background colours (zebra
striping) aid row tracking in wide tables by giving the eye a colour reference to follow
across columns. Research at Software Usability Research Laboratory (Purdue University, 2008)
found zebra striping reduced reading errors in wide tables by a measurable margin. In
narrow tables (3–4 columns), striping adds visual noise without the benefit — the columns
are close enough to track without colour assistance.

---

## Modals: the overuse problem and its alternatives

A modal dialog interrupts the current task and requires the user to respond before
continuing. This interrupt is the cost. The interrupt is only worth paying when the
information requiring response is genuinely critical and cannot be presented in context.

The overuse pattern: modals are used as the path of least resistance for any complex
interaction that the designer does not want to solve in context — a settings form, a
confirmation step, an extended detail view, a secondary workflow. The modal becomes a
workaround for insufficient layout thinking.

**The alternatives, by use case:**

*Additional context about an existing item* — use **inline expansion** (a disclosure
region below the row, or an accordion panel). The content appears in context; the user
never leaves their current position; no overlay is required.

*A secondary workflow that the user initiates deliberately* — use a **side panel / drawer**
that slides in from the edge without replacing the current content. The primary view
remains visible; the secondary workflow is spatially separated but contextually connected.

*A transient action requiring quick input* — use a **popover** anchored to the trigger
element. Small, non-blocking, dismissable. Appropriate for colour pickers, tag editors,
date pickers, short confirmations.

*Non-critical status communication* — use a **toast notification** that appears without
interrupting the task and disappears after a short duration.

Modals are legitimate for: destructive confirmation (deleting records, cancelling
subscriptions), authentication gates (permission prompts, reauthentication), and complex
forms that are explicitly task-isolated (a "create new project" form where no in-context
alternative exists). Even in these cases, keep the modal content minimal — a modal with
scrolling content has ceased to be a modal; it is a page that lacks a URL.

Condition → choice → reason: before designing a modal, name the alternative and the reason
it does not apply. "The modal was easier to implement" is not a reason; it is a cost
transferred from the designer to the user.

---

## Toast notifications and alert hierarchy

Feedback messages are not all the same weight. A toast that says "Changes saved" and a
toast that says "Your account will be deleted in 24 hours" are using the same component
for radically different situations. The hierarchy of feedback:

**Inline validation errors**: adjacent to the field, persistent until corrected. The error
stays visible because it needs to be referenced while the user corrects the input. A toast
that vanishes after 3 seconds is wrong for this — the user may not have read it before it
disappears.

**Page-level alerts / banners**: a persistent strip above the content, requiring explicit
dismissal or action. Used for: degraded service warnings, quota limits, required actions
before proceeding. Appropriate when the condition affects the entire current task and needs
to remain visible.

**Toast / snackbar notifications**: transient, auto-dismiss after 3–5 seconds. Used for:
confirmation of non-critical completed actions ("Saved," "Copied to clipboard," "Email
sent"). Never use for errors that require action — a toast dismisses itself before the user
can read and respond, leaving the user without context for what went wrong.

**Modal alerts**: reserved for situations where the user must acknowledge before proceeding.
True critical errors, destructive confirmations, blocking conditions. The interrupt is the
point — the user cannot proceed without addressing this.

The common failure is using toasts for errors. "Payment failed" as a toast is a critical
error delivered in a transient container — it may vanish before the user notices it, and
even if they see it, it disappears before they can read any detail about why it failed.
Errors that require action belong in persistent, in-context containers.

---

## Search UI patterns

Search is not a feature, it is an entire interaction model. The decision of how to surface
search determines whether users who cannot navigate will find anything at all.

**The search input placement.** The search input belongs where the content lives — in the
page header for global search, above a list for list-specific search. A search icon that
triggers an overlay or a page navigation to a search page adds a step between the user and
the results. The step costs engagement, particularly for exploratory searches where the
user is not certain what they are looking for.

**Immediate vs submit-triggered results.** Typeahead (results updating on each keystroke)
is the correct choice for any search over bounded data where the server can respond in under
200ms. It removes the "submit and wait" loop and allows the user to steer the query
toward what is actually available, which is more efficient than crafting a full query in
advance. Submit-triggered search is appropriate for large unindexed datasets where
typeahead would be too slow or too broad to be useful.

**Empty search state vs zero-results state.** These are different screens with different
jobs. The empty search state (the search input just received focus, no query typed) should
show recent searches, popular items, or a helpful starting prompt — never a blank field
with nothing to do. The zero-results state should explain why there are no results (common
causes: typo, too-specific query, out-of-scope category) and offer a path forward (suggested
queries, a broader search, a direct contact option). A zero-results page that says only
"No results found" has told the user that their query failed without helping them succeed.

---

## Sources

- Miller, "The Magical Number Seven, Plus or Minus Two" (1956, Psychological Review) —
  working memory chunking; note the common misapplication to navigation counts
- NN/g, "Hamburger Menus and Hidden Navigation Hurt UX Metrics" (2016) — bottom tab bar
  vs hamburger menu engagement and discoverability comparison
- Material Design 3, Button component — single primary-per-view, hierarchy specification
- Carbon Design System (IBM), Button — danger/destructive semantic variant specification
- Helios Design System (HashiCorp), Button Organisation — three-tier ceiling rationale
- Baymard Institute, "Avoid Extensive Multi-column Layouts" (baymard.com) — inline
  validation timing and abandonment rate research
- Software Usability Research Laboratory (Purdue University, 2008) — zebra striping and
  row-tracking error rates in wide tables
- NN/g, "Website Forms Usability: Top 10 Recommendations" — validation timing, label
  placement, single-column preference
- Google Fonts Knowledge, "Understanding numerals" — tabular-nums for column alignment
