# Components — decision material

A component is not a widget. It is the materialisation of a decision about what a
particular kind of interaction should feel like. The button is not a rectangle with a
label — it is a commitment about hierarchy, risk level, and action weight. Get the
component wrong and you get the interaction wrong regardless of how well everything else
was designed.

---

## Action hierarchy by consequence

Button hierarchy follows the consequence of the current decision, not a quota of one filled
button per page. A long settings page may contain several independent save regions. A toolbar may
contain several peer tools. A choice dialog may offer two equally valid paths. Making one action
look primary in those cases invents a recommendation the product does not have.

Classify each action before styling it:

| Consequence | Treatment | Examples |
| --- | --- | --- |
| Advances the user's current task | Strongest treatment within that task region | Save changes, Continue to payment |
| Preserves or offers an equal path | Equal weight when the choices are genuinely equal | Upload file or connect drive |
| Changes view or tool mode | Selected state, not CTA hierarchy | List/grid, draw/comment |
| Leaves or postpones | Quiet text or secondary treatment | Cancel, Back, Save draft |
| Causes reversible loss | Ordinary action plus immediate undo | Remove a tag, archive one row |
| Causes costly or irreversible loss | Danger treatment at the decision point | Delete account, revoke all access |

A view can have more than one filled action when each belongs to a clearly bounded task region.
Within one region, make the expected advancing action singular unless the choices are equal. In a
toolbar, peer commands use the same neutral treatment and expose pressed or selected state. Don't
paint the most frequently clicked tool as a primary CTA.

**Equal-choice dialogs.** When neither choice is preferred, give both the same visual weight and
write labels that name outcomes, such as "현재 요금제 유지" and "무료 요금제로 변경". Don't use
a filled button to bias a consent, privacy, billing, or cancellation decision.

**Split buttons.** Use a split button only when one action is the stable default and closely
related alternatives exist. The main segment runs the default. The arrow segment opens a menu.
Both segments share one visible focus boundary but must be separate tab stops or expose an APG
menu-button keyboard model. Never hide an unrelated or destructive command in the split menu.

**Deletion.** Prefer undo-first deletion when recovery is cheap and reliable. Remove the item,
announce the result, and keep an Undo action available for at least 5 seconds or until the next
committing navigation. Ask for confirmation when loss is irreversible, affects other people,
creates a financial or legal consequence, or can't be restored from a known history. Confirmation
copy names the object and consequence. Requiring typed text is reserved for rare, high-impact
operations, not routine row deletion.

**Danger zone.** Put account deletion, ownership transfer, key rotation, and similarly exceptional
operations in a labeled section after ordinary settings. Separation improves scanning, but it
mustn't make the action hard to find. Use the error or danger color at the final trigger, not as a
large decorative panel. Color is redundant with an explicit label and consequence text.

Condition -> choice -> reason: rank actions by what happens after activation. Use visual priority
to express task progression, equality, mode, reversibility, and risk. Don't enforce one filled
button per entire view when the view contains several independent contexts.

---

## Form inputs: validation timing

Validation follows field state and what the user has had a fair chance to complete. Use blur or
another completion signal for independently judgeable values, submit for cross-field or authoritative
checks, and progress rather than rejection while a value is incomplete. After submit, preserve input,
show all known errors, focus a linked summary, and clear each error as soon as correction is known.

`forms.md` owns the complete field-state table, formatting and masking, async availability,
dependencies, autofill, save and resume, review, submission, and error-summary focus behavior.

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

The legitimate constraints are label length, grouping, task and switching frequency, viewport,
permissions, object count, and the cost of hiding or choosing the wrong destination. There is no
universal top-level item ceiling. Test first clicks with representative tasks and preserve clear
information scent. See `ia-methods.md` for object models, card-sort hypotheses, and tree testing.

**Mobile: visible navigation vs menu.** Persistent navigation improves discoverability when a
small set of stable peer destinations is used frequently, but that does not make bottom tabs a
universal product pattern. Use bottom tabs when labels fit, destinations are stable peers, and the
screen cost is justified. Use a menu, section index, search, or object-local navigation for one
dominant flow, dynamic modules, long labels, or infrequent destinations.

