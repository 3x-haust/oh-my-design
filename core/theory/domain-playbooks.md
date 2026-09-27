# Domain playbooks

These playbooks turn a product noun into an operating model. They don't replace domain observation. Treat every object, state, and example below as a hypothesis until a real service, first-party artifact, or user confirms it. Example data is fictional but plausible and must stay marked as demo data.

## How to use a playbook

1. Name the user's role, repeated task, costliest error, and source for each domain fact.
2. Select only reachable surfaces and states. Don't copy the full playbook into every product.
3. Put the work object in the first viewport. Product screens don't need a hero.
4. Choose density from scan frequency, object count, decision complexity, and device, not fashion.
5. Test one complete loop, including failure and recovery, with representative data.

State notation uses `A -> B`, with brackets for a condition.

## Dashboard and analytics

- **Core objects:** metric, dimension, segment, event, time range, target, alert, report, saved view.
- **Primary loops:** scan health -> spot exception -> filter or compare -> inspect cause -> share or act; define metric -> validate query -> publish -> monitor.
- **Key states:** `draft metric -> validated -> published -> deprecated`; `normal -> threshold warning -> breached -> acknowledged -> resolved`.
- **Density norms:** 4 to 8 decision metrics above the first scroll; 6 to 12 visible table rows at comfortable density or 12 to 20 for trained operators; no more than 2 primary comparison dimensions in one chart. Show timestamps and filter scope next to results.
- **Dangerous actions:** changing metric definitions, deleting shared reports, broadening data access, backfilling events, and muting alerts. Show impact, affected viewers, and an undo or version restore path.
- **Mobile transformation:** replace wide grids with a priority stack; preserve date range, alert status, and one comparison; turn dense tables into sortable record summaries; defer chart editing, not chart reading.
- **Typical IA:** Overview, Explore, Reports, Alerts, Metrics, Data quality, Admin. Saved views belong near Explore, not in account settings.
- **Example data:** `활성 이용자 128,430`, `전주 대비 +4.8%`, `결제 전환율 3.42%`, target `3.80%`, updated `2026.09.26 14:20 KST`; segment `신규 가입자`, source `orders_v3`.
- **AI failures to avoid:** equal card grids, unlabeled demo numbers, a donut for every ratio, hidden filter scope, fake real-time badges, axes without units, and decorative gradients competing with exceptions.

## Admin and ERP back-office

- **Core objects:** order, purchase order, invoice, stock item, warehouse, supplier, employee, approval, audit event, role.
- **Primary loops:** locate record -> inspect status and history -> edit or approve -> validate -> commit -> continue queue; select records -> review scope -> bulk act -> reconcile exceptions.
- **Key states:** `draft -> submitted -> approved -> fulfilled -> reconciled -> closed`; branches: `submitted -> rejected -> revised`, `fulfilled -> partially received -> received`.
- **Density norms:** default rows 36 to 44 CSS px, compact option 28 to 36 for trained users; keep identifiers, status, amount, owner, and due date visible; bulk selection must not move when filters change.
- **Dangerous actions:** posting financial entries, stock adjustment, payroll export, role changes, supplier bank edits, and bulk deletion. Require reason, scope preview, reauthentication where warranted, audit log, and reversal rules.
- **Mobile transformation:** focus on approvals, lookup, scan, and exception handling; use record summaries instead of shrinking a 14-column table; pin the current record ID and primary action; keep full configuration on larger screens when mobile would raise error risk.
- **Typical IA:** Work queue, Orders, Inventory, Purchasing, Finance, People, Reports, Administration. Role and site determine visibility.
- **Example data:** purchase order `PO-2026-09184`, supplier `한빛포장`, total `₩18,740,000`, warehouse `김포 2센터`, expected `2026.10.02`, status `부분 입고`, `84 / 120개` received.
- **AI failures to avoid:** consumer-app whitespace, every action as an icon, status encoded by color alone, row actions hidden only on hover, destructive bulk action next to export, invented operational KPIs, and cards replacing comparable rows.

## Commerce: catalog, product detail, cart, checkout

