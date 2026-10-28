# Motion — decision material

Motion can communicate continuity, acknowledge an action or express a deliberate product
character. It can also compete with reading and control. Start from the relationship
or feedback the task needs, not from an assumption that moving or still is always better.

---

## Transfer a relationship, not an animation preset

Inspect the corresponding interaction in a finished reference when motion materially
serves the requested surface. Follow its trigger, changing object, destination and
return path. The clicked control and moving object need not be the same element.
Static originals establish visible geometry, not duration, easing or interruptibility.
Do not invent a motion-fidelity claim when only a resting screenshot was available.

Try one complete representative interaction with real content before propagating it:

| Relationship | Candidate treatment | What to inspect |
| --- | --- | --- |
| A control reveals related information | Origin and containment make the relationship legible | Focus enters correctly; Escape/close/reopen leaves one current state and returns to the right place |
| A selected object becomes its detail | Preserve the identity that actually persists | Source and destination refer to the same object; cancellation or return does not show a stale copy |
| A small repeated selection changes | Immediate acknowledgement or a short reversible transition | Rapidly alternate targets; the next input is accepted and the active state stays unambiguous |
| A request is pending, succeeds or fails | Distinct persistent status; motion only if informative | Feedback describes actual work; failure preserves input and an actionable recovery path |
| A hover exposes product information | Stable target region and a useful additional view | Pointer transit does not flicker; keyboard and non-hover users can obtain the same information |
| A scroll story explains a mechanism | Progress tied to the meaningful explanation | Fast scanning, reverse scrolling, anchors and a no-motion/unsupported fallback still expose the content |

These are working choices, not a required effect list or another specification file.
Enter, exit, reversal, cancellation and retargeting are different behaviors. A curve
that resembles a spring does not establish velocity-preserving physics. Reuse the
project's mechanism when it fits; choose an immediate change when movement adds no
useful relationship.

Keep three kinds of evidence separate:

- **State evidence:** real action, assertions and settled pixels establish the result.
- **Controlled comparison:** before, a paused/seeked finite-animation sample, and the
  settled result show selected visual states. A local halfway point is not necessarily
  halfway distance, and separately seeking independent animations can invent a scene
  that never occurred in their real choreography.
- **Actual temporal observation:** a real replay or timestamped recording can support
  claims about the observed progression. It is still not a device-performance trace,
  complete-loop proof, reduced-motion test or human aesthetic rating.

Test relevant rapid input, interruption and reduced-motion alternatives as actual
behaviors; do not infer them from pixel energy, a screenshot pass, a media-query string
or the name of a library. Suppress unsupported claims rather than automatically replaying
a side-effecting action merely to collect more frames.

---

## Duration: what the research says

Separate response latency from transition duration. Nielsen's 1993 article discusses
approximately 0.1, 1 and 10 seconds for immediate feedback, uninterrupted thought and
attention during a system response. It does not establish 150ms hover limits, a 400ms
animation ceiling, or a threshold below which animation has no value.

An action should acknowledge input promptly; its visual transition may continue while
the next action is already available. Measure those separately. Do not delay a successful
operation, navigation or readable content merely to finish a decorative sequence.

Choose timing from the component's distance, scale, role, input method and frequency.
A small repeated control and a large occasional spatial transition need not share a
duration. They may legitimately share one token when their roles and behavior match.
Different numbers are not evidence of a richer motion vocabulary.

The ranges below are starting heuristics, not empirical pass/fail boundaries. A spring
may be better specified by response and damping than a fixed duration; a short tween
or an immediate state change may be better for another task. Validate the actual onset,
settling, reversal and interruption in the rendered component.

---

## Easing: the semantics of the curve

Easing contributes to perceived response and continuity, but a curve does not carry one
universal semantic meaning. The following are common design-system starting choices.
Keep a coherent vocabulary and test it against the actual object's movement and use.

**ease-out** (fast start, gradual deceleration) is commonly used for arrivals. It can
make the first change visible promptly while an overlay or drawer settles. Verify
actual input-to-feedback response; choosing the curve alone does not establish it.

