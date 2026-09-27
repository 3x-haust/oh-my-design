# Information architecture methods

## Start with the object model

A sitemap names destinations. An object model explains why those destinations exist. Build the object model first.

For each object, record:

- user-facing singular and plural names
- identifier and distinguishing attributes
- lifecycle states
- parent, child, and peer relationships
- roles allowed to view, create, change, approve, export, or delete it
- frequent actions and costliest error
- primary entry points, including notifications and deep links
- expected count and growth, such as 12 projects or 400,000 invoices

Example:

```text
Workspace
  has many Members, Projects, Invoices
Project
  belongs to Workspace
  has many Tasks, Documents
  states: active, paused, archived
Invoice
  belongs to Workspace and Customer
  states: draft, open, paid, void, uncollectible
```

Then draft a sitemap that maps user intents to views of those objects:

```text
Home
Work
  Projects
  Tasks
Customers
Billing
  Invoices
  Plans and usage
Administration
  Members and roles
  Integrations
```

Don't mirror database tables. A join table is rarely a destination. One object may appear in several task contexts without becoming duplicate content, provided URLs and labels make the context clear.

## Card sorting

Card sorting tests how participants group and label content.

- **Open sort:** participants create groups and name them. Use when the structure and vocabulary are unsettled.
- **Closed sort:** participants place cards into proposed groups. Use when categories exist and need testing.
- **Hybrid sort:** proposed groups are available, but participants may create another. Use when most of the model is stable.

Cards should be concrete items or tasks, not vague department names. Use 30 to 60 cards for a focused study, remove duplicates, randomize order, and include items likely to expose category overlap.

### Card-sort agent approximation

An agent can prepare, not validate, a card sort:

1. Extract candidate cards from observed product surfaces, support topics, search logs, and user wording.
2. Produce 2 or 3 independent groupings from distinct roles, such as operator, manager, and customer.
3. Build a similarity matrix showing which cards were grouped together across those simulated perspectives.
4. Flag cards that fit multiple groups and labels that use internal jargon.
5. Draft an IA hypothesis from stable clusters.

Label the output exactly as `Agent-generated card-sort hypothesis, unvalidated with participants`. Simulated roles aren't participants. Don't report agreement percentages, confidence, or usability findings from agent groupings.

## Tree testing

Tree testing removes visual design and asks participants to find where they would first go for a task. It tests labels and hierarchy, not page layout.

For each task, record:

- prompt in the participant's language
- expected destination or accepted destinations
- first click
- full path
- direct success, indirect success, failure, and time only if actually measured
- wrong branches and backtracking

Use realistic prompts: `지난달 세금계산서를 내려받으세요`, not `청구 메뉴를 찾으세요`, which gives away the label.

### Tree-path agent approximation

An agent may run a heuristic path review against role and task scenarios:

1. Hide page content and styling. Keep only the proposed navigation tree.
2. For each task, choose the first label that appears to promise the answer.
3. Record ambiguous alternatives, unknown terms, permission conflicts, and dead ends.
4. Revise labels only when the destination's object and scope stay accurate.

Label this `Heuristic tree-path review, unvalidated`. Never call it a tree test unless target participants performed the tasks. The result predicts risky branches; it doesn't establish findability.

## Choose navigation from behavior, scale, and permissions

There is no universal 5 to 7 item ceiling. There is no rule that every mobile product with 3 to 5 destinations needs bottom tabs. Choose the pattern from these criteria:

| Condition | Prefer | Why |
| --- | --- | --- |
| Few destinations used in nearly every session | Persistent tabs, rail, or compact sidebar | Visibility reduces repeated navigation cost |
| Many destinations with clear stable groups | Grouped sidebar or hierarchical menu | Labels and groups stay visible without compressing content |
| One dominant object and occasional secondary areas | Object-local navigation plus small global navigation | Product structure follows the repeated task |
| Hundreds or thousands of objects | Search, recents, favorites, and scoped browse | A menu cannot enumerate the working set |
| Expert high-frequency switching | Persistent navigation plus shortcuts or command palette | Speed matters after discoverability is established |
| Permission-specific modules | Role-filtered navigation with stable remaining order | Users don't scan inaccessible areas |
| Rare settings and legal pages | Utility menu or account area | Persistent prominence would overstate frequency |
| Mobile with 2 to 5 high-frequency peer destinations | Bottom tabs may fit | Thumb reach and persistent visibility help |
| Mobile with one dominant flow, dynamic modules, or long labels | Header, section index, search, or menu | Tabs would imply false peer status or truncate meaning |