- **Core objects:** product, variant, category, inventory unit, price, promotion, cart line, address, shipment, payment, order, return.
- **Primary loops:** browse or search -> compare -> inspect product -> choose variant -> add -> review cart -> identify -> delivery -> pay -> confirm; order -> track -> return or exchange.
- **Key states:** `product active -> low stock -> out of stock -> discontinued`; `cart -> checkout started -> payment authorized -> order confirmed -> fulfilled -> delivered -> return window closed`; failure branches preserve the cart.
- **Density norms:** catalog cards show only facts that change choice; comparison keeps 3 to 5 differentiating attributes; product detail places title, price, variant availability, delivery estimate, and purchase action together; checkout uses one clear task per section.
- **Dangerous actions:** final payment, removing the last cart copy of a scarce item, changing delivery after dispatch, return cancellation, and saved payment changes. Restate amount, delivery, recipient, and refund consequence.
- **Mobile transformation:** sticky purchase summary may show price, selected variant, and action without hiding content; filters become a sheet with applied-count feedback; cart lines stack but quantity and removal remain explicit; payment errors stay inline.
- **Typical IA:** Catalog, Search, Category, Product, Cart, Checkout, Confirmation, Orders, Returns, Account.
- **Example data:** `무광 스테인리스 텀블러 590 mL`, color `솔트 화이트`, `₩34,900`, stock `7개 남음`, delivery `9월 29일 도착 예정`, cart subtotal `₩69,800`, shipping `무료`.
- **AI failures to avoid:** stock imagery in place of product truth, hidden variant selection, crossed-out fake discounts, surprise costs, disabled checkout without reason, guest checkout omission, generic trust badges, and confirmation without order number or next step.

## SaaS billing and subscription

- **Core objects:** workspace, plan, entitlement, seat, usage meter, invoice, payment method, credit, tax profile, subscription.
- **Primary loops:** inspect usage -> compare plan consequence -> upgrade or downgrade -> confirm proration -> receive invoice; add seats -> invite -> reconcile billed count; payment failure -> update method -> retry.
- **Key states:** `trial -> active -> past due -> grace period -> suspended -> canceled`; `upgrade pending -> effective`; `downgrade scheduled -> effective at renewal`; `invoice draft -> open -> paid | void | uncollectible`.
- **Density norms:** current plan, renewal date, billed unit, usage, limits, and next charge fit in one summary; plan comparison emphasizes changed entitlements, not a wall of checkmarks; invoice tables stay compact and downloadable.
- **Dangerous actions:** canceling, downgrading below current usage, removing a payment method, changing billing owner, and deleting tax data. State effective date, lost access, retained data, proration, and recovery window before commitment.
- **Mobile transformation:** stack billing facts in reading order; keep amount and effective date adjacent to confirmation; comparison may become one plan at a time with a persistent current-plan marker; never hide cancellation behind desktop-only navigation.
- **Typical IA:** Plan and usage, Seats, Payment methods, Invoices, Tax details, Credits, Billing contacts.
- **Example data:** workspace `모노랩`, plan `Team`, `18 / 25석`, API usage `8.4M / 10M`, next charge `₩462,000` on `2026.10.01`, credit `₩24,000`.
- **AI failures to avoid:** pricing-page marketing inside settings, ambiguous monthly versus annual amounts, no proration preview, cancellation shame copy, fake savings, impossible usage gauges, and success toasts without invoice or effective date.

## Marketplace

- **Core objects:** listing, seller, buyer, offer, inventory, order, escrow payment, shipment, review, dispute, payout.
- **Primary loops:** search -> assess listing and seller -> ask or offer -> transact -> track -> confirm -> review; seller create listing -> moderate -> fulfill -> receive payout; dispute -> submit evidence -> decision -> remedy.
- **Key states:** `listing draft -> review -> active -> reserved -> sold -> archived`; `order placed -> paid/held -> shipped -> delivered -> accepted -> payout released`; branches: `canceled`, `disputed`, `refunded`.
- **Density norms:** search results expose price, condition, location or delivery, seller signal, and availability; detail distinguishes seller claims from platform guarantees; transaction history is chronological and immutable.
- **Dangerous actions:** off-platform contact exposure, payment release, offer acceptance, payout account edit, dispute closure, and moderation. Use clear party labels and state who holds funds.
- **Mobile transformation:** prioritize photo, title, price, seller identity, delivery, and contact or buy action; make message context carry listing identity; camera upload and shipment proof need resilient resumable flows.
- **Typical IA:** Browse, Search, Sell, Messages, Purchases, Sales, Wallet or Payouts, Disputes, Profile.
- **Example data:** listing `소니 WH-1000XM6, 블랙`, condition `A급`, seller `윤서`, `거래 42건`, price `₩389,000`, offer `₩370,000`, delivery `편의점 택배`.
- **AI failures to avoid:** ratings without count or recency, unclear platform responsibility, mixing buyer and seller actions, fabricated urgency, trusting color as fraud status, and losing listing context in messages.

