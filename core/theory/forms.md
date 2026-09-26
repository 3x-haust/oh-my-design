# Forms: state, timing, and recovery

A form is a sequence of user input, system interpretation, and recovery states. Validation timing follows what the user has had a fair
chance to finish, not a blanket event rule.

## Field state table

| State | Entry condition | What the UI shows | Validation and announcement |
| --- | --- | --- | --- |
| Pristine | Field hasn't been changed or submitted | Label, empty value or real default, persistent format hint, and required or optional status | No error and no success mark. Required status is available in text and semantics. |
| Editing | Focus is in the field and the value is incomplete or changing | Current value, caret, format progress, and nonjudgmental constraints such as remaining characters | Don't reject a partial value. Update safe formatting and requirement progress without announcing every keystroke. |
| Blurred | Focus leaves after a meaningful edit | Entered value in its display format. Show an error only if the field can be judged independently | Set `aria-invalid="true"` for an error and connect the specific message with `aria-describedby`. Don't show success unless it resolves real uncertainty. |
| Invalid after submit | Submit reveals an empty, malformed, inconsistent, or server-rejected value | Persistent inline error, error styling that doesn't rely on color, and retained input | Show all known errors together. Add an error summary at the form start and focus it. Each summary link moves focus to the field or group. |
| Corrected | A previously invalid value now passes its applicable checks | Remove the error as soon as validity is known. Preserve the corrected value and ordinary hint | Remove `aria-invalid` and obsolete error references. Announce correction only when the prior error was announced and silent removal would be unclear. |
| Async check pending | A complete candidate starts a remote check | Keep the value editable. Show local progress beside the field, such as "아이디 확인 중" | Set a polite status once. Don't mark valid, disable unrelated fields, or trap focus. Cancel or ignore stale requests. |
| Async result, available or accepted | The latest request confirms the value | Short persistent confirmation, such as "사용할 수 있는 아이디예요" | Announce one polite result. Bind it to the exact value checked. |
| Async result, unavailable or failed | The latest request rejects the value or the check itself fails | For rejection, show a specific field error and alternatives. For network failure, show retry without calling the value invalid | Associate rejection with the field. A service failure remains a system error, not user error. Preserve input in both cases. |

A field may move from blurred back to editing, then to corrected. Submission doesn't freeze the
form. State transitions must preserve the user's value unless removal is the explicit action.

## Timing rules

1. Validate on blur when one completed field can be judged independently, for example a complete
   email address or an impossible calendar date.
2. Validate on submit when the rule depends on several fields, server authority, or a complete
   decision. Date ranges and matching account details belong here.
3. During typing, show progress rather than rejection. Password requirements, character counts,
   and safe input formatting can update as the value changes.
4. After an error has appeared, revalidate during correction when the result is deterministic.
   Don't force another blur or submit to clear an error the user has already fixed.
5. Run availability checks only after a complete candidate and a deliberate pause, blur, or explicit
   check action. Results from an older value never replace results for the current value.

## Formatting and masking

Keep a raw value for validation and a display value for reading. Formatting must preserve caret
position, selection, paste, deletion, undo, assistive technology output, and autofill. Accept common
input variants, then normalize. Don't make users type punctuation that the interface can add.

For a Korean mobile number, accept `01012345678`, format progressively as `010-1234-5678`, and
submit a documented canonical value. While editing, `010-123` isn't an error. On blur or submit,
state the exact repair: "휴대폰 번호 11자리를 입력하세요." A telephone keyboard hint may help on
mobile, but it doesn't replace a text input that supports paste and assistive technology.

Mask secrets only when exposure creates risk. A password field has a labeled show or hide control,
preserves the user's cursor, and reports Caps Lock where the platform exposes it. Paste and password
managers remain available. Requirements appear before entry and update as progress, while breach or
server checks wait for a complete value.

주민등록번호 is high-risk personal data. Don't request it for age, identity, or eligibility when a
less sensitive fact is enough. When collection has a legal basis, explain purpose and retention,
minimize stored digits, use a protected input, and mask the latter digits on review and return views.
Masking is display protection, not consent, encryption, or permission to collect.

For 생년월일, direct typing is the primary path because a calendar is slow across decades. Label the
accepted format, for example `YYYY-MM-DD`, accept a pasted value, reject impossible dates only after
the entry is complete, and don't infer age eligibility from an incomplete date.

