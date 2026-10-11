# Filterable data table

> Candidate hypothesis only. Revalidate its condition, values, states, and responsive transition against the current composition contract; do not transfer this page recipe unchanged.

A product-surface pattern for finding and comparing records across stable properties. The work object, not decorative framing, owns the first viewport. See `core/theory/ux.md`, `core/theory/layout.md`, and `core/theory/components.md`.

## When it earns its place / When it does not

Use it when the primary task is finding and comparing records across stable properties. It should shorten the repeated loop from orientation to action to visible feedback.

Do not use it for a small list whose items do not share comparable fields. If the task can be completed with a simpler list, form, or direct navigation, choose that cheaper structure.

## Structure and grid

**1280 desktop:** use a 12-column content grid inside 32px page margins, with a 24px gutter. The sequence is Search and filters, result summary, table, pagination. The dominant work region spans the available width; supporting context may use up to four columns only when concurrent visibility changes the decision.

**390 mobile:** use one column with 16px edges. Recompose comparison or split regions into task order rather than squeezing desktop columns. Keep the frequent action visible and at least 44px high.

**320 reflow:** keep the same DOM and focus order, wrap labels, stack toolbar controls, and remove nonessential columns. No two-dimensional scroll is allowed unless the data itself needs both axes; if retained, preserve its row identifier.

Search stays above the data. Filters are visible and removable. The identifier column is sticky when horizontal comparison is unavoidable.

## Parameters

```css
:root {
  --canvas: #FFFFFF;
  --ink: #171A18;
  --muted: #626964;
  --line: #DDE2DE;
  --accent: #176B52;
  --row-h: 46px;
  --control-h: 40px;
  --page-pad: 32px;
  --region-gap: 24px;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--canvas); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
button, input { min-height: var(--control-h); font: inherit; }
button:focus-visible, input:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.recipe { max-width: 1216px; margin: 0 auto; padding: 24px var(--page-pad) 48px; }
.recipe__header { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.recipe__header h1 { margin: 0; font-size: 28px; line-height: 1.25; }
.recipe__status { margin: 4px 0 0; color: var(--muted); }
.recipe__toolbar { display: flex; gap: 12px; align-items: end; margin-block: var(--region-gap) 16px; }
.recipe__toolbar label { display: grid; gap: 6px; }
.recipe__work { min-height: calc(var(--row-h) * 6); border-top: 1px solid var(--line); }
.primary { border: 1px solid var(--accent); background: var(--accent); color: #FFFFFF; padding-inline: 16px; }
```

## Density and component anatomy

The default row height is `46px`. Controls are 40px on desktop and 44px on touch layouts. Use 8px within a control, 12px between related controls, 16px between rows or subgroups, 24px between regions, and 32px at page edges. Compact density is earned only by frequent expert scanning.

Use real `table` semantics. Left align text, right align numeric values with tabular numerals, and put sort state in `aria-sort`.

## Reachable states

- **Loading:** preserve the final geometry with row or field skeletons after 400ms; keep unaffected controls usable.
- **Empty first run:** explain what belongs here and offer the first value-producing action.
- **Filtered zero:** keep the query and filters visible, name the active constraint, and offer Clear filters.
- **Error:** preserve entered values and context, explain the failure in plain language, and provide Retry or a safe alternate path.
- **Partial:** render available data, mark unavailable regions locally, and never replace useful content with a full-screen error.
- **Permission denied:** name the unavailable action or scope, show who can grant access when known, and provide a route back.

Only states reachable in the product should ship. The distinctions above define behavior when each state is reachable.

## Keyboard behavior

Tab enters controls, then rows. Enter opens the focused record. Space toggles its checkbox. Arrow keys only move inside composite controls. Focus remains visible, and any temporary surface restores focus to its trigger. Never attach row activation to a nonfocusable container.

## Korean copy notes

Use the user's nouns and short verb endings. Prefer `검색 결과 24건` over an abstract system label. For zero results, say `검색어나 필터를 바꿔 보세요.` and name the recovery action nearby. Avoid English uppercase eyebrow labels, forced letter spacing, and noun stacks copied from database fields. Let Hangul wrap naturally; inspect 390px and 320px for clipping and one-syllable orphans. Counts, won amounts, dates, and status terms must stay unambiguous.

## Implementation

```html
<main class="recipe" aria-labelledby="page-title">
  <header class="recipe__header">
    <div>
      <h1 id="page-title">검색 결과 24건</h1>
      <p class="recipe__status" role="status">검색어나 필터를 바꿔 보세요.</p>
    </div>
    <button class="primary" type="button">Record 추가</button>
  </header>
  <section class="recipe__toolbar" aria-label="찾기 및 범위">
    <label>검색 <input type="search" name="q"></label>
    <button type="button">필터</button>
  </section>
  <section class="recipe__work" aria-label="검색 결과 24건">
    <!-- Bind real record content and reachable state regions here. -->
  </section>
</main>
```

```css
.recipe__work > :where(table, ul, form, section) { width: 100%; }
.recipe__work [data-row] { min-height: var(--row-h); }
.recipe__work [aria-current="true"],
.recipe__work [aria-selected="true"] { box-shadow: inset 3px 0 0 var(--accent); }
```

## Responsive behavior

At 1280px, preserve simultaneous context only where it improves the task. At 390px, stage the same task in one column and keep feedback adjacent to its cause. At 320px, labels wrap and secondary metadata moves below the identifier. Do not hide actions required to recover from an error or permission boundary.

```css
@media (max-width: 600px) {
  :root { --page-pad: 16px; --region-gap: 16px; --control-h: 44px; }
  .recipe { padding-top: 16px; }
  .recipe__header { align-items: stretch; flex-direction: column; gap: 12px; }
  .recipe__toolbar { align-items: stretch; flex-direction: column; }
  .recipe__toolbar input, .recipe__toolbar button, .primary { width: 100%; }
}
@media (max-width: 340px) {
  .recipe__header h1 { font-size: 22px; }
  .recipe__work { overflow-wrap: anywhere; }
}
```

## Do not combine with

Do not turn this work surface into bento tiles or KPI-card soup. Avoid hairline grids everywhere, 8-10px uppercase monospace labels, a giant hero title on a work surface, rounded-card wrappers around every unit, and title + auto subtitle on every section. Use grouping, alignment, and spacing before adding containers. One accent marks action, focus, or current state. It is not decoration.