## Scheduling and booking

- **Core objects:** service, resource, provider, location, availability rule, time slot, attendee, booking, waitlist, cancellation policy.
- **Primary loops:** choose service -> location or provider -> date and slot -> details -> policy -> confirm -> remind -> attend or reschedule; operator publishes availability -> resolves conflicts -> checks in.
- **Key states:** `slot available -> held -> booked -> checked in -> completed`; branches: `hold expired`, `canceled`, `no-show`; `waitlisted -> offered -> accepted | expired`.
- **Density norms:** calendar gives 7-day context on desktop and a focused day or agenda on mobile; show timezone, duration, location, and remaining capacity before selection; don't present unavailable slots as equal choices.
- **Dangerous actions:** canceling inside a fee window, double booking, changing provider or timezone, deleting recurring availability, and booking for another person. State fee and downstream appointments affected.
- **Mobile transformation:** date strip plus slot list beats a compressed month calendar for near-term booking; keep selected service, timezone, and duration pinned; native date controls are acceptable when they preserve constraints.
- **Typical IA:** Services, Availability, Calendar, Bookings, Customers, Waitlist, Locations, Policies.
- **Example data:** `아동 발달 상담`, `50분`, `마포 센터 3층`, `2026.09.30 수요일 15:30 KST`, counselor `김민지`, cancellation `24시간 전까지 무료`.
- **AI failures to avoid:** calendar-first flow before service choice, timezone hidden in settings, unavailable slots that fail silently, optimistic confirmation before server hold, vague cancellation policy, and mobile month grids with tiny targets.

## Messaging and inbox

- **Core objects:** conversation, participant, message, draft, attachment, label, queue, assignment, read state, delivery state.
- **Primary loops:** scan queue -> open conversation -> understand context -> reply or act -> assign or close -> move next; compose -> select recipients -> send -> verify delivery.
- **Key states:** `draft -> sending -> sent -> delivered -> read`; branches: `failed -> retry | edit`; `open -> assigned -> pending -> resolved -> reopened`.
- **Density norms:** desktop supports 2 or 3 panes when context benefits; list rows show sender, subject or excerpt, time, unread and assignment; message measure stays readable while operational metadata remains available.
- **Dangerous actions:** sending to many recipients, sharing sensitive attachments, deleting history, closing unresolved work, and changing assignment. Give recipient and attachment review, undo-send only if real, and a visible audit trail.
- **Mobile transformation:** list and conversation become separate routes with preserved scroll and draft; composer owns the lower viewport when active; thread metadata moves to a sheet; offline and failed-send states remain attached to the message.
- **Typical IA:** Inbox, Assigned to me, Mentions, Drafts, Sent, Queues or labels, Archived, Settings.
- **Example data:** conversation `환불 일정 문의`, customer `박서준`, order `OD-240926-1842`, SLA `1시간 18분 남음`, assignee `지원 2팀`, draft saved `14:31`.
- **AI failures to avoid:** chat bubbles for every professional inbox, no sent versus delivered distinction, generated reply as the dominant action, missing draft persistence, icon-only queue controls, and unread state based on color alone.

## Document and content editor

- **Core objects:** document, block, selection, comment, suggestion, revision, collaborator, permission, asset, publish target.
- **Primary loops:** create -> draft -> format -> review -> revise -> publish; select -> comment or suggest -> resolve; compare revisions -> restore.
- **Key states:** `draft -> in review -> approved -> scheduled -> published -> archived`; `local edit -> saving -> saved | conflict -> resolved`; permission `private -> shared -> public`.
- **Density norms:** canvas gets most width; primary writing measure is roughly 55 to 85 characters; tools appear by selection or stable toolbar; comments and outline may coexist on wide screens but collapse independently.
- **Dangerous actions:** publishing, replacing a revision, changing public access, resolving others' comments, deleting content, and uploading rights-sensitive media. Show version, audience, target, and rollback.
- **Mobile transformation:** focus on reading, light editing, comments, and approval; use bottom or contextual formatting controls; preserve selection and draft through interruptions; complex layout editing may be explicitly desktop-only.
- **Typical IA:** Documents, Recent, Shared, Templates, Drafts, Review, Published, Trash; inside editor: Outline, Canvas, Comments, History.
- **Example data:** document `2026년 4분기 운영 계획`, owner `이하늘`, `마지막 저장 14:32`, `댓글 7`, reviewer `재무팀`, publish target `사내 위키 / 운영`.
- **AI failures to avoid:** toolbars that dominate the canvas, fake autosave, no conflict state, placeholder text that ships, comments detached from anchors, slash-command dependence with no visible path, and destructive delete without revision recovery.