Evaluate object count, task frequency, switching frequency, label length, viewport, role variance, and cost of a wrong destination. Count is one input, not the rule.

Navigation may scroll when that is clearer than abbreviating labels. Group labels must be meaningful and non-interactive, or real destinations with distinct content, not both ambiguously.

## Labels

Use the nouns and verbs users employ. Prefer `Invoices` to `Financial artifacts`, and `보완 서류 제출` to `추가 프로세스`.

A label passes when:

- its destination can be predicted before opening it
- it distinguishes itself from siblings
- it retains meaning outside the current page
- role and scope are clear where needed, such as `My cases` versus `Team queue`
- it doesn't depend on an icon, acronym, or tooltip

Stable conventions such as Settings, Help, Cart, and Security should remain conventional unless domain evidence supports another term.

## Breadcrumbs

Use breadcrumbs when users can enter below the top level, when hierarchy is deeper than one level, or when parent context changes interpretation.

- Show location, not click history.
- Each ancestor is a link; the current page is text and carries `aria-current="page"` when represented as a link.
- Use object names where useful: `Customers / 한빛상사 / Invoices / INV-2026-184`.
- On mobile, preserve at least the parent and current title. A back button alone doesn't communicate hierarchy.
- Don't use breadcrumbs to represent workflow progress. A stepper owns that job.
- For objects with multiple valid parents, choose the canonical hierarchy and preserve the entry context separately in Back behavior or query state.

## Role-based navigation

Permissions change what a person can reach, but shouldn't make the product feel randomly rearranged.

1. Define capabilities by role and object action.
2. Remove destinations that contain no reachable content or action.
3. Keep labels, grouping, and relative order stable for shared destinations.
4. Explain request-access paths where users reasonably encounter a restricted deep link.
5. Make acting-as, delegated, and impersonation modes unmistakable and auditable.
6. Recalculate navigation after workspace or role switching, while keeping the current object when access permits.

Don't show disabled global navigation as a catalog of forbidden modules unless discovering and requesting access is itself a real task.

## Deep links and URL state

Every durable view should have a durable address.

- Object identity belongs in the path: `/customers/hanbit/invoices/INV-2026-184`.
- Shareable filters, sort, page, date range, selected tab, and comparison belong in query parameters or a documented route segment.
- Temporary UI such as an open tooltip usually doesn't belong in the URL. A selected record drawer may belong when refreshing or sharing should restore it.
- Browser Back and Forward restore the previous meaningful state without losing edits.
- A deep link checks authentication and authorization, then returns to the same destination after sign-in.
- Invalid, deleted, or inaccessible objects get distinct states with a safe next action. Don't turn all three into a generic 404.
- Avoid personal or secret data in URLs because URLs leak through history, logs, screenshots, and referrers.

## Search versus browse

Use browse when users recognize a category or benefit from seeing the available set. Use search when they know a term, identifier, person, or attribute. Most mature products need both.

Search earns primary placement when:

- the object set is large or changes often
- users arrive with IDs, names, titles, or known terms
- navigation paths would vary by role or vocabulary
- cross-object retrieval is common

Browse earns primary placement when:

- users don't know the available vocabulary
- discovery and comparison are part of the task
- the set is bounded and categories are stable
- policy or eligibility context must be understood before choosing

Scope search clearly. Global search should identify object types and permission boundaries. List search should remain attached to that list and preserve active filters. Zero results must distinguish no match, permission limits, and unavailable indexing where truthful.

## First-click criteria

The first click matters because a wrong branch compounds, but speed alone isn't the standard. Review each top task against:

1. **Information scent:** does the chosen label predict the destination?
2. **Distinctness:** is one option clearly better than its siblings?
3. **Scope:** does the user know whether the destination is personal, team, workspace, or public?
4. **Permission fit:** is the route reachable for this role?
5. **Consequence:** can a plausible wrong click cause data loss, disclosure, or an irreversible action?
6. **Recovery:** can the user return without losing state?
7. **Cross-entry consistency:** does the same object remain understandable from search, notification, and direct URL entry?

A proposed IA is ready for validation when every primary task has one credible first click, ambiguous branches are named, and deep-link states are specified. It is validated only after representative participants attempt representative tasks and the result records their observed paths.