## Availability and dependent fields

Username, coupon, inventory, and appointment checks have two validity layers. Local syntax can be
checked first. Server availability is authoritative and must name the value and freshness of the
result. If submission can race with another user, recheck on submit and explain the changed result.

A dependent field appears or becomes relevant only after its controlling answer. Keep the control
before the dependency in reading and focus order. If changing the parent would clear a child value,
warn when the loss is meaningful. Otherwise clear it, announce the change, and remove the stale
value from submission. Hidden fields don't produce unreachable errors.

**주소 검색 flow:** label the trigger "주소 검색". It opens a named dialog or page with a search
field, results, and a close action. Keyboard focus enters at the search heading or field. A selected
road address closes the search, returns focus to the address group, fills the read-only base address,
and places focus in "상세 주소". Announce the selected address. Manual entry remains available when
the lookup fails, and reopening search doesn't erase the detail field without warning.

## Autofill, save, and resume

Use correct HTML field purpose and `autocomplete` tokens. Labels remain visible after autofill.
Treat browser-filled values as user data, then validate at the same completion point as typed values.
Test autofill with stored Korean names, phone numbers, postal codes, and addresses. A yellow browser
fill color isn't a sufficient state indicator.

Save and resume is warranted for long, sensitive, interrupted, or document-heavy work, not as a
substitute for removing unnecessary fields. State what is saved, where, and for how long. Show a
saved timestamp, distinguish local draft from server draft, and retry failed saves without losing
input. On resume, restore values, branch choices, completed steps, and error-free navigation position.
Don't restore stale security codes, passwords, or payment authentication values.

## Review and submission

A review step earns its place when the commitment is costly, legally significant, hard to reverse,
or assembled across stages. Group the summary by user decision, not database table. Mask sensitive
values, provide an "수정" link for each group, and return users to the same review position after an
edit. Don't add review to a short, reversible profile update.

On submit, prevent duplicate requests while showing immediate progress. Keep the button label and
state understandable. Success confirms what happened and what comes next. Server failure preserves
all nonsecret values and provides a retry path.

## Error summary and focus management

After an invalid submit:

1. Render a summary before the form with a heading and the total, such as "입력한 내용 3개를
   확인하세요."
2. Move programmatic focus to the summary using a temporary focus target. Don't focus the first
   field immediately, because that hides the scope of the problem.
3. List one link per invalid field or group in visual and DOM order. Link text includes the field
   name and repair, not "오류 1".
4. Activating a link focuses the invalid control, or the group legend for radios and checkboxes.
   Expand any collapsed ancestor first.
5. Keep each inline message next to its field and connect it with `aria-describedby`. Set
   `aria-invalid="true"` while the error applies.
6. On resubmit, rebuild the summary from current errors. Don't retain links to corrected fields.

## Field count and step count are heuristics

The checkout dataset cited in `ux.md` reports an average checkout with 23.48 form elements and
14.88 fields, an optimized checkout with 7 to 8 fields, and 18% abandonment attributed to a long or
complicated checkout. Elsewhere this evidence is sometimes compressed into "8 fields"
or "5.1 steps." Treat both numbers as dataset descriptions and diagnostic prompts, not laws.

A form with 9 necessary fields isn't defective because it exceeds 8. A 4-step flow can still be
worse than one page, while 6 meaningful stages can be easier than one dense page. Count user
decisions, dependencies, correction cost, and resumability. Measure completion, time, abandonment,
error correction, and successful return in the actual flow.

## Citation correction for inline validation

Earlier component guidance cited Baymard's "Avoid Extensive Multi-column Layouts" as support for
inline-validation effects. That source concerns layout and doesn't establish an inline-validation
abandonment effect. Treat timing as a heuristic: validate after a reasonable completion signal,
avoid premature rejection, and test completion and correction in the real form. Keep single-column layout guidance as a separate
claim with its own evidence.

## Sources

- W3C, Web Content Accessibility Guidelines 2.2, error identification, labels or instructions,
  error suggestion, focus order, status messages, and redundant entry
- HTML Living Standard, autofill field names, input purposes, and constraint validation
- W3C WAI, accessible forms guidance and ARIA Authoring Practices dialog patterns
- Baymard Institute, checkout field-count research and "Avoid Extensive Multi-column Layouts",
  with the scope limitation stated above
- Nielsen Norman Group, form design and error-message guidance