## Settings

- **Core objects:** preference, policy, integration, notification rule, locale, workspace setting, override, change record.
- **Primary loops:** locate intent -> inspect current value and consequence -> change -> validate -> save or auto-apply -> confirm; compare inherited policy -> request override.
- **Key states:** `default -> customized -> reset`; `inherited -> override requested -> approved | denied`; `connected -> degraded -> disconnected`.
- **Density norms:** one clear content column for forms, with 3 to 7 coherent groups per page as a starting layout test, not a navigation law; keep labels, controls, help, and validation close; reserve summaries for complex policies.
- **Dangerous actions:** disconnecting integrations, changing retention, resetting workspace settings, disabling notifications tied to safety, and exposing data. Separate a danger zone and explain affected users or records.
- **Mobile transformation:** side navigation becomes searchable section navigation or a section index; sticky save appears only when unsaved changes exist; keep control labels visible rather than compressing them into icons.
- **Typical IA:** Profile, Workspace, Notifications, Appearance, Integrations, Data, Permissions, Advanced. Group by user intent and permission, not database tables.
- **Example data:** timezone `Asia/Seoul`, language `한국어`, weekly summary `월요일 09:00`, retention `365일`, Slack workspace `monolab.slack.com`, status `연결됨`.
- **AI failures to avoid:** every setting as a switch, instant destructive changes, mixed personal and workspace scope, hidden save model, vague labels such as "Smart mode", and confirmation toasts that don't state what changed.

## Account and security

- **Core objects:** identity, credential, session, device, passkey, MFA method, recovery code, trusted app, security event.
- **Primary loops:** sign in -> verify -> enter; review sessions -> revoke anomaly; add passkey or MFA -> verify -> store recovery; recover account -> prove identity -> reset -> notify.
- **Key states:** `unverified -> verified -> challenged -> authenticated`; `session active -> expired | revoked`; `MFA absent -> enrolling -> active -> recovery`; `account active -> locked -> recovered`.
- **Density norms:** surface current protection, recent security events, and active sessions before promotional advice; dates include timezone or relative plus absolute time; devices show browser, OS, rough location, and last activity without false precision.
- **Dangerous actions:** password reset, MFA removal, recovery-code regeneration, session revocation, email or phone change, account deletion. Require recent authentication, independent notification, and recovery path.
- **Mobile transformation:** support passkeys and platform authenticators; codes allow paste and autofill; don't split six digits into hostile fields unless paste and backspace work correctly; active sessions become readable summaries.
- **Typical IA:** Sign-in methods, MFA, Passkeys, Recovery, Sessions, Connected apps, Security activity, Delete account.
- **Example data:** device `Safari 20 / macOS`, location `서울특별시, 추정`, last active `2026.09.26 14:04 KST`, passkey `MacBook Air`, recovery codes `8개 남음`.
- **AI failures to avoid:** security theater scores without method, exact location claims from IP, lockout with no recovery, MFA setup ending before a verification test, secret values shown after creation, and account deletion hidden or manipulative.

## Customer support and help center

- **Core objects:** article, category, query, case, customer, issue, message, SLA, macro, attachment, resolution.
- **Primary loops:** search -> read -> try -> resolve or contact; submit issue -> triage -> assign -> investigate -> respond -> resolve -> reopen if needed; author -> review -> publish -> measure gaps.
- **Key states:** `case new -> triaged -> assigned -> waiting on support | waiting on customer -> resolved -> closed`; `article draft -> reviewed -> published -> stale -> archived`.
- **Density norms:** help home leads with search and top tasks, not a marketing hero; article width supports reading and step scanning; agent workspace keeps customer context, case history, and reply together; SLA and ownership stay visible.
- **Dangerous actions:** closing or merging cases, sending private notes publicly, exposing customer data, refunding, and applying macros with commitments. Distinguish public reply from internal note by more than color.
- **Mobile transformation:** customer help keeps search, article steps, and contact escalation reachable; agent mobile focuses on triage and urgent replies, with explicit limits for complex account actions.
- **Typical IA:** Search, Categories, Popular tasks, Article, Contact, My cases; agent side: Inbox, Queues, Customers, Knowledge, Reports, Admin.
- **Example data:** case `CS-20260926-481`, topic `배송 주소 변경`, priority `보통`, SLA `42분 남음`, order `OD-240926-1842`, status `고객 답변 대기`.
- **AI failures to avoid:** chatbot gate before human contact, articles made from generic generated prose, no last-updated date, support promises invented by copy, private/public composer confusion, and resolution without a reopen path.