Condition → choice → reason: choose mobile navigation from frequency, peer status, label fit,
permission variance, and task recovery. Keep secondary settings and rare destinations available
without pretending they are primary peers.

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

---

## Component matrix

### Shared dimensions and state rules

Use four control heights deliberately: 32px for dense desktop tables and expert toolbars, 36px for
compact product forms, 40px as the general desktop default, and 44px for touch-first controls.
Text inputs and adjacent buttons in one row share a height. A pointer target must meet WCAG 2.2
2.5.8, at least 24 by 24 CSS px or satisfy its spacing exception. Aim for 44 by 44px on touch even
when the visible control is smaller. Body and control labels normally start at 14px in dense UI,
never 8 to 10px decorative microcopy.

Every interactive component needs a default, hover when a pointing device supports it,
focus-visible, and disabled state when disabling is legitimate. Add pressed while activation is in
progress, selected for persistent choice, indeterminate for partial checkbox selection, loading for
async work, read-only for values that remain selectable or copyable, and error when the component
owns invalid input. Focus remains visible at 3:1 against adjacent colors and isn't replaced by a
color-only change. Disabled content need not meet text contrast exceptions, but nearby copy must
explain why a consequential action is unavailable.

### Select

**Anatomy:** persistent label, closed button or native select, current value or placeholder,
chevron, listbox, option rows, optional hint and error. Use for one choice from a stable list whose
labels users can scan. Don't use for fewer than about four obvious choices when radios fit, or for
a large list that needs search.

**Keyboard:** prefer native `<select>`. For a custom APG select-only combobox, Tab reaches the
control, Alt+Down or Enter opens it, arrows move the active option, Enter accepts, Escape closes,
and type-ahead jumps by label. Selection must not trap Tab. Expose expanded state, popup ownership,
and the active option.

**States and validation:** show default, hover, focus-visible, open, selected, disabled, read-only,
loading, and error as applicable. Validate required selection on blur or submit. Keep the error
linked to the trigger, not only inside a closed popup.

**Responsive and Korean:** keep the popup within the viewport. On narrow touch screens, a native
picker or bottom sheet may replace the floating list while preserving label and value. Allow Korean
initial-consonant search only if users expect it, and don't abbreviate similar administrative
labels. Example: "배송 지역을 선택하세요", not bare "선택".

**Do:** keep option wording parallel and show the current value when closed. **Don't:** use a
placeholder as the only label or put buttons and links inside the option list.

### Combobox and autocomplete

**Anatomy:** label, editable input, optional clear button, popup listbox, options with match context,
loading status, no-result state, hint, and error. Use when users may type a value or search a long
set. Don't use when every entered value must come from five visible choices.

**Keyboard:** follow the APG combobox pattern. Typing edits the query, Down and Up move the active
option without moving DOM focus from the input, Enter accepts, Escape closes or clears the popup,
and Tab leaves. `aria-activedescendant`, `aria-expanded`, `aria-controls`, and autocomplete mode
must match behavior. Don't override standard text editing keys.

**States and validation:** support focused, expanded, active-option, selected, loading, no results,
disabled, read-only, and error. Announce result count and async completion politely. If free text
isn't valid, distinguish "검색어" from a committed selection and validate on blur or submit.

**Responsive and Korean:** at mobile width, a full-width dialog or sheet with autofocus and a
visible close action is often easier than a clipped popup. Korean matching may include Hangul,
chosung, spacing variants, and Latin product codes. Show enough secondary text to disambiguate
same-name places or people.

**Do:** debounce network requests and discard stale responses. **Don't:** announce every keystroke
or silently accept text that doesn't map to a valid record.

### Checkbox

**Anatomy:** square indicator, visible label, optional description, optional group label, and error.
Use for independent yes/no choices and multi-select sets. Don't use a checkbox for an immediate
system mode better expressed by a switch.

**Keyboard:** Tab reaches each checkbox and Space toggles it. A tri-state parent cycles according to
the product's documented behavior and exposes `aria-checked="mixed"` when partial.

**States and validation:** default, hover, focus-visible, checked, pressed, indeterminate, disabled,
read-only display, and group error. For required consent, validation names the consent, not
"필수 항목입니다" alone. Never precheck marketing consent.

