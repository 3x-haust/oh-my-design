# Layout — decision material

Layout is not arrangement. It is the creation of a reading order. Every layout decision
either supports that order or undermines it — and the undermining is measurable: eye-tracking
studies at NN/g show that reading order collapses to centre-of-screen fixation when no
hierarchy is established. A layout with no hierarchy is not a neutral layout; it is a layout
that tells the eye to go nowhere in particular.

---

## Gestalt principles, translated to UI decisions

Gestalt principles are not design philosophy. They are descriptions of how the visual
system actually groups and separates information. Each one produces a testable prediction
about what users will read as a unit and what they will read as separate.

**Proximity**: elements close together are read as belonging together. The decision
consequence is immediate: related content must be closer to each other than to anything
unrelated. A label at 8px from its field is a pair. The same label at 24px is ambiguous.
At 32px the eye reads them as separate elements — the association breaks.

Müller-Brockmann's grid systems codify this: the internal gap of a component should be
smaller than the external gap between components. If your cards have 24px of internal
padding and 24px of gutter between them, the eye cannot tell where one card ends and the
next begins. Reduce internal padding or increase the gutter — one of the two.

**Similarity**: elements that look the same are read as belonging to the same category.
The consequence: things that serve the same function must share a visual attribute; things
that serve different functions must not. A row of feature cards with identical visual
treatment says "these are all the same kind of thing." If they are not, you have lied to
the reader. If your product has primary and secondary features, they must look different
— different weight, scale, or treatment.

**Closure**: the eye completes implied shapes. The consequence: borders are not required to
group content. A card without a border is still a card if the surrounding space creates the
boundary. This is how white space becomes structural: the negative space defines the
container as clearly as a border would, without the visual weight and grid noise that a
border introduces. Prefer space over borders wherever density allows.

**Common fate**: elements moving together are read as belonging together. The consequence:
staggered animations should only be applied to elements that are conceptually related. A
staggered entrance on a list of items reads the list as a sequence. A staggered entrance
on a hero headline and an unrelated sidebar creates an implied relationship that does not
exist. Choreograph motion to match meaning, not to fill time.

---

## Visual hierarchy tools: the priority order

When you need to make something more important, there is a priority order among the
available tools. Using a lower-priority tool when a higher-priority one was available
is a measurable mistake. NN/g eye-tracking research (multiple studies, 2010–2022)
confirms this ranking:

**1. Size.** The single most reliable hierarchy signal. The eye goes to large elements
first, consistently, across cultures, before reading any content. If you have one thing
that matters most, it must be the largest. This is not negotiable with colour or weight.

**2. Weight** (typographic). Within a type scale, bold outranks medium outranks light.
Effective at smaller scales where size differences would be imperceptible. The weight
ladder does the hierarchy work that the scale cannot.

**3. Colour.** Hue difference is registered before shape is processed — but contrast does
the actual work. A saturated accent on a muted field draws the eye; the same accent on a
field of similar saturation disappears. Colour without contrast is not a hierarchy tool.

**4. Position.** Top-left in left-to-right languages is the F-pattern entry point. Gravity
from that point decreases toward the bottom right. Use position for hierarchy only after
size, weight, and colour have done their work — or when the scan pattern is fixed (form
fields, tables, navigation).

The common error is reaching for colour when size should be the tool — small saturated
elements competing for attention against larger unsaturated ones. The larger element wins
every time. Colour cannot override size in the reading order.

---

## Scan patterns: F and Z, and what they demand

**F-pattern scanning** (NN/g eye-tracking, text-heavy pages): users read the first line
across, then a second line across, then scan vertically down the left edge. The right
column falls out of active attention for text-dense content.

The design consequence: primary navigation and key actions belong on the left or in the
top bar, not in a right column. Body copy is left-aligned not as a style preference — it
places the start of every line at the eye's natural return point after the scan. Centred
body text disrupts the F-pattern because the return point moves on every line.

**Z-pattern scanning** (NN/g, low-density pages — typical marketing and landing pages):
the eye moves across the top, diagonally down to the lower left, then across the bottom.
The centre is where the diagonal lands and holds the most attention.

The design consequence: on a sparse marketing page, the primary CTA belongs in the path
of the Z — not necessarily at the bottom, but on the diagonal or at the end of the second
horizontal. A CTA buried in a right column violates both the F-pattern (text density) and
the Z-pattern (sparse layout). It can only succeed if everything else on the page fails to
compete.

---

## Grid and rhythm

A grid is not a constraint. It is a promise: related things are related because they share
an edge or a column. Breaking the grid is only meaningful when the deviation is singular and
intentional — a full-bleed image in an otherwise columned editorial layout announces itself
as a break precisely because everything else held the column. Break everything and you have
chaos, not drama.