**ease-in** (gradual start, fast finish) can suit a departure. On an entrance, its slow
initial progress may delay useful acknowledgement; choose that tradeoff deliberately
rather than treating a curve name as the meaning of the interaction.

**ease-in-out** (gradual start, gradual finish) can suit movement between meaningful
positions or sizes. Test the whole path and reversal behavior: both endpoints matter,
but equal acceleration/deceleration is not required for every such relationship.

**Hover easing follows the property and interaction.** There is no single correct hover curve.
An immediate color or opacity acknowledgement may be linear or use a shallow ease-out. A small
transform that suggests arrival usually benefits from ease-out. A reversible state should return
without lag or overshoot. Judge entry and exit at pointer speed, keyboard focus, and repeated use.
Looping motion often uses linear timing when speed changes would expose the cycle, but an
indeterminate indicator may use a designed velocity profile if the loop remains continuous.

A design system that uses a single easing curve for all motion has a vocabulary of one word.
It can make things move, but it cannot say anything different about different movements.

---

## Choreography: the rules

**Do not replay entrances without a reason.** If they replay on scroll,
the user eventually understands that scrolling triggers a performance, and they stop
scrolling slowly enough to watch it. The animation then delays their reading without
informing it. Scroll-triggered entrance is appropriate only when the interface is a
*presentation* — a long-scroll narrative, a portfolio case study — not when it is a
product the user came to use.

**Stagger only when sequence helps.** A 40–80ms offset is one possible starting
heuristic, not a perceptual threshold. Judge the total sequence with the real item
count, whether order matters, and whether the final item stays accessible. Research on
multiple-object tracking reports mixed outcomes, including benefits in a favorable
condition and deterioration or inconclusive comparisons elsewhere. That task does
not establish an optimal entrance delay for every interface.

**Hover should acknowledge pointer intent promptly.** Evaluate entry, pointer-out,
keyboard focus and rapid movement between neighboring controls. Rauno Freiberg's
200ms advice is a practitioner guideline, not a universal measured limit. Do not block
the click while a hover transition settles, and provide touch/keyboard equivalents
without assuming every device can hover.

**Prefer `transform` and `opacity`, then measure exceptions.** These properties usually avoid
layout and paint work and are the safest default for continuous or large-area motion. They are
not guaranteed to run off the main thread or at 60 fps; layer promotion, rasterization, element
size, memory pressure, filters, and concurrent work still matter.

Short transitions on `color`, `background-color`, `border-color`, and restrained `box-shadow`
are allowed when they communicate hover, focus, selection, elevation, or status more clearly.
Keep the affected area small, avoid continuous paint animation, and measure representative
hardware. Layout properties such as width, height, inset, margin, and padding are the last choice;
prefer FLIP when spatial continuity matters. Accept motion from observed behavior: stable layout,
responsive input, no sustained main-thread blockage, and no visible dropped frames.

**Preserve control of scrolling.** Native scroll-linked effects and replacement of a
user's scroll behavior are different mechanisms. Inspect wheel, touch, keyboard,
anchor navigation and fast scanning. NN/g's 2019 "What Parallax Lacks" describes
qualitative risks such as missed content, blank scenes and loss of control; it does
not report a measured decline in usability scores.

**Provide a reduced-motion path.** OMD's implementation policy is to honor the user's
`prefers-reduced-motion` preference. WCAG 2.2 criterion 2.3.3 (Level AAA) requires that
interaction-triggered motion animation can be disabled unless essential; CSS technique
C39 is one sufficient implementation, not the only possible mechanism. This criterion
is not an AA requirement and does not cover every animation.
Remove nonessential travel, parallax, scale, and
repeated loops; preserve state recognition with an instant change or short non-spatial fade when
appropriate. A blanket opacity conversion is unnecessary. A motion system that does not honour
the preference fails this OMD policy even when its regular-motion version is polished.
Do not equate a media-query declaration or a global 0.01ms override with a working
alternative. Preserve final content, focus, status feedback and task completion; test
code that depends on transition/animation completion events as well.