**Responsive and Korean:** the label and indicator form one target, ideally at least 44px high on
touch. Wrap long Korean legal labels without separating the checkbox from the first line. Put
"필수" or "선택" in readable text after the label.

**Do:** let users click the full label row. **Don't:** use indeterminate as a third user choice when
it only represents mixed children.

### Radio group

**Anatomy:** group legend, circular controls, labels, optional descriptions, hint, and group error.
Use for one choice from a small visible set, especially when comparison matters. Don't use when
multiple choices are allowed or when the set is long and unstable.

**Keyboard:** one Tab stop enters the APG radio group. Arrow keys move and select among radios;
Space selects the focused radio. In native HTML, browser behavior supplies this model.

**States and validation:** default, hover, focus-visible, checked, disabled, read-only summary, and
group error. On submit, associate the error with the group and move focus to the group legend or
first radio through the error-summary link.

**Responsive and Korean:** stack labels below about 480px unless each label is short. Don't force
Korean plan names into equal-width segments when wrapping would make rows unequal.

**Do:** order options by user logic and keep descriptions visible. **Don't:** select a costly or
privacy-sensitive default without evidence.

### Switch

**Anatomy:** track, thumb, visible label, optional on/off status text, and description. Use for a
binary setting that takes effect immediately. Don't use for form agreement, multi-select, or an
action that still needs Save.

**Keyboard:** Tab focuses the switch and Space toggles it. Enter may toggle only when platform
convention supports it. Use `role="switch"` with `aria-checked`, or a native checkbox with switch
styling and equivalent semantics.

**States and validation:** off, hover, focus-visible, pressed, on, loading, disabled, and read-only.
If the setting saves remotely, show pending state without flipping repeatedly, then announce
success or restore the prior value with an inline error.

**Responsive and Korean:** keep label and switch on one row when possible, with description below.
Use explicit status text when color and thumb position may be unclear: "알림 켜짐". Avoid vague
negative labels such as "알림 끄지 않기".

**Do:** phrase the label as the enabled condition. **Don't:** open a confirmation dialog for every
low-risk toggle.

### Segmented control

**Anatomy:** group label, two to five adjacent segments, selection indicator, and optional icons.
Use for peer modes or a compact single-choice filter whose effects are immediate. Don't use for
page navigation with independent destinations, long labels, or more than five choices.

**Keyboard:** when it changes a value, use the APG radio-group model with one Tab stop and arrow-key
selection. When it changes views with tab panels, use the tabs pattern instead. Don't invent a
hybrid.

**States and validation:** default, hover, focus-visible, pressed, selected, and disabled. Selected
state needs more than color, such as fill plus border or checkmark. Segmented controls rarely own
validation.

**Responsive and Korean:** allow horizontal scrolling only when the chosen component remains
recognizable and the selected segment is brought into view. Otherwise transform into radios or a
select. Korean labels should be short nouns, such as "일간 / 주간 / 월간", at 14px or larger.

**Do:** size peers consistently while allowing readable labels. **Don't:** shrink text to fit every
segment on one line.

### Tabs

**Anatomy:** tablist label when needed, tabs, selected indicator, optional count, and associated tab
panels. Use for peer views within one context. Don't use for sequential steps, unrelated pages, or
content users need to compare simultaneously.

**Keyboard:** follow APG tabs. One Tab stop enters the tablist, Left and Right move tabs, Home and
End reach edges, and Tab enters the active panel. Automatic activation is suitable only when panel
content appears without noticeable delay. Otherwise Space or Enter activates the focused tab.

**States and validation:** default, hover, focus-visible, selected, disabled only when unavoidable,
loading panel, and panel error. Preserve each panel's state when switching unless reset is explicit.

**Responsive and Korean:** use a horizontally scrollable tablist with visible overflow cue, or
replace secondary tabs with a select. Don't wrap tabs onto two lines. Keep Korean counts separate
from labels, for example "댓글 12", and retain full labels where truncation creates ambiguity.

**Do:** make the selected tab and its panel programmatically connected. **Don't:** use arrow keys to
scroll the page while focus is in a horizontal tablist.

### Pagination

**Anatomy:** previous and next, current page, nearby page links, optional first and last, result
range, and optional page-size control. Use when stable chunks and direct page return matter. Don't
use endless pagination for a short list or infinite scroll where footer content and position
recovery matter.

