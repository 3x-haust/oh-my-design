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


## Map the analytical task to the view

Choose from the decision the reader must make, not from the fields available.

| Analytical task | Default view | Use when | Avoid |
| --- | --- | --- | --- |
| Lookup an exact value | Table or key figure | Exact retrieval matters | Charting one value without a reference |
| Rank categories | Sorted horizontal bars | Category order is the question | Unsorted bars, pie slices |
| Compare to target | Bullet chart, bar with target line | One measure has a meaningful goal | Gauge without scale or history |
| Change over time | Line or step line | Interval and continuity are real | Smoothed line that invents values |
| Compare actual and forecast | Solid actual plus dashed forecast, shared scale | Forecast boundary is explicit | One continuous undifferentiated line |
| Show distribution | Histogram, strip plot, box plot | Spread and outliers matter | Average alone |
| Show relationship | Scatter plot | Two quantitative variables per observation | Trend line without method or sample size |
| Show composition | Stacked bar | Parts share a meaningful whole | More than a few hard-to-compare layers |
| Show flow | Sankey only for bounded, meaningful paths | Path volume is the question | Decorative flow lines or cycles that obscure totals |
| Show geography | Map only when location drives the decision | Spatial adjacency matters | Map for state or province ranking |
| Diagnose many entities over time | Small multiples or table with sparklines | Same measure and scale repeat | Spaghetti lines |

If the task combines lookup and pattern detection, pair a chart with a table. Don't force one view to do both jobs.

## Missing data is data

Never silently connect across a missing interval. Use a gap for unknown values, a distinct mark for `0`, and a documented estimate style for imputed values. Tooltips and table fallback must say `데이터 없음`, `0`, or `추정값`, not collapse all three to a dash.

- Record the missingness reason when known: delayed ingestion, not collected, suppressed for privacy, or not applicable.
- If a whole series is missing, keep its label and explain the absence instead of removing it from the legend.
- For aggregates, state whether missing records were excluded from the denominator.
- Don't interpolate unless the analytical method permits it. Label the method and preserve original observations.

## Uncertainty and confidence

An estimate without uncertainty can look exact when it isn't. Show the interval when it changes the decision.

- Use a confidence band around a line, interval whiskers for points or bars, or a range column in a table.
- State the level and method, such as `95% confidence interval` or `forecast range, P10 to P90`.
- Keep the estimate visually stronger than the interval. The band is context, not a second series.
- Don't imply probability from a decorative blur. Boundaries, labels, and table values must remain available.
- For small samples, show `n` near the view or in the tooltip. Don't hide unstable estimates behind excess decimals.

## Forecast versus actual

Use a visible temporal boundary. Actual values use a solid stroke or full-opacity mark. Forecasts use a dashed stroke or lighter fill with the same hue, plus a label at the first forecast point. Revised forecasts retain version or publication date when decisions depend on which forecast was known at the time.

A variance view should state both amount and direction: `실적 ₩12.4억, 계획 대비 -₩0.8억 (-6.1%)`. If favorable and unfavorable depend on the metric, don't assume green always means positive arithmetic. Lower cost can be favorable while lower revenue isn't.

## Thresholds, targets, and reference values

A threshold is useful only when its source and consequence are known.

- Draw a thin reference line behind marks and label it directly: `SLA 95%`, `예산 ₩5억`.
- Distinguish a target from a hard limit and an alert threshold. They trigger different actions.
- For bands, use neutral, warning, and critical treatments with text or pattern, never color alone.
- Keep the reference stable across compared panels. A moving target can make unchanged performance appear to improve.
- If a target changes over time, chart it as its own step line and record effective dates.

## Tooltips and crosshair

Tooltips add detail but cannot carry the chart's only labels, units, or conclusion.

- Trigger by pointer hover, focus, and touch. Keep the focused mark visible.
- Show series, exact x value, exact y value, unit, status, and provenance flags such as estimate or missing.
- Use a crosshair for dense time series when aligning the same timestamp across series. Snap to real observations, not interpolated screen pixels.
- A shared tooltip is useful for up to roughly 5 visible series. Beyond that, prioritize the focused series and expose the rest in the table.
- Don't cover the selected mark or important nearby labels. Pin on click or keyboard activation when comparison needs persistence.

## Cross-filtering, brushing, and zoom

Selection must have visible scope and a reliable reset.

- Cross-filtering updates related views only when the relationship is clear. State `서울, 모바일 필터 적용` above the affected region and update result counts.
- Brushing selects a continuous range. Show start, end, count, and an accessible equivalent using inputs or a table selection.
- Zoom is for dense time or spatial data, not a substitute for a readable default range. Preserve context with an overview, reset control, or breadcrumb of ranges.
- Encode filter state in the URL when the view is shareable. Browser Back must restore the prior analytical state.
- Announce result-count changes in a polite live region. Don't move keyboard focus after every filter.

## Responsive chart transformations

