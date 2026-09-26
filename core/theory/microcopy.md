# Korean and English microcopy matrix

Microcopy names the current object, state, consequence, and next move. It isn't decoration around a component. Write from the product's truth boundary and chosen voice, then test the string in its real width, state, and reading order.

## The compact-string rule

Replace "one breath per sentence" with this rule:

> One compact UI string has one primary job.

A button predicts its immediate action. An error names what failed and how to recover. A toast confirms the strongest transition the system can verify. Don't force every sentence, help article, legal notice, tutorial, or technical explanation into one spoken breath. Longer copy can carry linked conditions when splitting them would hide the relationship.

Good compact string:

* `카드를 다시 등록해 주세요.` Its job is recovery.
* `Save as draft` Its job is an action.

Overloaded:

* `입력한 내용을 확인한 후 저장하고 다음 단계로 이동해 주세요.` It mixes review, save, and navigation.
* `Your changes couldn't be saved, so check your connection and try again or contact support.` It mixes cause speculation, recovery, and escalation.

Split only when the surface supports multiple roles. Keep one string when its condition and action must be understood together: `오늘 자정 전까지 결제해야 예약이 확정돼요.`

## Don't manufacture title and subtitle pairs

Reject the automatic formula of a title followed by a muted explanatory subtitle. Supporting copy is `none` when the work object, progress indicator, field label, current state, or title already gives enough orientation.

| Don't | Do | Why |
| --- | --- | --- |
| `프로필` plus `프로필 정보를 관리하세요` | `프로필` | The second line repeats the title. |
| `결제 수단` plus `결제 수단을 선택해 주세요` above a labeled list | `결제 수단` | The controls already show the choice. |
| `Team members` plus `Manage your team members here` | `Team members` | No new fact or decision. |
| `연결 끊김` plus `인터넷 연결이 끊겼어요` | `인터넷 연결이 끊겼어요` | One state line does both jobs. |

Supporting copy earns space when it adds a constraint, consequence, evidence, or recovery cue: `초대 링크는 24시간 뒤 만료돼요.` Otherwise record it as `none`, not as a slot waiting for filler.

## Voice and grammar defaults

Choose Korean speech level from the voice contract. Examples below use compact noun labels, direct action verbs, and 해요체 messages where a sentence is needed. A formal service may choose 합니다체 and keep the same information structure.

English uses sentence case, concrete verbs, and direct labels. Don't add `please` to routine actions. Care belongs where risk, loss, or recovery calls for it.

Korean often omits the subject when the actor is clear. English often needs it. Translate the job, not the syntax.

* Natural Korean: `신청서를 보냈어요.`
* Translation-shaped Korean: `귀하의 신청서가 성공적으로 제출되었습니다.`
* Natural English: `We sent your application.` or `Application sent.`, according to the product's verified actor and voice.

## Component and state matrix

### Buttons

Use verbs for actions. Korean labels may be a bare verb stem or a `-하기` form. Pick one pattern by context, then hold it among peer controls.

| Context | Korean | English | Avoid |
| --- | --- | --- | --- |
| Save edits | `저장` | `Save` | `확인`, `OK` |
| Create account | `가입하기` | `Create account` | `시작하기` when the immediate result is account creation |
| Submit application | `신청하기` | `Submit application` or `Apply` | `다음` when submission happens now |
| Search | `검색` | `Search` | `Go` |
| Add member | `멤버 추가` | `Add member` | `추가하기` with no object in an ambiguous toolbar |
| Cancel an operation | `취소` | `Cancel` | `뒤로` when it discards work |
| Delete file | `파일 삭제` | `Delete file` | `삭제` when several objects are visible |

`신청` works as a compact tab, menu noun, or tightly contextual button. `신청하기` is clearer when the control initiates an application and needs to read as an action. Don't enforce `-하기` everywhere.

Avoid reflexive formality such as `저장하시겠습니까?` for routine, reversible actions. Save directly and show truthful feedback. Ask for confirmation only when the consequence, cost, or irreversibility warrants interruption.

### Menus and navigation

Menus name destinations or objects, usually with nouns. Buttons perform actions.

| Don't | Do |
| --- | --- |
| Navigation item `확인하기` | `주문 내역` |
| Menu item `관리하기` | `멤버 관리` |
| Link `자세히 보기` repeated across cards | `요금제 비교`, `배송 정책` |
| `Click here` | `View invoice` |

Use verbs in an action menu because the menu contains commands: `이름 변경`, `복제`, `보관`, `삭제`. Keep destructive actions visually and verbally distinct.

### Destructive confirmation

A destructive dialog names the object, consequence, and final action. Don't use a vague yes or no pair.

Good Korean:

* Title: `프로젝트를 삭제할까요?`
* Body: `프로젝트와 파일 24개가 영구 삭제돼요. 되돌릴 수 없어요.`
* Actions: `취소` and `프로젝트 삭제`

Bad Korean:

* Title: `정말 삭제하시겠습니까?`
* Body: `이 작업을 계속 진행할 경우 데이터가 삭제될 수 있습니다.`
* Actions: `아니요` and `예`

Good English:

* Title: `Delete “Spring launch”?`
* Body: `This permanently deletes the project and its 24 files.`
* Actions: `Cancel` and `Delete project`

Don't make users type `DELETE` unless the added friction matches exceptional, broad, or regulated loss. For common single-item deletion, a precise dialog or undo is better.

### Permission prompts

Explain why the permission is needed before the operating system prompt, and tie it to the action the user just chose.

| Bad | Good |
| --- | --- |
| `카메라 접근 권한이 필요합니다.` | `영수증을 촬영하려면 카메라 접근을 허용해 주세요.` |
| `위치 권한을 활성화하시겠습니까?` | `내 주변 매장을 찾을 때만 위치를 사용해요.` |
| `We value your privacy. Allow notifications?` | `Get a notification when your driver arrives.` |

Actions should predict the next step: `카메라 허용` and `나중에`, not `확인` and `취소`. Don't claim that a permission is required when the task has a manual alternative.

### Empty states

An empty state distinguishes first use, no results, filtered-out results, permission limits, and failed loading. They need different copy.

| State | Bad | Good Korean | Good English |
| --- | --- | --- | --- |
| First use | `아직 아무것도 없어요` | `첫 프로젝트를 만들어 보세요.` with `프로젝트 만들기` | `Create your first project.` with `Create project` |
| No search result | `데이터 없음` | `“연남동” 검색 결과가 없어요.` | `No results for “Yeonnam-dong”.` |
| Filter excludes all | `결과가 없습니다` | `선택한 기간에 결제 내역이 없어요.` with `필터 초기화` | `No payments match these filters.` with `Clear filters` |
| No permission | `목록이 비어 있습니다` | `이 팀의 멤버를 볼 권한이 없어요.` | `You don't have access to this team's members.` |

Don't celebrate emptiness with vague aspirations. Name why it is empty and offer an action only when a useful action exists.

### Loading

Use a stable label for a wait that needs explanation. Skeletons may show structure, but they don't name a long operation.

| Bad | Good |
| --- | --- |
| `잠시만 기다려 주세요...` forever | `거래 내역을 불러오는 중` |
| `Loading...` beside a disabled submit button | Button label `Saving...` and a live status `Saving changes` when needed |
| Rotating slogans during import | `파일 18개 중 7개 가져오는 중` |

Don't announce fast, local state changes to assistive technology if that creates noise. For an operation with progress, report real progress. Never invent a percentage.

### Errors and recovery

An error states what failed, preserves user input when possible, and gives a recovery action. Don't blame the user or claim a cause the system didn't verify.

| Bad | Good Korean | Good English |
| --- | --- | --- |
| `오류가 발생했습니다.` | `결제 내역을 불러오지 못했어요. 다시 시도해 주세요.` | `Couldn't load payments. Try again.` |
| `잘못된 값을 입력하셨습니다.` | `사업자등록번호 10자리를 입력해 주세요.` | `Enter the 10-digit business registration number.` |
| `네트워크 오류입니다.` when cause is unknown | `변경 내용을 저장하지 못했어요.` | `Couldn't save your changes.` |
| `Invalid input` | `Use 8 or more characters.` | `Use 8 or more characters.` |

Put field errors beside the field and move focus or an error summary to the first invalid field when submission fails. Preserve what was entered. Escalation copy names a real route: `문제가 계속되면 오류 코드 A17과 함께 고객센터에 문의해 주세요.`

### Success

Confirm only the strongest completed boundary. A request sent isn't an appointment confirmed.

| Bad | Good |
| --- | --- |
| `예약이 완료됐어요.` after only sending a request | `예약 요청을 보냈어요. 병원에서 확인하면 알려드릴게요.` |
| `성공적으로 처리되었습니다.` | `배송지를 바꿨어요.` |
| `Success! Your journey begins now.` | `Account created.` |

Keep success copy quiet for routine reversible actions. A saved field may need no toast if the state visibly updates and persists.

### Offline

Separate offline status, queued work, and failed synchronization.

* Good: `오프라인이에요. 저장한 문서는 계속 볼 수 있어요.`
* Good: `변경 내용 3개를 기기에 저장했어요. 연결되면 동기화해요.` only when local persistence and later sync are real.
* Bad: `인터넷 연결을 확인해 주세요.` when the product still works offline.
* Bad: `Changes saved` when they exist only in memory.

Give a retry action only when retry can help. Don't show a permanent toast for a persistent offline state. Use a status region that remains available.

### Counters and limits

Counters need an object and a clear relationship to a limit.

| Context | Korean | English |
| --- | --- | --- |
| Character limit | `120/200자` | `120/200 characters` |
| Selection | `3개 선택` | `3 selected` |
| Remaining invitations | `초대 2명 남음` | `2 invitations left` |
| Notification badge | `9` or `9+`, with accessible name `읽지 않은 알림 9개` | `9` or `9+`, accessible name `9 unread notifications` |