**Keyboard:** links and buttons follow native Tab and activation behavior. Mark the current page
with `aria-current="page"`. After navigation, place focus at the updated results heading or preserve
focus with a clear status announcement for client-side updates.

**States and validation:** default, hover, focus-visible, current, disabled boundary controls,
loading, and load error. Validate typed page numbers against the current page count.

**Responsive and Korean:** on narrow screens show previous, "3 / 24", and next; retain direct page
entry only when needed. Announce ranges naturally: "총 248개 중 41에서 60번째". Use "이전" and
"다음", not unlabeled chevrons.

**Do:** keep URLs shareable when page position matters. **Don't:** reset filters or scroll position
without warning.

### Breadcrumb

**Anatomy:** navigation landmark label, ordered links, separators hidden from assistive technology,
and current page. Use to expose hierarchy in deep sites. Don't use as a history trail or as the
only navigation in a shallow app.

**Keyboard:** native links in document Tab order. Mark the last item with `aria-current="page"` or
render it as text.

**States and validation:** default, hover, focus-visible, visited if useful, current, and overflow.
Breadcrumbs don't own validation.

**Responsive and Korean:** collapse middle ancestors into an accessible menu while keeping the
parent and current location understandable. Korean labels may omit repeated category suffixes only
when meaning remains clear. Don't truncate every crumb to one syllable.

**Do:** reflect the information architecture. **Don't:** include the current page as a misleading
clickable link.

### Menu and dropdown

**Anatomy:** labeled menu button, popup menu, menu items, optional groups and separators, checked or
radio items, and submenu indicators. Use for a compact set of commands. Don't use a menu for form
selection, persistent navigation that should stay visible, or arbitrary interactive content.

**Keyboard:** follow APG menu-button and menu patterns. Enter, Space, or Down opens; arrows move
items; Home and End reach edges; type-ahead finds labels; Right opens a submenu; Left closes it;
Escape closes and returns focus to the trigger. Tab closes the menu and continues normal order.

**States and validation:** trigger default, hover, focus-visible, expanded; items active, checked,
disabled, and destructive when applicable. Menus don't own field validation. Async commands close
the menu and expose progress at the affected object.

**Responsive and Korean:** a long action menu can become a bottom sheet with the same order and
labels. Keep destructive actions separated and explicit, such as "프로젝트 삭제" rather than
"삭제" when context could be lost.

**Do:** use verbs for commands. **Don't:** place text fields, tabs, and complex forms in a role menu.

### Tooltip versus popover

**Anatomy:** a tooltip has a trigger and noninteractive descriptive bubble. A popover has a trigger,
interactive surface, optional heading, controls, and close behavior. Use a tooltip for brief
supplemental text. Use a popover for actions or structured details. Don't put required instructions
only in either hidden surface.

**Keyboard:** tooltip appears on hover and focus, stays while pointer is over trigger or tooltip,
and closes with Escape. It never takes focus. A popover opens by activation, moves focus only when
the task requires it, contains a logical Tab sequence, closes with Escape, and restores focus to
the trigger. Modal popovers need a dialog model; nonmodal ones don't trap focus.

**States and validation:** closed, delayed hover, focus-visible trigger, open, and disabled-trigger
explanation where reachable. Popovers may include loading, empty, and error states. Tooltips don't
carry validation errors because they disappear.

**Responsive and Korean:** replace hover-only behavior with tap or inline help on touch. Popovers
near viewport edges reposition or become a sheet. Korean tooltip copy is one or two direct
sentences, not compressed noun fragments.

**Do:** use `aria-describedby` for descriptive tooltip text. **Don't:** put links or buttons in a
tooltip.

### Accordion and disclosure

**Anatomy:** heading, button, indicator, and controlled region. Use disclosure for one optional
section and accordion for a related set. Don't hide information users need to compare or required
form fields whose existence is unclear.

**Keyboard:** each header button is in Tab order. Enter or Space toggles it. APG optionally supports
Up, Down, Home, and End between accordion headers. The region follows normal document order and
doesn't become a focus trap.

**States and validation:** collapsed, hover, focus-visible, expanded, disabled only if the panel
truly can't open, loading, and panel error. If a hidden panel contains an invalid field, expand it
before focusing the field and reflect the error at the header.