Rhythm comes from repetition of interval. Müller-Brockmann in *Grid Systems in Graphic
Design* (1981) establishes that when disparate elements share a common spacing unit —
components whose padding is a multiple of 4px, gutters that are multiples of 8px — they
read as part of the same composition even at very different scales. The shared rhythm is
what makes a design feel like a system rather than a collection of decisions.

The practical consequence: declare a spacing scale (4px base, multiples of 4) and treat
deviations as errors, not decisions. A component with `padding: 14px` is not an exception
with a reason; it is an error with no reason. The reason to use 14px instead of 12 or 16
does not exist.

---

## Von Restorff and the one memorable thing

Von Restorff (1933, replicated consistently since) documented that an item differing from
its surroundings is more reliably remembered than items that fit in. The effect is large and
robust — it is how human memory works, not a design trick that sometimes applies.

The design consequence: every page should have exactly one element that breaks the
pattern — one thing that is remembered. A pricing table where the "recommended" plan is
visually distinct uses von Restorff correctly: the eye finds it, remembers it, and the
page has done its job. A page where every section has a different background colour uses
it incorrectly: the exceptions eliminate each other, and nothing is remembered because
everything was trying to be remembered.

This is the mechanism behind the "one memorable thing" commitment in the concept step.
Without a single thing that breaks the pattern, the page is a sequence of equally
forgettable elements. The von Restorff effect is the reason that commitment produces actual
memory retention, and the reason that anything beyond one memorable thing produces none.

---

## The 8pt grid: practical application and real exceptions

The 8pt (or 8dp on Android) grid is the spacing system used by Material Design and adopted
widely across design systems. Every spacing value is a multiple of 8: 8, 16, 24, 32, 40,
48. The reason is mechanical: most screen densities are divisible by 8, so 8pt values
render at exact pixel boundaries without subpixel rendering.

The 4pt sub-grid handles situations where 8pt is too coarse. Icon internal padding, small
badge offsets, the gap between an icon and an adjacent label — these fine-grained
relationships often land at 4 or 12px, not 8 or 16. Material Design explicitly specifies
the 4dp sub-grid for these cases. The rule is: reach for 8pt first; when 8pt is too large,
use 4pt; never use a value that divides by neither.

**Real exceptions exist.** A 1px border is not a violation — it is literally not divisible
by 4, and requiring a 4px border to maintain grid purity would be visibly wrong. Component
anatomy sometimes demands specific values: a tag's inner padding at 6px horizontal may
read better than 4px (too tight) or 8px (too loose). The rule is not "every value must be
a multiple of 8" — it is "every value must have a reason that could not be 8 or 4." A
component at 14px padding has no such reason; at 6px, the reason is "8 is too much for
this density level."

Condition → choice → reason: before choosing any spacing value that is not on the 8pt
grid, name the reason it cannot be 8 or 4. If the reason exists, the exception is
legitimate. If the reason is "it just looked right," it is an error.

---

## Responsive breakpoints: content-based vs device-based

Two strategies for defining breakpoints:

**Device-based breakpoints** match common hardware screen widths: 320px (small phone),
375px (standard phone), 768px (tablet), 1024px (laptop), 1280px and 1440px (desktop).
The advantage is predictability — the design is tested against known device classes. The
disadvantage is that the layout breaks at those device boundaries, not at the point where
the content actually breaks.

**Content-based breakpoints** add a breakpoint exactly when the content would otherwise
break — when a three-column layout starts crowding at 900px, the breakpoint is 900px.
This produces fewer but more intentional breakpoints that align with what the content
actually needs rather than what devices happen to measure.

In practice: start with three device-class breakpoints (375px / 768px / 1280px) as the
structural skeleton, then add content-based breakpoints for specific components that need
earlier or later adjustment. Never add a breakpoint to accommodate a device; add one
because the content demanded it.

The error is the opposite: designing for the popular device widths only and discovering
that the layout breaks at 600px — a real viewport on smaller tablets and large phones in
landscape — because no one tested it.

---

## Card UI: the traps

Cards are the default layout unit of modern UI design, and the defaults produce three
predictable failures:

**Three identical cards.** When three feature cards have identical visual treatment —
same size, same typography, same elevation, same imagery proportion — the layout says
"these three things are equally important." If they are not, the card layout lied. The
solution is not to redesign every card; it is to differentiate the hierarchy within the
set: one card slightly larger, or one presented differently. Three identical anything is
a confession that nobody decided what matters most.

**Card without content hierarchy.** A card is a container for related information, not
a frame for arbitrary content. Every card must have an internal hierarchy: one primary
piece of information (title, metric, image) that the eye finds first, and secondary
information that serves it. A card where the image, the title, the tag, and the CTA are
all the same visual weight produces a card that cannot be scanned — the user reads the
whole thing on every pass.

**Too much border.** Cards often carry borders, shadows, and background colour
simultaneously. The three signals do the same work — they all say "this is a unit." Pick
the strongest signal and drop the others. Shadow without border reads as elevation.
Background colour without border reads as grouping. Both together with a border reads as
noise.