Don't use `99+` when the exact count changes a task decision. In prose, follow locale-aware plural rules in English. Korean usually keeps the noun form and uses a counter appropriate to the object.

### Truncation

Truncation is a layout policy, not a writing style.

* Keep action labels, errors, destructive consequences, and prices complete.
* Truncate user-generated names only when the full value is available on focus, expansion, or a details view.
* Distinguish peers before truncation. `2026년 상반기 마케팅...` repeated five times is unusable.
* Use middle truncation for identifiers when both ends matter: `AB12...9XZ8`.
* Don't rely on hover alone to reveal full text.

Korean navigation and buttons should stay on one line through a measured width, `white-space: nowrap`, and responsive recomposition. Don't let a label break inside a word.

### Dates, prices, and units

| Type | Korean | English |
| --- | --- | --- |
| Record date | `2026. 9. 26.` | `Sep 26, 2026` or `26 Sep 2026`, by locale |
| Conversational date | `9월 26일` | `September 26` |
| Price | `29,000원` | `$29.00` or locale currency format |
| Recurring price | `월 29,000원` | `$29/month` |
| Data | `12GB` under the product's unit style | `12 GB` or product standard |
| Duration | `약 3분` | `About 3 minutes` |

Use locale formatters in code. Don't concatenate a currency symbol, numeric value, and translated unit by hand. Include tax, billing interval, timezone, or year when it affects the decision.

### Forms

Labels name the information, not an instruction.

| Part | Bad | Good |
| --- | --- | --- |
| Label | `이메일을 입력해 주세요` | `이메일` |
| Placeholder | `이메일` as the only label | `name@example.com` beneath a persistent `이메일` label |
| Help | `올바르게 입력해 주세요` | `주문 확인 메일을 받을 주소예요.` |
| Error | `필수 항목입니다` | `이메일을 입력해 주세요.` |
| Format error | `형식이 잘못되었습니다` | `name@example.com 형식으로 입력해 주세요.` |
| Optional marker | Every required field has `필수` | Mark the smaller set, such as `회사명 (선택)` |

Help text is `none` when the label and expected format are obvious. Don't repeat the label in a placeholder. Show constraints before submission when users can act on them.

### Toasts

Toasts suit brief confirmation of a completed, noncritical event. They don't suit errors that require work, persistent connection status, or destructive consequences.

| Bad | Good |
| --- | --- |
| `성공!` | `링크를 복사했어요.` |
| `변경 사항이 성공적으로 저장되었습니다.` | `변경 내용을 저장했어요.` |
| Toast disappears with an upload error | Inline status: `사진 2장을 올리지 못했어요. 다시 시도` |
| `Item deleted` | `“3월 보고서”를 삭제했어요. 실행 취소` when undo is real |

Don't stack multiple toasts for a batch operation. Summarize the verified result: `파일 12개를 옮겼어요. 2개는 옮기지 못했어요.` Then link to details if they exist.

## Interchangeability, not banned-word theater

There is no useful universal blacklist for AI copy. The test is interchangeability:

> Erase the product name. Could a competitor publish this line unchanged? Does it name a real object, state, number, user phrase, or consequence from this product?

If a competitor could ship it unchanged, the line is probably empty or underspecified. Replace it with particular material. Don't merely swap a flagged adjective for another.

Interchangeable:

* `더 나은 경험을 시작하세요.`
* `Unlock seamless collaboration.`
* `스마트한 솔루션으로 업무를 혁신하세요.`
* `Something went wrong.`

Specific:

* `검토가 필요한 주문 12건부터 확인하세요.`
* `Compare both versions before you merge.`
* `배송 전에는 주소를 한 번 바꿀 수 있어요.`
* `Couldn't export the CSV. Remove columns with images and try again.`

Specific doesn't mean adding an unsupported number or feature. Every claim still needs evidence. A factual category label such as `CSV 내보내기` may be exactly right even if another product also uses it. Interchangeability is a review for claims and explanatory copy, not a demand to brand every conventional control.

## Quick review matrix

Before shipping, check each reachable component and state:

| Check | Pass condition |
| --- | --- |
| Truth | The string names no transition beyond the result and storage boundaries. |
| Job | Each compact string has one primary job. |
| Object | Ambiguous actions name their object. |
| Prediction | The CTA predicts the immediate result or destination. |
| Recovery | Errors say what failed and offer an applicable next move. |
| Register | One speaker holds the chosen Korean speech level. |
| Omission | Supporting copy is absent when it adds no new fact. |
| Specificity | Product claims survive the interchangeability test. |
| Layout | No Korean label breaks inside a word, clips, or hides a consequential phrase. |
| Accessibility | Visible copy and accessible names communicate the same action and state. |
| Locale | Dates, prices, units, counters, and plurals use the target locale. |
| Persistence | `saved`, `sent`, `received`, and `completed` match actual system state. |
