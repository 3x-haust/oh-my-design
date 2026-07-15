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
what has happened, and what can happen next. A user who cannot identify the primary action
within three seconds of arriving has been failed by the design before they began.

Condition → choice → reason: before choosing any visual direction, name the primary task
in one sentence. If the task cannot be named, the frame is not done. The single most
important action on any screen should be visually singular — one primary button per view,
as specified by Material Design and Carbon Design System not as a preference but as an
explicit structural constraint. Two filled buttons of equal visual weight cancel each other;
the user cannot determine which path the system wants them to take, which is equivalent to
offering no direction at all.

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

---

## Navigation and information architecture

Navigation communicates structure before the label is read. The hierarchy of a navigation
system — what appears at the top level, what is nested, what is hidden behind disclosure —
is an argument about what matters most to the user.

The misapplication of Miller's Law to navigation is documented in `components.md` and not
repeated here. The correct constraint is visual, not mnemonic: navigation items compete
with content for attention. The practical ceiling for top-level navigation is five to seven
items, limited not by working memory capacity but by the visual threshold below which
labels compress too much to scan reliably.

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

**Mobile navigation.** On narrow viewports, the primary action must remain reachable with
a thumb in the natural grip position — roughly the bottom third of the screen. Navigation
systems that push primary actions above the fold at 1280px viewport but behind a top menu
at 375px have not been designed for mobile; they have been designed for desktop and scaled
down. WCAG 2.1 added touch-target and orientation requirements; WCAG 2.2 added an explicit
minimum target size of 24×24 CSS pixels. These are floors, not aspirations — a 44×44px
touch target (Apple HIG, Material Design) is the established usable minimum.

---

## Flows: steps, defaults, and dead ends

A flow is a sequence of states with a defined entry and a defined end. The design of a
flow fails in three characteristic ways: it has too many steps, it has states with no exit,
or it defaults to the wrong choice.

**The step count problem.** Baymard Institute's large-scale checkout usability research
(baymard.com) documents that the average e-commerce checkout contains 23.48 form elements
and 14.88 form fields, while an optimized checkout can function with 7–8 form fields. The
result is that 18% of US online shoppers have abandoned an order specifically because the
checkout process was too long or complicated. The design constraint is not "as few steps
as possible" — it is "only the steps the user's task requires." A step that exists because
an engineer needed the data, not because the user needs to make a decision, is an obstacle
dressed as a form field.

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

**Every state needs a designed state.** A view that the user can reach must be designed —
not just the happy path, but every branch. Loading, empty, error, success, disabled,
and offline are each required in the design contract (`design.md`), not because a
checklist demands it, but because a user who hits an undesigned state experiences
something the designer never saw and therefore never fixed.

---

## Forms: what this file adds

The core form guidance lives in `components.md` — validation timing (blur not keystroke),
the single-column layout research, and the Baymard inline-validation findings. This section
adds what is missing there: the multi-step versus single-page decision and error recovery.

**Multi-step versus single-page forms.** The decision is not aesthetic. A single-page form
shows the user the full cost upfront — every field visible, every requirement readable
before the first character is typed. This is appropriate when the form is short (under
eight fields) and the relationship between fields is visible. A multi-step form reveals
the cost progressively — each step introduces its own subset of fields, with a visible
progress indicator. This is appropriate when the total field count is high (8+), when
later fields depend on earlier answers, or when the user's mental load at any single step
would otherwise be too high to complete.

The Baymard research on checkout usability found that the median checkout flow at
5.1 steps performs better for abandonment than single-page long forms, specifically because
users can see their progress — a visible progress indicator reduces perceived effort even
when actual effort is identical. The measurement is not the number of clicks; it is
whether the user understands, at every step, how far they have come and how far remains.

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

The Doherty Threshold (Doherty and Thadani, IBM Systems Journal, 1982) established that
computer and user productivity increases when response time falls below 400 milliseconds.
Below 400ms, the user remains in the flow of the task; above 400ms, attention drifts and
the cost of re-engaging accumulates. The threshold is not a performance target in the
infrastructure sense — it is a design target in the perception sense: any action the user
initiates must produce visible acknowledgment within 400 milliseconds.

