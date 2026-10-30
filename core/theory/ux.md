# UX — decision material

Visual design is downstream of use. A page that looks extraordinary but leaves the user
unable to complete the task they arrived with has failed. The pipeline measures colour,
type, spacing, and motion; this file governs the layer underneath all of them — how the
thing works: what the user came to do, how they move through it, where errors land, and
what they remember when they leave.

The sources here are checkable. Every claim traces to a named paper, a published study,
or a documented design system constraint. "Research suggests" without a citation is not
evidence — it is a claim that the pipeline's own reasoning would reject anywhere else.

---

## Task-first framing

The first question is not "what should this page look like." It is: what did the user
come here to do, and does everything on the screen serve that task or obstruct it?

Nielsen's first heuristic — Visibility of System Status — is often read as a rule about
loading spinners. It is actually a broader claim about the relationship between user
intent and interface response: the system must help the user understand where they are,
what has happened, and what can happen next. The design should make the current task and
available next move legible without relying on an invented universal time limit.

Condition → choice → reason: before choosing any visual direction, name the primary task
in one sentence. If the task cannot be named, the frame is not done. Action hierarchy follows
the current decision and its consequence, not a quota of one filled button per page. Within one
task region, make the expected advancing action singular unless choices are genuinely equal;
separate independent task regions, peer tools, and equal-choice dialogs may need equal or repeated
treatments. See `components.md` §Action hierarchy by consequence.

**Three brief questions anchor the frame:**

1. What task does the user arrive with? (Not what the product offers — what the user
   came to accomplish.)
2. What is the most frequent action on this screen? (The primary action must be the most
   visually reachable.)
3. What is the costliest error? (The design must make the recovery path from that error
   visible, not the error prevention alone.)

These questions are not rhetorical. They produce concrete constraints. If the costliest
error is purchasing the wrong product, the design needs a clear change-of-mind path before
and after checkout — not just a confirm dialog. If the most frequent action is search, the
search field must reach the top of the page at every viewport, not hide behind a menu.

**Fold a requirement into an existing action before adding one.** Before a requirement becomes a
new button or view, ask whether it can fall out of something the user already does: confirming a
plan can share it, finishing a step can notify the people waiting on it. A field that asks the user
to summarise each item, or a button that asks them to send or tidy something, is a new chore and the
last resort. Work that messenger, map, booking, or payment apps already do is linked to, not rebuilt.

---

## People, entering questions, and breakdown moments

The three frame questions name one task. Most products are opened by people in different
situations, and each arrives with different questions. Write a short situation card for each
situation the brief or evidence supports, usually one to three, chosen because the journey differs
most between them rather than by demographic segment:

- the situation in one line and why the person arrives now;
- three to five things they want to know when they open the product, in their words — questions,
  not feature names — each naming the view where its answer appears;
- what success looks like for them, and the views they mainly use.

Use the brief's own user groups and names when it has them. Everything else is an assumption and is
recorded as one: never invent quotes, interview findings, preferences, or demographic detail
(`protocol/design-practice.md` §Frame from people and material). Age, nationality, or gender enters
only when the brief supplies it or it changes the design, such as who appears in photography.

**The question sets the hierarchy of the view that answers it.** The answer to an entering question
is the first and largest thing in that view's first viewport, and the view's information order
follows the person's question order rather than the feature list. A list row or card carries the
facts that answer the question (for someone comparing, how similar this item is, when, and what it
used). Questions are not composition units: one block per question with the question as its
heading turns the view into a questionnaire. Answer through where the data sits and how large it is
inside an ordinary feed, list, timeline, or card; one curated group on a home view may carry a
question-like title.

**Breakdown moments become states.** Walk each situation before, during, and after use and note
where the person gets stuck: nobody has responded, a deadline passed, every option is unavailable,
a request was refused, the action failed. Each moment leads to a view or state that resolves it.
This derives the reachable states of §Flows from the journey instead of a generic checklist, and a
state no journey reaches is not owed.