**Responsive and Korean:** accordions often work unchanged on mobile, but increase header targets
to 44px and keep long Korean headings left aligned. State labels as questions only when the content
answers them.

**Do:** preserve user-opened state during nearby updates. **Don't:** collapse a panel while focus is
inside it.

### Date picker

**Anatomy:** visible label, editable date input, format hint, calendar button, dialog, month/year
controls, weekday headings, date grid, selected and unavailable dates, error, and optional range
summary. Use a picker when calendar context prevents errors. Don't require calendar navigation for
a known date such as birth year.

**Keyboard:** text entry remains available. In the APG dialog grid, arrows move by day, Home and End
move within a week, Page Up and Page Down change month, modified Page keys change year, Enter or
Space selects, and Escape closes to the trigger. The dialog has an accessible name and managed
focus.

**States and validation:** empty, hover, focus-visible, today, selected, range start/end, unavailable,
loading availability, read-only, disabled, and error. Validate impossible dates, allowed range,
and cross-field order. Don't reject a partially typed date while editing.

**Responsive and Korean:** on mobile use a full-screen dialog or bottom sheet if the grid would be
cramped. State locale and format explicitly, for example "2026. 9. 26." or "YYYY-MM-DD". Avoid
ambiguous numeric order. Weekday labels and first day of week follow the target locale and product
contract, not an assumed market rule.

**Do:** allow direct typing and expose unavailable reasons. **Don't:** make users page month by month
to reach a date decades away.

### File upload

**Anatomy:** label, native file input, browse button, optional drop zone, accepted type and size
rules, file queue, per-file progress, cancel/remove, success, and error. Use for user-selected
files. Don't make drag and drop the only path.

**Keyboard:** the browse control is a native activatable button or labeled input. Tab reaches queue
actions. Drop zones respond to pointer drag but not fake keyboard drag. Progress and completion are
announced without stealing focus.

**States and validation:** idle, hover, focus-visible, drag-over, files selected, uploading,
progress, success, recoverable error, disabled, and read-only attachment list. Validate type and
size before upload, then server-side too. Name the failed file and keep valid files intact.

**Responsive and Korean:** on mobile, "파일 선택" may invoke camera, photo library, or files when
those sources are allowed. Stack queue metadata and actions. Write limits concretely: "PDF, PNG,
JPG, 파일당 최대 10MB".

**Do:** support retry and removal per file. **Don't:** clear the whole queue because one upload
failed.

### Drawer and sheet

**Anatomy:** overlay when modal, surface, heading, close button, body, and anchored actions. A drawer
usually enters from a side; a sheet commonly enters from the bottom. Use for a secondary task that
benefits from keeping the parent context visible. Don't use for deep, linkable workflows that need
a page and URL.

**Keyboard:** a modal drawer follows the APG dialog model: focus enters at a useful element, Tab and
Shift+Tab remain inside, Escape closes, and focus returns to the trigger. A nonmodal complementary
panel stays in normal focus order and doesn't trap focus. Background content is inert only for the
modal form.

**States and validation:** closed, opening, open, loading, empty, error, dirty, submitting, and
close-confirmation only when unsaved loss is meaningful. Reduced-motion mode removes travel while
preserving state change.

**Responsive and Korean:** a 360 to 480px side drawer can become a full-width sheet on narrow
screens. Keep close and primary actions visible around the on-screen keyboard. Headings name the
task, such as "필터" or "멤버 초대", not generic "상세".

**Do:** give a substantial workflow a route when users need refresh, sharing, or back navigation.
**Don't:** stack drawers on drawers.

### Tree

**Anatomy:** tree label, hierarchical treeitems, expand/collapse controls, optional icons, selected
item, and optional multi-select marks. Use for a hierarchy where users browse parent-child
relationships. Don't use for a flat list or primary site navigation that benefits from visible
pages.

**Keyboard:** follow APG tree view. Up and Down move visible items; Right opens a closed node or
moves to its first child; Left closes an open node or moves to its parent; Home and End reach
bounds; type-ahead finds labels. In multi-select trees, document selection keys and keep focus
separate from selection.

**States and validation:** collapsed, expanded, focused, selected, checked or mixed if used,
loading children, unavailable, disabled, and error. Announce lazy-load completion and preserve
expansion after retry.