Keep separate requirements separate: WCAG 2.2.2 (Level A) addresses automatically
starting moving/blinking/scrolling information that lasts over five seconds alongside
other content, with an essential-activity exception. Its auto-updating-information
provision has no five-second threshold. Flash criteria 2.3.1 (A) and 2.3.2 (AAA)
have their own definitions and thresholds; a general motion preference is not a
flash-safety assessment.

---

## Role-based duration and easing

Durations are starting ranges, not universal constants. Distance, size, input method, task frequency,
and device may justify values outside them. Start at the lower end for repeated product work.

| Motion role | Typical duration | Starting easing |
| --- | ---: | --- |
| Pressed or active acknowledgement | 0–80ms | linear or shallow ease-out |
| Hover or focus paint change | 60–140ms | linear or ease-out |
| Tooltip or menu appearance | 80–160ms | ease-out |
| Checkbox, switch, or selection | 100–180ms | ease-out |
| Toast or inline status arrival | 140–220ms | ease-out |
| Popover or small overlay | 140–220ms | ease-out entry, faster ease-in exit |
| Drawer or bottom sheet | 180–320ms | emphasized ease-out |
| Modal transition | 160–260ms | ease-out entry, ease-in exit |
| Reorder or FLIP continuity | 180–320ms | ease-in-out |
| Product route continuity | 180–350ms | ease-in-out or none |
| One-time narrative entrance | 300–600ms | concept-specific ease-out |

Reduced motion removes nonessential travel, parallax, scale, and repeated loops. Preserve state
recognition with an instant change or short non-spatial fade where appropriate; content, focus,
task order, and completion feedback must not depend on animation.

---

## The motion budget: where to spend it

Every page has an attention budget. Motion spends it. The question is not "what should
move" — it is "what earns the most from being seen moving."

Begin with a clear focal event per context. The first-load entrance of the primary
content. The hover state of the primary CTA. The transition between two major views. A page
where everything moves is a screensaver: the eye has no hierarchy to follow, so it follows
nothing in particular.

As a choreography heuristic, assign motion to the element that carries the
most meaning at the moment the animation fires. A form submission success animation is
wasted if the success state is not the most important thing happening at that moment. Make
the most important thing move; make everything else still. Still elements make moving
elements visible; a page where everything moves makes nothing visible.

Restraint is not absence. A launch or marketing page that explains a product through graphics
spends its budget on scenes: each section's protagonist arrives, travels or changes with one move a
visitor actually notices, at the moment its section is read. A few short fades of a few pixels are
not a restrained choreography; they are no choreography. Observe the references the work consulted
with `omd render <url> --motion`, put their notes beside the build's, and when they stage their
content on load or scroll and the build does not, carry over the relationship (what leads, what
travels, what the scroll drives) in this product's own terms.

---

## Parallax and scroll-linked animation: the restraint case

Scroll-linked parallax moves layers at different rates. It can support a spatial
story, but the effect alone is not evidence of good storytelling or usability damage.

NN/g's qualitative observations ("What Parallax Lacks", 2019) describe several risks:
users scroll quickly to scan for keywords of interest; parallax animations require slow
scrolling to be processed, and users who scroll at their normal speed miss the animated
content entirely. The animation becomes invisible to the audience it was designed for.
Second: banner blindness — users who have seen parallax repeatedly have learned to classify
it as decorative noise and ignore it. Third: for users with vestibular disorders, the
dissociation between their scroll movement and the movement on screen can trigger
discomfort or nausea. `prefers-reduced-motion: reduce` removes this for users who set it;
it does not help users who have not discovered the setting.

Do not infer performance from the name of the effect. Inspect the actual images,
layers, script work and input responsiveness on representative devices. No identified
measurement supports the former claim here that 2024 parallax pages caused LCP above
eight seconds and poor INP.

