# Motion — decision material

Motion in UI is not decoration. It is a communication channel — one that operates faster
than reading and carries information the visual state alone cannot. Used correctly, it
confirms what happened, shows what belongs together, and tells the eye where to look next.
Used incorrectly, it competes with the content for attention and loses.

---

## Duration: what the research says

Nielsen's 1993 response time research establishes three thresholds that remain empirically
reliable across interface contexts:

**Under 100ms**: perceived as instantaneous. No transition is needed or helpful — adding
one makes a fast action feel slow, because the animation is the only delay. A hover state
change, a button press response, a tooltip appearing: if these resolve in under 100ms,
animating them costs more than it buys.

**100–300ms**: the transition zone. Perceptible, processable, not distracting. This is
where UI transitions belong — tab switches, modal entrances, panel slides, state changes
the user initiated and expects to see confirmed. Material Design's motion research places
navigation transitions at 200–300ms. Fast enough to feel responsive; long enough to read
as an intentional event, not a glitch.

**300–400ms**: the edge of interactive. Above this, the user has moved on cognitively
before the animation resolves. Transitions over 400ms feel broken unless they are
communicating a spatial relationship (a bottom sheet rising into position from below) or
the concept demands it (a luxury product whose register is unhurried).

**Above 400ms**: attention-consuming. Every millisecond above 400 spends attention budget
without certain return. Micro-interactions, hover effects, and state changes must never
exceed 400ms. Entrance animations for content on first load can reach 600ms if the page is
itself the delivery — a portfolio case study, a campaign page — but not if the page is a
tool the user came to use.

The single most common error is 500ms ease-in-out applied uniformly. This number is wrong
for three independent reasons: too slow for micro-interactions, too fast for meaningful
spatial motion, and the uniform easing removes any semantic distinction between different
kinds of change. Everything becomes the same sentence in the same tone of voice.

---

## Easing: the semantics of the curve

The easing curve is not an aesthetic choice. It carries a specific meaning about what kind
of event just occurred. Using ease-in where ease-out belongs is not a stylistic difference
— it communicates the wrong thing.

**ease-out** (fast start, gradual deceleration): an object arriving. The quick onset reads
as responsive — something arrived immediately because the system responded to you. The
gradual end reads as the object finding its place, settling. Use for: elements entering
from outside the viewport, overlays appearing, content loading in, drawer panels opening.
This is the "responsive" easing curve: it tells the user that the system heard them
immediately.

**ease-in** (gradual start, fast finish): an object leaving. The slow start reads as
reluctance; the fast finish reads as completion. Use for: dismissals, removals, transitions
out of a context. Almost never correct for entrances — a slow start reads as latency, which
reads as a slow system, which reads as broken.

**ease-in-out** (gradual start, gradual finish): an object transitioning between two
significant states. The equal deceleration at both ends signals that the before state and
the after state both matter — this is a state transition, not an arrival or departure.
Use for: position changes, size changes, content crossfades where both the source and
destination are meaningful.

**linear**: no easing. Use for opacity changes on hover states only — eased opacity on a
hover feels sluggish in a way that is hard to name but immediate to feel. Also correct for
looping animations (a spinner, a progress bar) where acceleration and deceleration would
produce visible stuttering on each cycle.

A design system that uses a single easing curve for all motion has a vocabulary of one word.
It can make things move, but it cannot say anything different about different movements.

---

## Choreography: the rules

**Entrance animations fire once.** On first load, and not again. If they replay on scroll,
the user eventually understands that scrolling triggers a performance, and they stop
scrolling slowly enough to watch it. The animation then delays their reading without
informing it. Scroll-triggered entrance is appropriate only when the interface is a
*presentation* — a long-scroll narrative, a portfolio case study — not when it is a
product the user came to use.

**Sibling stagger: 40–80ms offset.** When related elements enter together, staggering their
arrivals reads the group as a sequence — semantically correct when the elements have an
implied order. Below 40ms the stagger is imperceptible and the stagger code is wasted.
Above 80ms it becomes a waterfall: the user reads each element individually before the
next arrives, turning a group reveal into a slow-loading list.

**Hover feedback: under 150ms.** A hover state that takes more than 150ms to reach its
final state reads as slow. At 80–120ms with ease-out, the system reads as immediate and
precise. The user's pointer moved; the interface answered. Rauno Freiberg's web interface
guidelines (interfaces.rauno.me) specify that animation duration should not exceed 200ms
for interactions to feel immediate — 150ms for hover is the stricter constraint.