## Onboarding

- **Core objects:** account, workspace, role, goal, setup task, import, invitation, integration, progress checkpoint.
- **Primary loops:** identify minimum context -> create or join -> complete one value-producing action -> invite or import if needed -> return to product; resume unfinished setup -> repair blocker.
- **Key states:** `not started -> in progress -> first value -> adopted`; each task `available -> active -> complete | skipped | blocked`; import `queued -> mapping -> importing -> complete | partial failure`.
- **Density norms:** one primary task and a visible escape; 3 to 6 setup tasks only when each is truly required or high-value; distinguish required, recommended, and optional; progress reflects completed outcomes, not page visits.
- **Dangerous actions:** importing over existing data, inviting a whole directory, granting broad scopes, and choosing irreversible workspace identity. Preview scope and allow a small sample.
- **Mobile transformation:** ask only what can be completed comfortably; camera, contacts, and notification permissions appear at the moment of value with system-level rationale; postpone dense mappings to desktop with a saved handoff.
- **Typical IA:** Welcome, Goal or role, Minimum setup, First task, Optional connection, Completion, resumable checklist in product.
- **Example data:** workspace `새봄복지관`, role `사례관리자`, checklist `2 / 4 완료`, next task `첫 대상자 등록`, import preview `128명 중 중복 3명`.
- **AI failures to avoid:** forced carousel tutorials, asking every preference upfront, confetti before value, fake progress, no skip or resume, empty product after completion, and permissions requested without context.

## Public service and welfare application, Korean context

- **Core objects:** benefit program, eligibility rule, household member, applicant, application, consent, required document, submission, review request, supplement request, decision, payment.
- **Primary loops:** find benefit -> check likely eligibility -> identify or authenticate -> complete application -> attach documents -> review declarations -> submit -> track -> answer supplement request -> receive decision or appeal.
- **Key states:** `임시저장 -> 작성 중 -> 제출 완료 -> 접수 -> 심사 중 -> 보완 요청 -> 보완 제출 -> 결정`; decision branches: `선정 -> 지급 예정 -> 지급`, `부적합 -> 이의 신청 -> 재심사`. Never collapse `제출 완료` and `접수`.
- **Density norms:** one decision group per section; always show program name, applicant, save status, deadline, current step, and required versus optional evidence; long applications need a section index with complete/error status; legal declarations stay readable, not tiny.
- **Dangerous actions:** final submission, consent to data lookup, household data disclosure, replacing official documents, withdrawal, and appeal waiver. Restate declarations, retention or sharing scope, deadline, and what can still be changed.
- **Mobile transformation:** design for phone capture and upload, unstable networks, interruption, and older devices; permit save and resume; show file type, size, page count, upload progress, and per-file failure; don't require desktop for status or supplementation.
- **Typical IA:** 복지 찾기, 자격 확인, 신청서 작성, 서류 제출, 제출 확인, 진행 상태, 보완 요청, 결과 및 이의 신청, 내 신청. Authentication is a step, not the information architecture.
- **Example data:** program `서울형 긴급복지 생계지원`, applicant `김민수`, household `3명`, application `WF-2026-009184`, deadline `2026.10.04 18:00`, documents `주민등록등본 제출 완료`, `임대차계약서 보완 필요`, status `보완 요청`, due `2026.09.29`.
- **AI failures to avoid:** cheerful marketing tone in a stressful flow, eligibility presented as guaranteed before review, government jargon without explanation, a single generic "처리 중" state, lost uploads, inaccessible PDF-only notices, session timeout that erases work, color-only status, and no offline contact route.

### Welfare application content and trust rules

- Use plain Korean, then place the official term in parentheses when legal precision matters. Example: `가구원(함께 사는 가족)` only if that explanation is accurate for the program.
- Separate a preliminary check from an official decision: `신청 가능성이 있어요` is not `지원 대상입니다`.
- For each requested document, explain why it is needed, acceptable substitutes, issue-date limits, and how to obtain it.
- Show the responsible office and a reachable phone or visit route. Don't make chat the only recovery channel.
- Preserve entered data after validation, authentication refresh, upload failure, and back navigation. Warn before a real session expiry and provide a saved-state receipt.