**The card is not a reason to add features.** It changes what a view shows first and how it speaks
to the person using it. The brief's flows, scope, and order stay as they are. Write calmly to the
person who arrives anxious or lost; an expert dashboard voice fails them.
([NN/g journey mapping](https://www.nngroup.com/articles/journey-mapping-101/))

---

## Surface types: a work surface is not a landing page

The fourth anchor question, answered at frame time and recorded as `uxSurface`: what kind
of surface is this? The taxonomy has four values, and the choice selects the composition
grammar for everything downstream.

- **marketing** — the surface persuades. A visitor arrives undecided; the page argues a
  proposition with evidence and asks for one action. The scroll IS the experience: a
  message ladder where each section answers the question the previous one raised.
- **product** — the surface serves a repeated task loop. The user arrives with work to do,
  often for the hundredth time; the screen is a tool they operate, not an argument they
  read. Dashboards, consoles, CRUD and admin screens, editors, settings, search results,
  inboxes, checkout steps.
- **editorial** — the surface is read. Documentation, articles, long-form content. Reading
  order, measure, and typographic rhythm dominate.
- **mixed** — a real product with a marketing shell (a landing page plus an app; a docs
  site with a signup path). Name which screens belong to which grammar instead of applying
  one grammar to all of them.

For marketing work, state conversion, awareness, or their explicit priority in the existing
frame task and narrative. Connect that purpose to information order, the next action, performance,
motion and observable validation conditions. If purpose lacks user authority, record a reversible
working decision, not a business fact or a required taste interview. Conversion work still needs
beauty; awareness work still needs usability. Without actual user or outcome evidence, do not claim
improved conversion or understanding.

The misclassification failure is one-directional in practice: generated products default
to the marketing grammar everywhere, because most public web pages a model has seen are
marketing pages. The result is documented in every heuristic audit of AI-generated
"apps": a hero section above an admin table, decorative gradients on data screens, all
information atomized into equal-weight cards, a giant value proposition where the user
needed their queue. Nielsen's eighth heuristic (aesthetic and minimalist design) states
the standard: every element competes with the elements that serve the user's current
task. A hero on a work surface is not neutral decoration — it costs one full viewport of
queue visibility on every single visit.

**Product-surface grammar.** When `uxSurface` is `product`, these conditions replace the
marketing defaults:

1. **The dominant first-viewport anchor is the work object itself** — the table, queue,
   canvas, form, or data view the task loop operates on. Real (or representative fixture)
   data at realistic density is the hero. A value statement is at most one line of
   orientation, never a display-scale headline.
2. **The spine is a task loop, not a message ladder**: orient (where am I, what changed)
   → locate (find the object: navigation, search, filters) → act (the frequent action,
   reachable within the first viewport) → feedback (prompt visible acknowledgment,
   see §Feedback) → next/recover (the loop restarts, or the costliest error is undone).
   Sections are screen regions with jobs in this loop; their order follows task order,
   not persuasion order.
3. **Density follows task frequency, not whitespace fashion** (see layout.md §Density):
   an expert repeated-scan surface earns compact rows and visible volume; onboarding and
   first-run earn air. Marketing whitespace on a queue screen hides the user's work.
4. **Navigation is the model of the product** (§Navigation below): persistent, labeled by
   the user's nouns, marking where the user is. A marketing page can hide navigation
   behind a CTA; a product cannot.
5. **Reachable states are part of the surface, not an appendix**: loading, empty (first
   run AND filtered-to-zero are different states with different copy), error with
   recovery, success confirmation, disabled-with-reason. The empty state is the first
   thing a new user sees — design it as the front door (§First-run below).
6. **Chrome is quiet, data is loud.** Persuasive typography scale belongs to marketing;
   on a work surface the type scale serves scanning (see components.md on tables and
   forms), and one accent color marks the primary action, not the decoration.

**Editor/canvas surfaces** add: the canvas owns the viewport; panels collapse; tool state
is always visible. **Settings surfaces** add: grouped by user intent, one column, each
change confirmed or explicitly saved, destructive actions separated and guarded
(§Flows: dead ends). **Onboarding** add: pull-based, minimum viable configuration to first
value (§First-run), progress visible, every step escapable.

Condition → choice → reason: name `uxSurface` at frame time; if the brief mixes surfaces,
split screens by grammar and record the split. A composer or reviewer who receives
`product` and still reaches for a hero-plus-feature-cards structure is not making a taste
choice; it is a classification defect with a named cause.

---

## Navigation and information architecture

Navigation communicates structure before the label is read. The hierarchy of a navigation
system — what appears at the top level, what is nested, what is hidden behind disclosure —
is an argument about what matters most to the user.

The misapplication of Miller's Law to navigation is documented in `components.md` and not
repeated here. Navigation breadth is constrained by label length, grouping, task frequency,
switching cost, permissions, viewport, and the cost of a wrong destination, not a fixed item
count. Build the object model first, then use the card-sort and tree-testing methods in
`ia-methods.md` to test labels and first clicks.

Jakob's Law (Jakob Nielsen, 2000) provides the underlying principle: users spend most of
their time on other websites. They arrive with a mental model built from everything they
have used before. A navigation system that places settings under "Preferences," a help
section under "Support," and account management under "Profile" matches the mental model
of existing products — it is not copying, it is honoring the model the user already has.
Breaking from convention requires a reason that benefits the user, not a reason that
benefits the brand's desire to feel unique.

Condition → choice → reason: when a navigation structure departs from the established
pattern for its domain (hamburger menus on mobile, tab bars for primary sections, top nav
for tools), record the reason. The departure costs the user's existing mental model; the
design must buy that cost with something the user actually gains.

**Flat versus deep hierarchies.** A flat IA — everything accessible within two clicks —
reduces cognitive load but increases breadth. A deep IA — organized into nested
categories — reduces breadth but demands correct first-click choices from the user. The
research on information architecture (Rosenfeld, Morville, and Arango, "Information
Architecture for the Web and Beyond," fourth edition) argues that structure should follow
mental model, not content volume. The right depth is the depth that matches how users
think about the domain, not how the team organized the database.

**Mobile navigation.** On narrow viewports, the primary task and its next action must remain
reachable without depending on hover or a desktop-only navigation pattern. WCAG 2.2
SC 2.5.8 sets a 24×24 CSS-pixel minimum target-area or spacing requirement with explicit
exceptions; a target below 24px is not automatically a failure when an exception applies.
Apple and Material recommend larger touch targets in their platform systems, but those
recommendations are not the WCAG threshold.
([WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum),
[Apple HIG](https://developer.apple.com/design/human-interface-guidelines/accessibility))

---

## Flows: steps, defaults, and dead ends

A flow is a sequence of states with a defined entry and a defined end. The design of a
flow fails in three characteristic ways: it has too many steps, it has states with no exit,
or it defaults to the wrong choice.

**The step count problem.** Baymard's public checkout research supports reducing unnecessary
fields, avoiding extensive multi-column checkout forms, and making required/optional status
clear. These are ecommerce findings, not a universal maximum field or step count. The design
constraint is not "as few steps as possible" — it is "only the decisions the user's task
requires." A step that exists only to expose the system's data model deserves challenge.
([Baymard checkout UX](https://baymard.com/research-articles/current-state-of-checkout-ux),
[multi-column forms](https://baymard.com/research-articles/avoid-multi-column-forms))

**Defaults must be chosen for the frequent case.** Every input with a default value is an
argument about what most users will want. A country selector that defaults to the United
States on a Korean product is not a neutral choice — it is a wrong choice for most users.
Defaults should be set by observing what most users select when given no pre-selection,
then pre-selecting that. A form that forces every user to actively override a wrong default
has transferred its own design debt onto the user's attention.

**Dead ends are unforgivable.** Every state in a flow must have an exit. An error state
with no recovery path, a success screen with no next action, a form that submits
successfully but returns no confirmation, a modal with no close target: these are design
defects with the same severity as a broken link. Nielsen's third heuristic, User Control
and Freedom, is the formal statement: users need a clearly marked emergency exit to leave
unwanted states without going through a lengthy process. Undo and Redo support at the
system level; a Cancel or Back button at the screen level; a clearly labeled dismiss action
at the modal level — these are not polish, they are load-bearing elements of any flow.

**Every object has a start and an end.** For each object the user makes or changes (`ia-methods.md`
§Start with the object model), name the view where it is first created starting from empty, where it
is seen, where it is changed, removed, or cancelled, and the result after the action: a confirmation
or the changed result made visible, not a silent return to the list. A missing start or end is the
most severe flow gap: the user cannot begin, or cannot tell it worked. Only the change step may be
marked not applicable, with a reason.

**Every verb in the brief has a control, drawn to its start.** When the brief says people add, edit,
reorder, split, remove, invite, or share, the interface shows the means: an add row at the end of the
list, a drag handle, a remove action in the edit view. A view does not stop at showing that items
exist. An add or new control leads to a real view or sheet, never back to itself, and when people
choose from categories they create (groups, folders, tags) there is a place to create and rename
them.

**One-time and outgoing actions show both sides.** A row action done once (write a review, check
in, confirm) becomes a disabled after-state in the same place, and the before and after labels keep
the same frame so only the last word changes: `리뷰 작성` → `리뷰 완료`, `대기 신청` → `신청 완료`.
An action that sends something out (create a link, invite, share) or a one-tap request shows its
state before and after, with a way to undo. A permission request or bulk import records what happens
on refusal and while pending.

**An error changes the element at fault.** The error state is the same view with the same elements;
only the faulty field, row, or item changes. Do not append a new block to announce it.

**Facts are set once.** Dates, times, counts, membership, overlaps, and status names that appear on
more than one view come from one table written before the views, filled with realistic names,
places, and dates from the brief's context. Every view quotes that table and invents none: a heading
that promises `23명` lists those 23, and a remaining count or price is the same wherever it appears.
A status names the object's state, not the viewer's relation to it — `답 기다림` cannot mean my turn
on one view and someone else's on another. Heuristic 4, consistency, covers data as well as words.

**Reachable states need distinct treatment.** Where a task can load, complete with no
content, fail, or succeed, those states must not share one unexplained blank panel or one
generic message. Capture only states that apply to the product: an offline state is not
owed when no offline behavior exists, and a disabled state needs a reason only when the
user can encounter it.
([NN/G empty states](https://www.nngroup.com/articles/empty-state-interface-design/))

---

## Forms: what this file adds

This section explains why form structure matters. `forms.md` owns the operational field-state
table, validation timing, formatting, async checks, dependencies, save and resume, review,
submission, and error-summary focus behavior. `components.md` owns input anatomy.

**Multi-step versus single-page forms.** The decision is not aesthetic or a field-count rule.
Use one page when the whole form is easy to review. Split it when decisions form meaningful
stages, later questions depend on earlier answers, sensitive commitments need review, or
save-and-resume is needed. A stable sequence should expose progress and preserve entered data.

Step count alone does not predict checkout quality. A reported median describes a dataset; it
does not prove that multi-step checkout outperforms one page or that progress causes lower
abandonment. Group fields when stages clarify decisions, then measure completion, correction,
and return behavior in the actual flow.

**Error recovery, not error prevention alone.** Nielsen's fifth heuristic, Error
Prevention, is often implemented as disabling submit buttons until all fields are valid.
This prevents the error state but removes the user's ability to understand what is wrong:
they cannot submit the form to see all errors at once. The better implementation: allow
submission, then present all validation errors simultaneously, each with a specific message
and a clear path to correction. "Please fill in all required fields" is not an error
message; it is an announcement. "Email address is required — please enter the address you
would like the confirmation sent to" is an error message.

Nielsen's ninth heuristic, Help Users Recognize, Diagnose, and Recover from Errors,
specifies the standard in three parts: error messages must use plain language (no codes,
no jargon), they must identify the problem precisely, and they must suggest a constructive
solution. A red field border communicates that something is wrong; the message tells the
user what to do next. Both are required.

---

## Feedback and system status

The Doherty Threshold is a historical response-time heuristic, not a WCAG requirement or a
universal cutoff. Its useful design lesson is prompt acknowledgment: after a user initiates
work, show that the action was received before uncertainty invites duplicate action.

The acknowledgment does not need to be the result. It needs to be evidence that the system
received the action and is working on it. A submission that leaves the interface unchanged
long enough to create uncertainty invites repeat activation. Use an immediate pressed or
pending state, then keep truthful progress visible until the result arrives.

Condition → choice → reason: acknowledge input promptly, then choose feedback that matches
the actual operation. Use meaningful progress for longer known work and an activity
indicator for indeterminate work; do not invent duration or percent. NN/G's response-time
suggestions are heuristics, not conformance thresholds. The `motion.md` theory file covers
skeleton versus spinner evidence.
([NN/G progress indicators](https://www.nngroup.com/articles/progress-indicators/))

**Optimistic UI.** When an action has a high likelihood of success and a low cost of
reversal, update the UI immediately and reverse it if the server response fails. A "liked"
button that fills immediately and reverts on error provides better feedback than one that
waits for the server. The trade: the design must also handle the failure case, showing
a clear error and restoring the prior state. Optimistic UI without a failure state is
a bet on infrastructure reliability that the design should not make silently.

**Skeletons, spinners, and shimmer.** Cross-reference `motion.md`. The research basis:
skeleton screens reduce perceived waiting time (Bill Chung, IBM Design, 2014 internal
research; later replicated in Nielsen Norman Group guidance) by giving the user something
structurally meaningful to look at. A spinner communicates waiting; a skeleton communicates
progress toward a specific layout. Use skeletons when the destination structure is known.
Use spinners when it is not. Never use a full-page loading spinner where a partial skeleton
is available.

---

## Cognitive load and progressive disclosure

Cognitive Load Theory (Sweller, 1988, "Cognitive load during problem solving: Effects on
learning," Cognition and Instruction) established that human working memory has a limited
capacity for simultaneously processing new information. In UI terms: every element on the
screen that requires interpretation draws from a finite pool. When the pool is empty, users
make errors, skip steps, or leave.

Hick's Law (Hick, 1952; Hyman, 1953) provides the measurable version for choice: decision
time increases logarithmically with the number of choices. The implication for UI is not
"never give users choices" — it is that each choice presented at the wrong moment, or
without sufficient context, adds cognitive cost the user may not pay. A dashboard that
shows forty actions on first load forces the user to evaluate forty options before they
can do anything; a dashboard that reveals the most common action first, then surfaces
advanced actions on demand, respects the cost of choice.

Progressive disclosure is the design technique that follows: reveal information and options
progressively, at the moment they are relevant, rather than all at once. The term was
popularized in UI design by Jakob Nielsen; the underlying mechanism derives from Sweller's
finding that reducing extraneous cognitive load frees working memory for the task at hand.

Condition → choice → reason: secondary actions, advanced settings, and destructive
operations should not be visible at the same level as the primary action. The visual
treatment communicates the hierarchy (see `components.md` for button hierarchy); the
information architecture communicates the depth. A settings panel that presents all
settings at once has made every setting equally important, which means none of them is.

**The cost of hiding versus showing.** Progressive disclosure has a failure mode: hiding
information the user needs right now increases time to task completion and error rates.
The decision is not always to hide — it is to order. The most needed information appears
first, in the most prominent position, at full visibility. Information that is needed only
sometimes appears second. Information that is rarely needed is accessible but not
prominent. The order is determined by the frequency of the task, not by the structure
of the database.

---

## First-run experience and empty states

The first time a user encounters a product is the moment the design most frequently
betrays them. A product that is genuinely useful in use but shows an empty container
on first run has lost the user at the door.

Empty states are not failure states — they are opportunity states. Nielsen Norman Group's
research on empty states (nngroup.com/articles/empty-state-interface-design) documents
that in-context guidance displayed when the user has started a task is more effective
than forced tutorials, because in-context help can be applied immediately and is retained
better. An empty list that says "No items found" has communicated nothing useful; an empty
list that says "Add your first item — it only takes a minute" with a visible action to do
so has used the empty state as a launch point.

The Carbon Design System's guidance on empty states formalizes three positive-framing
principles: state the situation in direct terms ("Start by adding data assets"), follow
with a specific action, and avoid negative framing ("You don't have any…" → "Add your
first…"). Negative framing communicates absence; positive framing communicates possibility.

**First-run onboarding.** The research distinction between forced tutorial and contextual
guidance applies at the flow level. Forced tutorials — full-screen walkthroughs that must
be completed before the user can use the product — demand attention before the instruction
is necessarily relevant. Prefer contextual guidance when the product can expose the real
task safely; do not claim a retention effect without product-specific evidence.

Condition → choice → reason: onboarding should be pull-based, not push-based. When the
product cannot be used without initial configuration, a first-run experience is justified;
its goal is to achieve the minimum viable configuration to reach the product's core value
in the shortest possible flow. When the product can be used immediately, defer tutorial
content until the user encounters a gap — an empty state, an error, a feature they have
not yet used. The moment of encounter is when the instruction is relevant and retained.

---

## The peak-end rule: shaping memory

How a user remembers an experience differs from how they experienced it moment to moment.
Kahneman, Fredrickson, Schreiber, and Redelmeier (1993, "When More Pain Is Preferred to
Less: Adding a Better End," Psychological Science) demonstrated in a cold-water experiment
that retrospective evaluations of aversive experiences correlate almost entirely with two
moments: the peak intensity and the final moment. Duration of the experience had nearly
zero effect on the retrospective rating.

The UI application: users' satisfaction with a flow is disproportionately determined by
the most emotionally significant moment (the peak) and the final moment (the end). A
checkout that is slightly tedious but ends with a genuine confirmation — "Your order is
confirmed, and it will arrive Thursday" — will be remembered more positively than a
checkout that is efficient but ends abruptly without acknowledgment.

Condition → choice → reason: design the end of every significant flow as a deliberate
moment, not an afterthought. A form submission that ends on the same page with no
visible change has failed the ending. A checkout that ends on a confirmation screen that
restates the user's decision and names the next step has turned an administrative
transaction into a moment the user will remember as smooth. The peak is harder to
engineer but equally important: identify the single highest-stakes interaction in the flow
and make it worthy of that status — not dramatic for its own sake, but clear, responsive,
and in control.

**Negative peaks compound.** A single humiliating error message, a timeout that loses all
form data, a confirmation dialog phrased in legalese — these become the peak that the user
remembers, because they are the most emotionally salient moment. Protecting against
negative peaks is not about eliminating error conditions; it is about ensuring that the
system's response to error is more helpful than the error itself was frustrating.

---

## Accessibility as a UX floor

The WCAG 2.1 POUR framework — Perceivable, Operable, Understandable, Robust — is a
taxonomy of UX requirements, not a separate accessibility checklist. The Operable
principle (Guideline 2.1) requires that all functionality be operable via keyboard, which
is also required for power users, for users in situations where a mouse is unavailable,
and for any context where the primary input is not a pointer. The Understandable principle
(Guideline 3) requires that information and operation be comprehensible — clear error
messages, predictable page behavior, and consistent navigation: these overlap exactly with
Nielsen heuristics 4, 8, and 9.

Treating accessibility requirements as distinct from UX requirements produces work that
satisfies both poorly. WCAG 2.2's 24×24px target-size or spacing criterion includes
exceptions; larger platform recommendations remain useful design targets, not the WCAG
minimum. Focus ring visibility is not an
accessibility accommodation — it is required for anyone navigating by keyboard, which
includes power users in every domain.

Condition → choice → reason: accessibility requirements are UX requirements with formal
documentation. When a design decision would fail WCAG 2.2 AA, it would also fail a
usability review. Use WCAG criteria as test conditions against which to evaluate UX
decisions, not as a separate compliance checklist applied after the design is complete.
`accessibility.md` owns the applicability matrix, real-browser procedures, and failure signals.

---

## Korean mechanics, not market assumptions

Korean language in the brief can select Korean mechanics testing: real Hangul copy, Korean
wrapping, mixed-script numerals and punctuation, and the product's chosen speech level.
It does not establish a market, audience, cultural preference, device mix, or a "Korean app"
visual style. Those require explicit authority or research. Do not turn one company's
workflow or voice into a national default.

Tesler's Law (Larry Tesler, Xerox PARC, ~1984) — also called the Law of Conservation of
Complexity — states that every application has an irreducible complexity, and the only
question is who holds it: the system or the user. A designer who simplifies the user's
interface by adding complexity to the engineer's task has made the right trade. A designer
who passes complexity to the user to save engineering time has made the wrong one.

Condition → choice → reason: when a flow feels complex, identify whether the complexity
is intrinsic (the task genuinely requires these decisions) or extrinsic (the system is
pushing its own implementation constraints onto the user). Intrinsic complexity can be
helped with progressive disclosure and better defaults. Extrinsic complexity should be
eliminated. The question is not "how do we make this multi-step form less annoying" but
"which of these steps exists for the user's benefit and which exists for the system's."

---

## Heuristic audit checklist

The following ten questions are drawn from Nielsen's ten usability heuristics (Nielsen
and Molich, 1990, refined Nielsen, 1994) and rendered as checkable conditions. Each is a
question, not a test — a design that fails one is not necessarily wrong, but the
failure must be a deliberate choice with a recorded reason.

1. **System status**: Does the user always know what state the system is in? Does an action
   receive prompt, truthful acknowledgment before uncertainty invites a repeat?

2. **Real-world match**: Does the interface speak the user's language, using words and
   concepts from their domain rather than the system's implementation? Does the order of
   information match the order of the user's mental model?

3. **Exit paths**: Can the user undo any non-trivial action? Is there a visible exit from
   every state — including error states, modals, multi-step flows, and loading states that
   run longer than expected?

4. **Consistency**: Do the same words, icons, and behaviors mean the same thing throughout
   the product? Does the product follow the conventions of the platform and domain?

5. **Error prevention**: Are the most common and costly errors made harder to commit —
   through constraints, defaults, and confirmation dialogs for irreversible actions?

6. **Recognition over recall**: Can the user identify their next action without memorizing
   it? Are relevant options visible at the point of need?

7. **Efficiency for experts**: Do frequent users have a faster path — keyboard shortcuts,
   saved preferences, bulk actions — without burdening first-time users with that
   complexity?

8. **Minimalist design**: Does every element on the screen serve the user's current task?
   Is there any element whose absence would make the design clearer?

9. **Error recovery**: When errors occur, are the messages in plain language, specific
   about what went wrong, and constructive about what to do next?

10. **Help when needed**: When the product requires documentation, is it available in
    context at the moment the user needs it — not in a separate page they must find?

---

## Harness enforcement status

The following principles from this file have been converted into deterministic harness
checks that `omd check` runs on every build. Principles not listed here remain advisory
— they require human or eye-agent judgment and cannot be reliably measured from the IR.

**Enforced — fires a violation on measurable evidence:**

- §Task-first framing → `UX-TWO-PRIMARIES` (slop): two or more interactive buttons sharing
  the same authored fill in one container cancel the hierarchy signal. Measurable from
  node.fill.authored + node.computed.isInteractive + node.box.h + node.parent grouping.

- §Task-first framing → `UX-ACTION-BELOW-FOLD` (ux): the only interactive controls are
  entirely below the fold at the capture viewport. Measurable from node.box.y vs
  ir.meta.viewportHeight (recorded by dom.ts at capture time). Guard: silent when any
  interactive element is within the first viewport, so long-scroll pages with a visible
  nav do not fire.

- §Accessibility as a UX floor → `UX-NO-KEYBOARD-PATH` (ux): every interactive control has
  tabindex="-1", making the page unreachable by keyboard. Measurable from node.focusable
  (recorded by dom.ts from el.tabIndex per node). WCAG 2.1 §2.1.1.

- §Task-first framing + §Surface types (the four anchor questions) → `FRAME-UX-INCOMPLETE`
  (ux): the frame artifact exists but does not record what task the user arrives with, the
  most frequent action, the costliest error, or the surface classification. Measurable as
  field presence in the frame's YAML frontmatter. Scope: artifact completeness only — the
  harness cannot verify the build serves the named task or fits the named surface (that
  requires the eye agent's task-first walk).

- §Forms: error recovery → `DESIGN-FORM-NO-ERROR` (system): the page has form inputs but
  no visible error-state affordance. Measurable from node.name class patterns, node.text
  error vocabulary, node.role === 'alert', and node.ariaInvalid. Strengthened to detect
  ARIA-correct implementations (role=alert, aria-invalid) that do not use class-name
  conventions.

**Still advisory — requires human or eye-agent judgment:**

- §Navigation and information architecture: whether a navigation structure matches the
  user's mental model for the domain. Requires domain knowledge the IR does not contain.

- §Flows: dead ends: whether every reachable state has an exit. Requires simulating user
  flows across states, not reading the resting DOM.

- §Flows: defaults chosen for the frequent case. Requires knowing the user population's
  preferences, not the rendered page's current value.

- §Feedback and system status: whether every interactive element gives prompt and truthful
  acknowledgment. Requires timing measurements under interaction, not a static IR snapshot.

- §Cognitive load and progressive disclosure: whether secondary actions are visually
  subordinate to the primary action. Requires semantic understanding of the hierarchy
  intent, not structural measurement alone.

- §First-run experience and empty states: whether empty states are designed. Requires
  rendering the page in its empty data state, which the static IR cannot do.

- §The peak-end rule: whether the end of each flow is deliberately designed. Requires
  task simulation and emotional salience evaluation, not structural measurement.

- §Korean mechanics: whether target-language wrapping and mixed-script rendering remain
  usable in the actual flow. Interaction-pattern analysis still requires the eye agent's
  task walk.

- Nielsen heuristics 2, 4, 7, 8, 10 (real-world match, consistency, efficiency, minimalism,
  help): all require semantic content understanding that the IR does not provide.

- §Accessibility as a UX floor: native form fields without a persistent semantic name are
  surfaced by default rendered measurement as advisory evidence. Full accessible-name
  computation for every custom control and assistive-technology behavior still requires
  the accessibility tree and interaction evidence; screenshots cannot prove it. WCAG 4.1.2.

---

## Official evidence map and layer ownership

- **W3C form notifications** — https://www.w3.org/WAI/tutorials/forms/notifications/ —
  writer supplies specific error/success text; hand associates messages with fields and
  exposes status changes; probes exercise primary and recovery paths.
- **GOV.UK error messages** — https://design-system.service.gov.uk/components/error-message/
  — writer says what went wrong and how to fix it without blame; hand preserves input and
  keeps the message adjacent to the field.
- **Carbon buttons** — https://carbondesignsystem.com/components/button/usage/ — hand keeps
  one clear primary action and uses button hierarchy consistently; eye checks whether the
  frequent action remains reachable on mobile.
- **Carbon empty states** — https://carbondesignsystem.com/patterns/empty-states-pattern/ —
  writer supplies a cause and useful next action only when an empty state is reachable;
  hand does not fabricate emptiness for static or navigation-only surfaces.
- **WCAG 2.2** — https://www.w3.org/TR/WCAG22/ — hand owns native semantics, keyboard/focus,
  target size, status announcements, and reduced-motion implementation; probes provide
  evidence for reachable paths; eye makes no interaction claim without those results.
- **web.dev INP** — https://web.dev/articles/inp — hand produces immediate visible feedback
  and prevents delayed duplicate actions; performance measurement covers click, tap, and
  keyboard interactions across the page lifecycle.
- **web.dev offline data** — https://web.dev/learn/pwa/offline-data — hand implements offline
  storage/recovery only when the product actually supports an offline path; otherwise the
  copy deck records offline as inapplicable with a reason.

The acceptance split is: frame names the primary task, frequent action, and costliest error;
writer supplies primary/recovery language; hand implements native behavior, visible feedback,
value preservation, duplicate-submit protection, reachable exits, and mobile reach; explicit
primary/recovery probes measure applicable paths; eye interprets only supplied evidence.
Static IR rules cannot safely decide task success, semantic recovery, emotional consequence,
or whether a state applies, so those remain prompt/probe/eval responsibilities rather than
broad regex gates.
