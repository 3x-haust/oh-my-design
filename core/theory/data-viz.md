# Data visualization

A chart is an argument about data, and the encoding is the argument. `color.md` owns the
*palette* of a chart (categorical vs sequential vs diverging, colourblind safety); this file
owns everything else — which chart the question demands, whether the axes tell the truth, how
accurately the marks encode the numbers, and when not to draw a chart at all. On a `product`
surface a chart is quiet: it exists to make a decision faster, not to decorate a dashboard.

## Choose the chart from the question, not the data type

Name the question the chart answers, then pick the encoding that answers it fastest:

- **Comparison / ranking** ("which is biggest?") → bar chart, sorted by value, horizontal when
  labels are long. Not a pie: humans compare bar lengths far more accurately than pie angles.
- **Change over time** ("what is the trend?") → line chart; one line per series, direct-labelled.
  Area only when the cumulative total is the point and series stack meaningfully.
- **Part-to-whole** ("what share?") → a single stacked bar or a labelled bar set. A pie is
  tolerable only for two, at most three, slices; beyond that the eye cannot rank the wedges.
- **Distribution** ("how is it spread?") → histogram or box plot; never a bar chart of raw rows.
- **Correlation** ("does X track Y?") → scatter plot; add a trend line only when it is real.
- **Two dimensions of magnitude across categories** → heatmap or small multiples, not a 3-D bar.

If the question is "what is the exact number?", the answer is a table or a single figure, not a
chart. If the question is "is this one value good or bad right now?", the answer is one large
number with a reference (target, previous period), not a gauge or a donut.

## Axis honesty

The axis is where charts lie, usually by accident:

- **Bar charts start at zero.** A bar encodes magnitude by length; a truncated baseline
  multiplies small differences into fake drama. This is not a style choice — a non-zero bar
  baseline misreports the data.
- **Line charts may use a non-zero baseline** because a line encodes *rate of change*, not
  magnitude — but the axis must be labelled with its real range, never cropped silently to
  manufacture a slope.
- **One scale per axis.** Dual y-axes let an author align two unrelated series to imply a
  correlation that the numbers do not support; avoid them, or state the manipulation.
- **Consistent scales across small multiples.** Panels compared side by side must share an axis
  range, or the comparison the layout invites is false.
- **Time flows left to right, evenly.** Do not skip or unevenly space intervals; gaps in the
  data are shown as gaps, not closed silently.

## Encode on the channels the eye reads accurately

Cleveland & McGill (1984) ranked how accurately people decode visual channels. Prefer the top:
**position on a common scale > length > angle/slope > area > colour/saturation.** Consequences:

- Encode the primary quantity as **position or length**, not area or colour. Bubble area and
  colour intensity are for secondary, approximate dimensions only.
- **No 3-D.** Perspective distorts length and area and occludes marks; it adds no information.
- **No rainbow ramp for ordered data.** A spectral scale has no perceptual order, so the reader
  cannot tell high from low; use a single-hue sequential ramp (see `color.md` § data-viz).
- **Do not re-encode one variable twice** (length *and* colour for the same number) as
  decoration; a second channel should carry a second fact or nothing.

## Reduce non-data ink

Tufte's data-ink ratio: every pixel that is not the data is a candidate for removal. Drop the
chart junk before adding polish — heavy gridlines, boxed borders, background fills, drop
shadows on bars, redundant legends. Gridlines are faint and few; the axis line is often
unnecessary. What remains should be almost entirely the data and its labels.

## Label the insight, not just the chart

- **Direct-label series** at their end point instead of forcing a legend round-trip; a legend is
  a lookup the reader pays for on every glance.
- **State units and the reference** (per month, YoY, vs target) in the title or axis, not a
  caption the eye never reaches.
- **Annotate the "so what."** The one point that matters — the spike, the crossover, the
  threshold breach — carries a short text note. An unannotated chart makes the reader re-derive
  the insight the author already knows.
- **The title is the finding**, not the metric name: "Revenue overtook cost in Q3", not
  "Revenue and cost". A dashboard tile may keep a metric-name title when scanning is the job.

## Density: small multiples and sparklines

For many series, do not overplot one axis into spaghetti — use small multiples (a grid of the
same chart, one per series, shared scale) so each is readable and the set is comparable. In a
dense table, a **sparkline** (a word-sized trend line in the row) carries the shape of a series
without a separate chart. Both fit the high-density product register where the work object,
not the chart, is the dominant anchor.

## Register fit

On a `product`/quiet surface the chart is an instrument: minimal, labelled, decision-first, and
subordinate to the numbers and the task. On a `marketing`/showpiece surface a hero data
visualization may be expressive, but it still obeys axis honesty and channel accuracy — an
animated or stylized chart that misreports the data is a fabrication, not a flourish, and falls
under the same rule as an invented statistic (`graphics/placeholder-policy.md`). Never ship a
chart built on invented numbers; if the data is not real yet, label the chart a demo.

## Accessibility

A chart is not accessible as an image alone. Ensure the encoding does not rely on colour alone
(add labels, patterns, or direct text); keep text and mark contrast within `color.md`/WCAG
limits; and provide the underlying values in an associated table or accessible name so a
screen-reader user reaches the same facts. WCAG 2.1 §1.4.1 (Use of Colour), §1.1.1 (Non-text
Content).

## Sources

- Cleveland, W. & McGill, R. (1984). "Graphical Perception: Theory, Experimentation, and
  Application to the Development of Graphical Methods." JASA — the elementary-perceptual-task
  accuracy ranking (position > length > angle > area > colour).
- Tufte, E. (1983). *The Visual Display of Quantitative Information* — data-ink ratio, chart
  junk, the lie factor, small multiples.
- Few, S. (2012). *Show Me the Numbers* and *Information Dashboard Design* — chart selection by
  question, dashboard density, direct labelling.
- Munzner, T. (2014). *Visualization Analysis and Design* — encoding channels and effectiveness.
- Cynthia Brewer, ColorBrewer (colorbrewer2.org) — categorical/sequential/diverging, colourblind-safe.
- W3C WCAG 2.1 §1.4.1, §1.1.1 — colour is not the only channel; non-text content has a text alternative.