Condition → choice → reason: choose scroll-linked motion when spatial continuity or
a narrative relationship helps the task. Preserve fast scanning, navigation and content
access when the effect does not run. A separate 2015 parallax experiment found mixed
outcomes, including no significant perceived-usability difference; neither that study
nor NN/g establishes a universal product-UI ban.

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
feedback, the user may be unable to confirm their action was registered and may repeat
it. Motion is one acknowledgement channel; it does not replace duplicate-submission
protection or truthful pending/result states.

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

**Spinners** acknowledge system activity without conveying amount or remaining duration.
If actual progress is measurable, show it truthfully rather than inventing a percentage.
An indeterminate signal can be appropriate when the operation has no reliable estimate;
do not assume one indicator universally creates or reduces anxiety.

**Skeleton screens** expose the expected structure while content arrives. Whether that
feels faster than an indeterminate spinner depends on the actual wait and destination.
Do not claim a perceived-speed or abandonment improvement without relevant measurement.

Use a skeleton when the destination structure is stable and loading is long enough for a
placeholder to help. Match the final geometry, avoid shimmer when stillness is clearer, and keep
content that has loaded visible. Use a spinner or progress indicator for short operations, unknown
result shapes, authentication, payment, and file processing. Measure completion, duplicate actions,
and perceived delay in the actual product before claiming an outcome.

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
grid reconfiguring. FLIP can reduce repeated layout work during playback, but it does
not guarantee a frame rate. An immediate change or another layout-animation mechanism
may be appropriate. Measure the initial layout reads, transformed content, raster work
and concurrent input on representative hardware.

The constraint: FLIP only works when the start and end states are both valid layout states.
A design that requires animating through an intermediate state that is not a valid layout
state cannot use FLIP. This is a genuine design constraint — some transitions need to be
re-designed so that their start and end states are both in CSS, not procedurally computed.

---

## Observing choreography

A still frame cannot show order, overlap or feel. `omd render <page> --motion` samples every
content element's rendered position and effective opacity on each animation frame during load and
during a wheel-driven scroll-through, then reports grouped tracks, beats, regular staggers, an
easing shape from progress at 25/50/75% of each move, scrubbed versus triggered scroll motion,
pinned content, visible layout jumps without a tween, and a reduced-motion pass. It writes
`timeline.json` and one `contact-sheet.png` (frames plus a load Gantt). Use it on a live reference
to read how its sequence is built before transferring the relationship, and on the build to see
whether the intended lead and rhythm actually happened. Durations are perceived durations: a long
expo tail below a pixel per frame ends earlier than its declared value. Clip-path, filter, canvas
and WebGL motion appear only in the frames. Notes describe what happened; whether lockstep entry
or one shared timing is right for the content remains a design judgment.

## Motion cookbook

The implementation primitives that put this theory into practice — split-text entrance,
scroll-reveal, stagger orchestrator, sticky scene, section colour inversion, marquee,
magnetic hover, page loader, number counter, image hover distortion, view transitions,
parallax, a role-based hero intro sequence and a pinned, scrubbed scroll scene timeline
(CSS sticky pin, Motion scrubbing, optional Lenis) — are in `core/motion/recipes/`. The easing token vocabulary (--ease-out-expo,
--ease-out-back, --ease-spring, and the full curated set) is in `core/motion/easing.md`.
Recipes reference the theory here. The author selects a mechanism that fits the
inspected component and existing stack; recipe presence is not evidence that a product
needs the effect. Recipe values are examples, not research-backed universal constants.

## The implementation stack

Use the existing stack and native platform features when they are sufficient. Do not
install a motion library or add a recipe merely to demonstrate ambition.

**CSS when it fits.** `animation-timeline: view()`/`scroll()` can tie progress directly
to scroll position in supporting browsers without JavaScript. Scroll-driven progress
does not guarantee compositor execution; the animated properties and browser matter.
Keep content reachable and legible when the feature is unsupported or disabled.
Prefer `transform` and `opacity` for continuous or large-area motion; allow
measured small-area paint transitions where they communicate state more clearly. A CSS `transition`
conveniently retargets a reversible state change. Keyframe animations can also be
cancelled or replaced; WAAPI can control progress, reversal and cancellation explicitly.
Choose the mechanism from the required state behavior, not a blanket claim that one
API is interruptible and another is not.