**Animate only `transform` and `opacity`.** Animating `width`, `height`, `top`, `left`,
or any property that triggers layout recalculation causes the browser to reflow and repaint
the document on every frame. The GPU cannot help. At 60 frames per second, this causes
visible jank on mid-range hardware. `transform: translate()` and `opacity` are composited
off the main thread — they animate at 60fps on all reasonable hardware without touching
layout. This is not a performance tradeoff to weigh against visual quality; it is a hard
rule with no exceptions.

**No scroll-jacking.** The user controls scroll. Intercepting scroll events to drive
animations or reposition content removes control from the user in a way they can feel but
not name — which is worse than a failure they can describe. NN/g ("Parallax Scrolling",
2013) measured it: usability scores drop, and users who notice report frustration without
being able to articulate what broke. The concept must be extraordinary to justify the cost.

**`prefers-reduced-motion` is not optional.** WCAG 2.1 criterion 2.3.3 (Level AAA) requires a
mechanism to disable non-essential animation. In practice: one media query wraps the
entire motion layer, and in its presence, all transitions reduce to instant opacity changes
or disappear entirely. Not because most users trigger it — because those who need it need
it completely. A motion system that does not honour it is broken for those users,
regardless of how thoughtfully it was built for everyone else.

---

## The motion budget: where to spend it

Every page has an attention budget. Motion spends it. The question is not "what should
move" — it is "what earns the most from being seen moving."

The answer is almost always: one thing per context. The first-load entrance of the primary
content. The hover state of the primary CTA. The transition between two major views. A page
where everything moves is a screensaver: the eye has no hierarchy to follow, so it follows
nothing in particular.

Material Design's motion research (2023): assign motion to the element that carries the
most meaning at the moment the animation fires. A form submission success animation is
wasted if the success state is not the most important thing happening at that moment. Make
the most important thing move; make everything else still. Still elements make moving
elements visible; a page where everything moves makes nothing visible.

---

## Parallax and scroll-linked animation: the restraint case

Scroll-linked parallax — backgrounds moving at a different rate than foreground content as
the user scrolls — became a signature technique of the early 2010s and has since produced
measurable usability damage.

NN/g's research ("What Parallax Lacks", nngroup.com) documents three specific problems:
users scroll quickly to scan for keywords of interest; parallax animations require slow
scrolling to be processed, and users who scroll at their normal speed miss the animated
content entirely. The animation becomes invisible to the audience it was designed for.
Second: banner blindness — users who have seen parallax repeatedly have learned to classify
it as decorative noise and ignore it. Third: for users with vestibular disorders, the
dissociation between their scroll movement and the movement on screen reliably triggers
discomfort or nausea. `prefers-reduced-motion: reduce` removes this for users who set it;
it does not help users who have not discovered the setting.

The performance case is equally clear. In 2024, real-world examples of parallax-heavy pages
showed Largest Contentful Paint (LCP) times exceeding 8 seconds and poor INP (Interaction
to Next Paint) scores — Core Web Vitals failures that affect search ranking as well as
user experience.

Condition → choice → reason: use scroll-linked animation only when the content is itself
a scroll-narrative (a case study, a product demo that teaches while scrolling) and the
concept explicitly requires it. For product UI, remove all parallax. The budget it consumes
returns nothing.

---

## Microinteractions: the Saffer framework

Dan Saffer's *Microinteractions: Designing with Details* (O'Reilly, 2013) defines the
four-component structure that governs every small moment in a UI:

**Trigger**: what initiates the microinteraction. Either a user action (clicking a button,
focusing an input, swiping) or a system condition (a value threshold crossed, a timer
expiring, a notification arriving). The trigger must be discoverable — hidden triggers are
interaction debt, not delight.

**Rules**: what happens after the trigger fires. The complete behaviour of the system in
response — what changes, in what order, by how much. Every edge case the rules don't
cover produces unexpected behaviour the user did not expect and the designer did not intend.

**Feedback**: the signal to the user that their action was received and the rule is
executing. Feedback can be visual (a checkbox check animates in), auditory (a success
tone), haptic (a vibration), or motion-based (a button compresses on press). Absent
feedback, the user cannot confirm their action was registered and will repeat it — the
mechanism behind double-submissions on slow forms.

**Loops and modes**: how long the microinteraction runs and whether it changes behaviour
on repetition. A "like" animation that runs once is a loop of one. A notification badge
that counts up is a loop that runs until cleared. A mode is a variant of the
microinteraction that activates under a different state (the muted mode of a volume
control).