**Responsive and Korean:** deep trees rarely fit phone widths. Transform into drill-down lists with
a visible ancestor path rather than crushing indentation. Korean folder labels remain at 14px or
larger and truncate only with a reachable full name.

**Do:** distinguish focus, selection, and expansion visually. **Don't:** make the chevron the only
24px target for opening a node.

### Chips and tags

**Anatomy:** compact label, optional leading icon, optional remove button, and optional selected
state. Use tags to display classification. Use chips for compact filters or entered tokens. Don't
use decorative pills for every metadata value or hide full actions in tiny chips.

**Keyboard:** static tags aren't focusable. A removable chip exposes a labeled remove button.
Token inputs follow normal text editing, with Backspace selecting then removing the previous token
rather than deleting it without warning. Choice chips use radio or checkbox semantics according to
single or multiple selection.

**States and validation:** default, hover, focus-visible on the actionable part, selected, pressed,
invalid token, loading suggestion, disabled, and read-only. Keep invalid entries editable and state
the accepted format.

**Responsive and Korean:** wrap chips by whole item, cap the visible set with a clear "+3" control,
and use 32px height in dense desktop or 36 to 44px on touch. Korean labels need normal readable
spacing; don't force all chips to equal width.

**Do:** make removal names specific, such as `aria-label="디자인 태그 삭제"`. **Don't:** encode
status only through chip color.

### Stepper

**Anatomy:** ordered step labels, current marker, completed markers, optional status text, and the
step content. Use for a genuinely staged flow with dependencies or saved checkpoints. Don't split a
short form merely to reduce visible field count.

**Keyboard:** a noninteractive progress stepper is read as an ordered list with current step marked.
If completed steps are links, they use native link behavior. Don't expose future unavailable steps
as disabled buttons in the Tab order.

**States and validation:** upcoming, current, complete, optional, error, blocked, and loading during
transition. A step with errors remains marked until corrected. Validate the current step before
advancing only when later answers depend on it; otherwise allow review and correction.

**Responsive and Korean:** collapse to "2 / 5 결제 정보" with a progress indicator on narrow
screens while keeping a route back to completed steps. Korean labels state the decision or object,
not repetitive "단계 1" text.

**Do:** preserve entered data across Back and resume. **Don't:** claim progress from an arbitrary
step count when hidden branches can change the total.

---

## Component verification

For every component, verify in a real browser with keyboard only, pointer, 400% zoom, 320 CSS px
reflow, 200% text size, forced colors, reduced motion, and the target locale. Inspect the
accessibility tree for role, name, state, and relationships. Automated checks can find missing
attributes, but they can't prove that focus moves to the right place or that a popup remains usable
above a mobile keyboard. Use `accessibility.md` for the cross-cutting applicability matrix, browser
procedures, and numeric floors.

## Sources

- Miller, "The Magical Number Seven, Plus or Minus Two" (1956, Psychological Review) —
  working memory chunking; note the common misapplication to navigation counts
- NN/g, "Hamburger Menus and Hidden Navigation Hurt UX Metrics" (2016) — bottom tab bar
  vs hamburger menu engagement and discoverability comparison
- Material Design 3, Button component — button hierarchy and state patterns, scoped here by task region and consequence
- Carbon Design System (IBM), Button — danger/destructive semantic variant specification
- Baymard Institute, "Avoid Extensive Multi-column Layouts" (baymard.com) — form layout guidance; it does not establish an inline-validation abandonment effect
- Software Usability Research Laboratory (Purdue University, 2008) — zebra striping and
  row-tracking error rates in wide tables
- NN/g, "Website Forms Usability: Top 10 Recommendations" — validation timing, label
  placement, single-column preference
- Google Fonts Knowledge, "Understanding numerals" — tabular-nums for column alignment
- W3C WAI, ARIA Authoring Practices Guide, component patterns and keyboard interaction
- W3C, Web Content Accessibility Guidelines 2.2, especially 1.4.3, 1.4.10, 1.4.11, 2.4.7,
  2.4.11, and 2.5.8
- HTML Living Standard, native form controls and constraint validation
- Apple Human Interface Guidelines and Material Design, 44px touch guidance and control patterns