The acknowledgment does not need to be the result. It needs to be evidence that the system
received the action and is working on it. A button that submits a form and produces no
visual change for 800 milliseconds has failed the Doherty Threshold; the user does not
know if the click registered, and the uncertainty produces re-clicks, double submissions,
and frustration. The fix is an intermediate feedback state — a loading indicator, a button
state change, an inline spinner — that fires within the first 200–300ms and persists until
the result arrives.

Condition → choice → reason: every interactive element must change state within 400ms of
activation. Button pressed states must be instantaneous (<100ms, perceived as instant per
Nielsen's 1993 response-time research). Loading states that persist beyond 400ms require
a visible progress indicator. Loading states beyond one second require either a skeleton
screen (when the structure is known) or an explicit progress mechanism. The `motion.md`
theory file covers skeleton versus spinner evidence.

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
be completed before the user can use the product — consistently produce lower retention
than contextual guidance because they demand attention before the user has experienced the
product's value. The user is being taught before they have a reason to learn.

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
satisfies both poorly. The touch target minimum (44×44px Apple HIG, 24×24px WCAG 2.2
AA Level) is not an accessibility accommodation — it is a usability requirement for anyone
using a touch screen at any level of dexterity. Focus ring visibility is not an
accessibility accommodation — it is required for anyone navigating by keyboard, which
includes power users in every domain.

Condition → choice → reason: accessibility requirements are UX requirements with formal
documentation. When a design decision would fail WCAG 2.2 AA, it would also fail a
usability review. Use WCAG criteria as test conditions against which to evaluate UX
decisions, not as a separate compliance checklist applied after the design is complete.

---

## Korean market specifics

The Korean mobile market is among the most mobile-first in the world; smartphone
penetration and usage time per day consistently exceed global averages. This has direct
UX implications: assumptions about hover interactions, large-viewport layouts, and
desktop-primary navigation patterns are wrong for the majority of Korean users.

Toss (Viva Republica) provides the most documented Korean fintech UX case study. The
product's founding insight was that the existing Korean banking UX required fourteen steps
to transfer money — certificate download, USB authentication, mandatory desktop browser.
Toss's 2015 MVP reduced this to a single swipe by treating the existing complexity not as
an unavoidable technical constraint (Tesler's Law: every system has irreducible complexity)
but as complexity that had been pushed to the user by systems that could carry it
themselves. Toss carried the complexity in the system and left the user with one decision:
amount and recipient.

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

1. **System status**: Does the user always know what state the system is in? Can they see,
   within 400ms of any action, that the action was received?

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

- §Task-first framing (the three anchor questions) → `FRAME-UX-INCOMPLETE` (ux): the frame
  artifact exists but does not record what task the user arrives with, the most frequent
  action, or the costliest error. Measurable as field presence in the frame's YAML
  frontmatter. Scope: artifact completeness only — the harness cannot verify the build
  serves the named task (that requires the eye agent's task-first walk).

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

- §Feedback and system status (Doherty Threshold, 400ms): whether every interactive
  element changes state within 400ms. Requires timing measurements under interaction,
  not a static IR snapshot.

- §Cognitive load and progressive disclosure: whether secondary actions are visually
  subordinate to the primary action. Requires semantic understanding of the hierarchy
  intent, not structural measurement alone.

- §First-run experience and empty states: whether empty states are designed. Requires
  rendering the page in its empty data state, which the static IR cannot do.

- §The peak-end rule: whether the end of each flow is deliberately designed. Requires
  task simulation and emotional salience evaluation, not structural measurement.

- §Korean market specifics: whether hover-first patterns are avoided on mobile. Partially
  covered by WCAG touch-target rules (hit-area.yaml) but interaction-pattern analysis
  requires the eye agent's task walk.

- Nielsen heuristics 2, 4, 7, 8, 10 (real-world match, consistency, efficiency, minimalism,
  help): all require semantic content understanding that the IR does not provide.

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