The design implication: every interactive element should be audited against these four
components. If any component is missing or undefined, the interaction is incomplete. Missing
feedback is the most common defect — it produces the user experience of interacting with
a broken system.

---

## Skeleton screens vs spinners: the performance perception research

Loading states are not equally effective at managing the perception of time. The choice
between a spinner and a skeleton screen changes what the user believes about the system's
responsiveness.

**Spinners** communicate system activity: "I am working." They provide no information
about what is coming, how much there is, or how long it will take. Under any uncertainty
about wait duration, spinners increase anxiety — the user cannot estimate, and estimation
is how humans manage waiting.

**Skeleton screens** communicate structural presence: "The layout is here; the content is
arriving." By showing the shape of the content before the content loads, the skeleton
gives the brain a structure to place the incoming data. Research comparing skeleton screens
to spinners and progress bars (NN/g, "Skeleton Screens vs. Progress Bars vs. Spinners",
2020) shows that skeleton screens are perceived as faster even at identical actual load
times, and studies show they can reduce abandonment by up to 30% by communicating that
progress is already happening.

Condition → choice → reason: use skeleton screens for page-level content loads where the
layout is predictable (a list of cards, a article page, a dashboard grid). Use spinners for
short indeterminate operations where the structural result cannot be previewed (file upload
progress, authentication, payment processing). Never use a skeleton where the actual
layout will be substantially different from the skeleton — a skeleton that does not match
what loads is more disorienting than a spinner that made no promises.

---

## The FLIP technique: performance as a design constraint

FLIP (First, Last, Invert, Play) is a browser animation technique that enables smooth
transitions between arbitrary layout states by computing the difference between two static
positions and animating that difference as a `transform`, rather than animating the layout
property directly.

The technique: record the element's position before the change (First). Apply the change
and record the new position (Last). Apply a `transform` that moves the element back to its
First position instantly (Invert). Animate the transform to zero (Play — which visually
moves the element from its old to its new position while only touching `transform`).

The design consequence: FLIP enables animations that would otherwise require animating
layout properties — a card expanding to fill the screen, an item reordering in a list, a
grid reconfiguring. Without FLIP, these are either unanimated (abrupt, disorienting) or
animated with layout-touching properties (jank, dropped frames). FLIP makes them smooth
at 60fps.

The constraint: FLIP only works when the start and end states are both valid layout states.
A design that requires animating through an intermediate state that is not a valid layout
state cannot use FLIP. This is a genuine design constraint — some transitions need to be
re-designed so that their start and end states are both in CSS, not procedurally computed.

---

## Motion cookbook

The implementation primitives that put this theory into practice — split-text entrance,
scroll-reveal, stagger orchestrator, sticky scene, section colour inversion, marquee,
magnetic hover, page loader, number counter, image hover distortion, view transitions,
and parallax — are in `core/motion/recipes/`. The easing token vocabulary (--ease-out-expo,
--ease-out-back, --ease-spring, and the full curated set) is in `core/motion/easing.md`.
Recipes reference the theory here; the hand wires the recipe parameters from the board's
motion studies.

## Sources

- Nielsen, "Response Times: The 3 Important Limits" (1993) — 0.1s / 1s / 10s thresholds
  and their perceptual basis
- Material Design, Motion (2023) — duration guidelines, easing system, choreography rules,
  budget allocation
- NN/g, "Parallax Scrolling" / "What Parallax Lacks" (2013, nngroup.com) — usability
  evidence against scroll position–driven animation; banner blindness and goal-oriented
  scanning
- WCAG 2.1, criterion 2.3.3 — Animation from Interactions; the accessibility baseline
- Saffer, *Microinteractions: Designing with Details* (O'Reilly, 2013) — trigger/rules/
  feedback/loops framework for small interaction design
- NN/g, "Skeleton Screens vs. Progress Bars vs. Spinners" (2020) — perceived performance
  comparison; skeleton screen abandonment reduction evidence
- Rauno Freiberg, Web Interface Guidelines (interfaces.rauno.me) — 200ms interaction
  ceiling, animation proportional to trigger size
- Fast Company, "Why parallax scrolling needs to die" (2019) — performance and cognitive
  load argument
- Gamache, "Parallax Done Right" (Medium, 2014) — performance constraints and the GPU
  compositing argument for transform-only animation