---

## Form layout: the research findings

Forms are the point where users give information in exchange for value. Layout decisions
change whether they complete that exchange.

**Single-column layouts outperform multi-column layouts** by a measurable margin. A study
by CXL Institute found participants completed single-column forms an average of 15.4 seconds
faster than equivalent multi-column forms — a statistically significant difference at 95%
confidence. The reason: multiple columns interrupt the vertical flow. The eye must
decide at each row whether to continue down or move across; that decision is cognitive work
that single-column design eliminates entirely.

The exception: short, logically grouped field clusters — City, State, ZIP code — may
legitimately share a row because their relationship is obvious and the grouping itself
conveys meaning. The rule is not "no multi-column"; it is "do not use multiple columns to
pack more fields on screen without a semantic reason."

**Top-aligned labels are faster to complete.** Eye-tracking research (NN/g, Luke Wroblewski,
*Web Form Design*, 2008) shows that top-aligned labels produce roughly 50% faster
completion times than left-aligned labels at the same form length. The reason is gaze
movement: with top-aligned labels, the eye makes a single straight-down path (label →
field → label → field). Left-aligned labels require horizontal saccades between the label
column and the field column — the eye zigzags rather than reads linearly.

Left-aligned labels have one legitimate use: when vertical space is constrained and the
form must communicate the relationship between a long label text and its field without
obscuring the label under the input.

---

## Empty states, loading screens, and error pages

These three states are where designed work most commonly becomes undesigned work. Each has
a specific job.

**Empty state** is not a blank screen. A blank screen says "there is nothing here" — which
may be true but is not useful. An empty state tells the user what could be here, how to
make it so, and confirms they are in the right place. The three elements of a useful empty
state: a clear description of what this space is for, a primary action that creates the
first item, and a visual or illustrative element that communicates the expected filled state.
An empty state with only an illustration and no action is decoration. An empty state with
only an action and no description is a dead end for users who arrived from the wrong path.

**Loading state** must communicate progress, not just activity. A spinner says "the system
is working." A skeleton screen says "here is what is coming — the structure is already
committed." Research comparing the two shows skeleton screens are perceived as faster even
at the same actual load time: the structural preview reduces uncertainty about what will
appear. Use spinners for short, indeterminate waits where no structural preview is possible
(file upload, authentication). Use skeleton screens for page-level content loads where the
layout is known in advance.

**Error page** must contain three things: what happened (stated plainly, not apologetically),
why it happened (if the user can affect it), and what to do next (a concrete action — not
just a Back button). An error page that says only "Something went wrong" has transferred
the problem from the system to the user without providing any means to resolve it.

---

## Information density: the spectrum

Information density is a design decision, not an accident of how much content was added.
The appropriate density depends on the user, the task, and the domain.

**High density (Bloomberg Terminal model)**: maximum information per screen area. Requires
trained users who have invested in learning the interface. The interaction cost of learning
the density is accepted because the return on information speed is high. Never appropriate
for onboarding, consumer apps, or infrequent-use tools — the cognitive overhead destroys
the value proposition.

**Medium density (Notion, Linear model)**: deliberate whitespace as structure, not as
decoration. Enough density to show related information in context; enough space to parse
the hierarchy without training. Appropriate for productivity tools whose users are willing
to invest moderate learning for moderate speed.

**Low density (Dropbox Paper, Apple Notes model)**: space is the statement. The absence of
density signals that the content is the point, not the tool around it. Appropriate for
writing tools, reading experiences, any product where cognitive presence of the UI is
a failure. Whitespace here is not wasted; it is the product.

The common error is adding density to a low-density product to show that "there is a lot
here." More density does not signal value; it signals noise. The appropriate density for
a product is the density that disappears — the one where the user is aware of the content
and unaware of the interface.

---

## Sources

- Müller-Brockmann, *Grid Systems in Graphic Design* (1981) — grid, rhythm, proximity
  applied to typographic and visual composition
- NN/g eye-tracking studies (2010–2022) — F-pattern, Z-pattern, visual hierarchy ranking
  across audience types and content densities
- von Restorff, "Über die Wirkung von Bereichsbildungen im Spurenfeld" (1933) — isolation
  effect, distinctiveness and memory retention
- Wertheimer and the Gestalt school (1920s–1930s) — original perceptual grouping
  principles: proximity, similarity, closure, common fate
- Material Design 3 (2023) — 8dp grid specification, 4dp sub-grid, responsive layout grid
- CXL Institute, "Form Field Usability: Should You Use Single or Multi-Column Forms?" —
  15.4-second single-column advantage at 95% statistical confidence
- Wroblewski, *Web Form Design* (2008) — label position research, top-aligned vs
  left-aligned completion time
- NN/g, "Website Forms Usability: Top 10 Recommendations" — form layout best practices