**A library where the mechanism justifies it.** Only add a library whose shipped licence is
free with no use restrictions (MIT, ISC, Apache-2.0, OFL-style); a "free" label or a custom
licence with field-of-use clauses does not qualify. Then check the existing dependency policy
and bundle cost. Motion (`motion`, MIT) is the default when the scene needs timeline
orchestration, scrubbed sequences across several elements, spring physics or layout
transitions — things a CSS timeline cannot express. Pin with CSS `position: sticky`; a Motion
sequence passed to `scroll(timeline, { target })` is scroll-position-scrubbed in exactly the sense
the evidence contract requires, while an `inView` callback that starts a timed animation is not and
does not qualify. Smooth-scroll libraries (Lenis, MIT) are a separate, optional layer: they change
the feel of scrolling itself and must not be the thing that makes content reachable.

**The frequency rule cuts the other way.** A high-frequency, keyboard-initiated interaction —
a command palette, a context menu, a tab switch — may benefit from an immediate or
short transition. Repeated use must not queue an animation or delay accepting the next
input. An occasional expressive transition may earn more time; infrequency alone
does not justify delaying content or adding an artificial loading scene.

**Main-thread independence decides the library.** A `requestAnimationFrame`-driven animation (the
execution path in some libraries) competes with other main-thread work. Compositor-eligible
CSS or WAAPI animations can continue during main-thread work, but layout/paint-dependent
properties, rasterization and layer costs still matter. Libraries can use different
backends for different effects. Inspect the actual execution path and trace; the name
of the API or framework does not guarantee smoothness.

## Sources

- Nielsen, ["Response Times: The 3 Important Limits"](https://www.nngroup.com/articles/response-times-3-important-limits/)
  (1993) — response latency, not universal animation durations.
- Material Design, [Motion](https://m3.material.io/styles/motion/overview/how-it-works)
  and [animated icons](https://m2.material.io/design/iconography/animated-icons.html) —
  system-specific mechanisms and examples, not universal thresholds.
- Katie Sherwin, ["What Parallax Lacks"](https://www.nngroup.com/articles/parallax-usability/)
  (2019) — qualitative scanning, content-access and motion-sensitivity risks.
- Frederick et al., [parallax study record](https://docs.lib.purdue.edu/dissertations/AAI1544322/)
  — mixed reported outcomes; do not turn one task's result into a universal effect.
- Chevalier, Dragicevic and Franconeri, ["The Not-so-Staggering Effect of Staggered Animated Transitions on Visual Tracking"](https://www.cs.toronto.edu/~fchevali/fannydotnet/resources_pub/pdf/notsostaggering-infovis14.pdf)
  (2014) — limited/negative tracking benefits in the tested visualization task, not a
  universal sibling-entrance timing recommendation.
- WCAG 2.2, [2.3.3 Animation from Interactions](https://www.w3.org/TR/WCAG22/#animation-from-interactions)
  (AAA), [2.2.2 Pause, Stop, Hide](https://www.w3.org/TR/WCAG22/#pause-stop-hide)
  (A), and [C39](https://www.w3.org/WAI/WCAG22/Techniques/css/C39) —
  distinct normative applicability and one sufficient reduced-motion technique.
- web.dev, [animation performance](https://web.dev/articles/animations-overview) and
  [high-performance animations](https://web.dev/articles/animations-guide) —
  rendering costs, property selection and measurement rather than frame-rate guarantees.
- Saffer, *Microinteractions: Designing with Details* (O'Reilly, 2013) — trigger/rules/
  feedback/loops framework for small interaction design
- Rauno Freiberg, [Web Interface Guidelines](https://interfaces.rauno.me/) —
  practitioner timing heuristics, not experimental perceptual limits.
- Emil Kowalski, [Great Animations](https://emilkowal.ski/ui/great-animations) and
  [7 Practical Animation Tips](https://emilkowal.ski/ui/7-practical-animation-tips) —
  interruption, origin and repetition techniques; practitioner examples, not universal
  efficacy or timing experiments.