Responsive design can change the encoding when shrinking would destroy the task.

| Desktop | Mobile transformation |
| --- | --- |
| Grouped vertical bars | Horizontal bars with 5 to 8 visible categories, then scroll or explicit expansion |
| Multi-series line | Focused series plus selector, or small multiples stacked vertically |
| Wide time series | Shorter default range with range control and same full-history access |
| Heatmap | Scrollable matrix with sticky labels, or ranked list for lookup tasks |
| Scatter plot | Full-width plot with fewer labels, then accessible table for exact points |
| Dashboard grid | Priority stack: alert, key comparison, trend, detail table |
| Dense table plus sparkline | Record summaries with value and trend, preserving sort and filters |

Keep the same data meaning and filter state. Don't turn a comparison into isolated cards if the user can no longer compare. Test at 320 CSS px and at 200% zoom when claimed.

## Korean numbers, dates, and units

Use locale-aware formatting, then apply domain conventions deliberately.

- Currency: `₩12,500` for compact product UI, or `12,500원` in Korean prose. Don't show decimal won values.
- Large amounts: use `만` and `억` only when approximation is acceptable. `₩1.24억` is concise but mixed notation can be awkward; prefer `1억 2,400만원` in formal summaries or `1.24억원` in analytical labels. Provide the exact amount in a tooltip or table.
- Counts: `12,430명`, `84건`, `1,205개`. Keep unit attached to the value.
- Percent: `12.4%`. Percentage-point change is `+1.8%p`, not `+1.8%`. Relative change remains `%`.
- Dates: `2026. 9. 26.` in formal Korean text, `2026.09.26` in dense tables, and `9월 26일` when year is clear. Use `14:30 KST` when timezone matters.
- Periods: label comparisons explicitly, such as `전주 대비`, `전년 동기 대비`, or `2026년 8월 대비`.
- Axes may abbreviate `0`, `5천`, `1만`, `1.5만`, but don't mix `K`, `M`, `만`, and `억` in one view.
- Use tabular numerals in tables and changing counters. Keep minus signs, decimal precision, and units consistent down a column.

## Live updates

Real-time is a behavior contract, not a badge.

- Show last successful update and connection state: `14:32:08 KST 기준`, `연결 끊김, 재연결 중`.
- Preserve the reader's place. Don't reorder rows or shift axes while they are selecting, reading a tooltip, or using the keyboard.
- Batch high-frequency updates into a stable cadence appropriate to the decision. A trading view and a support queue need different cadences.
- Indicate changed values briefly without relying on motion or color alone. Reduced-motion users receive a static changed marker.
- If data becomes stale, keep the last valid values, label them stale, and expose retry. Don't replace the whole dashboard with a spinner.

## Dense dashboard composition

A dashboard is a coordinated decision surface, not a gallery of cards.

1. Put current exceptions and required actions first.
2. Group views by one decision or shared filter scope, not by chart type.
3. Use a common time range, timezone, and comparison basis unless a view declares its exception.
4. Reserve key figures for metrics that can be interpreted with a target, prior period, or status.
5. Align chart plot areas, not just outer card edges.
6. Keep one dominant analytical view per region. Supporting figures and tables should explain it.
7. Place data freshness, definitions, and filter scope where they can be checked without opening settings.
8. Avoid card nesting, decorative atmosphere, and a unique color for every tile.

A first viewport might contain 1 alert strip, 3 to 5 key figures with references, 1 dominant trend or comparison, and the start of an exception table. Treat that as a composition test, not a universal quota.

## Export

Export the user's current analytical state, not an unrelated default dataset.

- Name format, row count, filters, timezone, unit, and whether hidden columns are included before large exports.
- CSV preserves raw machine-readable values and UTF-8 Korean text. XLSX may preserve display formats. PNG and PDF need title, date range, filters, units, source, and generated timestamp.
- Include missingness and estimate flags. Don't turn formatted `1.2억` into the raw string if the exact value is available.
- For asynchronous export, provide progress, completion notification, expiry, retry, and permission checks at download time.
- Protect sensitive exports with the same row and field permissions as the screen. An export endpoint isn't a permission bypass.

## Accessible interaction

Every chart needs an equivalent way to reach its facts.

- Provide a nearby data table with caption, headers, units, and the same filter scope. It may be disclosed, but it must be keyboard and screen-reader reachable.
- Give the chart an accessible name and short summary of the main finding. Don't duplicate every point in `aria-label` when the table already does that job.
- Interactive marks enter a logical keyboard order. Arrow keys may move within a series, while Tab enters and exits the chart. Document the pattern in help text.
- A focused mark gets a visible focus indicator and the same detail as pointer hover.
- Selection, threshold, and missing states use text, shape, stroke, or pattern in addition to color.
- Zoom, brush, and reset controls are real buttons or inputs with names and current values.
- Respect reduced motion for animated transitions. Updating data must not continually steal focus or flood announcements.

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
